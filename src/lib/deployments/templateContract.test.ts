import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DeployTemplateConfig } from "@/lib/config/deployTemplate";
import { validateDeployTemplateContract } from "@/lib/deployments/templateContract";

const tmpRoots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-template-contract-"));
  tmpRoots.push(root);
  return root;
}

function createTemplateConfig(overrides?: Partial<DeployTemplateConfig>): DeployTemplateConfig {
  return {
    version: "2",
    providers: [
      {
        id: "aws-primary",
        driver: {
          type: "opentofu",
          entry: "deployments/opentofu/main.tf",
        },
      },
    ],
    environments: [
      {
        id: "prod",
        label: "Production",
        provider: "aws-primary",
        capabilities: ["appRuntime", "envConfig"],
        constraints: {},
        outputs: [
          {
            key: "APP_BASE_URL",
            type: "string",
            sensitive: false,
            rotatable: false,
            required: true,
          },
        ],
      },
    ],
    presets: [
      {
        id: "default",
        label: "Default",
        description: "default preset",
        environments: ["prod"],
        provider: "aws-primary",
        constraints: {},
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (!root) continue;
    rmSync(root, { recursive: true, force: true });
  }
});

describe("validateDeployTemplateContract", () => {
  test("passes when non-default output keys are defined in Terraform outputs", () => {
    const root = createRoot();
    const templateConfigPath = join(root, "config.yaml");
    const driverDir = join(root, "deployments", "opentofu");
    mkdirSync(driverDir, { recursive: true });
    writeFileSync(
      join(driverDir, "main.tf"),
      `output "APP_BASE_URL" {
  value = "https://prod.example.com"
}
`,
      "utf-8"
    );
    const config = createTemplateConfig();
    expect(() =>
      validateDeployTemplateContract({
        templateType: "test",
        templateConfigPath,
        deployConfig: config,
      })
    ).not.toThrow();
  });

  test("passes when output key has template default but no Terraform output", () => {
    const root = createRoot();
    const templateConfigPath = join(root, "config.yaml");
    const driverDir = join(root, "deployments", "opentofu");
    mkdirSync(driverDir, { recursive: true });
    writeFileSync(
      join(driverDir, "main.tf"),
      `output "APP_BASE_URL" {
  value = "https://prod.example.com"
}
`,
      "utf-8"
    );
    const config = createTemplateConfig({
      environments: [
        {
          id: "prod",
          label: "Production",
          provider: "aws-primary",
          capabilities: ["appRuntime", "envConfig"],
          constraints: {},
          outputs: [
            {
              key: "APP_BASE_URL",
              type: "string",
              sensitive: false,
              rotatable: false,
              required: true,
            },
            {
              key: "NODE_ENV",
              type: "string",
              sensitive: false,
              rotatable: false,
              required: false,
              default: "production",
            },
          ],
        },
      ],
    });
    expect(() =>
      validateDeployTemplateContract({
        templateType: "test",
        templateConfigPath,
        deployConfig: config,
      })
    ).not.toThrow();
  });

  test("fails when non-default output key is missing from Terraform outputs", () => {
    const root = createRoot();
    const templateConfigPath = join(root, "config.yaml");
    const driverDir = join(root, "deployments", "opentofu");
    mkdirSync(driverDir, { recursive: true });
    writeFileSync(
      join(driverDir, "main.tf"),
      `output "APP_BASE_URL" {
  value = "https://prod.example.com"
}
`,
      "utf-8"
    );
    const config = createTemplateConfig({
      environments: [
        {
          id: "prod",
          label: "Production",
          provider: "aws-primary",
          capabilities: ["appRuntime", "envConfig"],
          constraints: {},
          outputs: [
            {
              key: "APP_BASE_URL",
              type: "string",
              sensitive: false,
              rotatable: false,
              required: true,
            },
            {
              key: "NEXTAUTH_SECRET",
              type: "secret_ref",
              sensitive: true,
              rotatable: true,
              required: true,
            },
          ],
        },
      ],
    });
    expect(() =>
      validateDeployTemplateContract({
        templateType: "test",
        templateConfigPath,
        deployConfig: config,
      })
    ).toThrow("does not define Terraform outputs for: NEXTAUTH_SECRET");
  });

  test("fails when provider driver entry does not exist", () => {
    const root = createRoot();
    const templateConfigPath = join(root, "config.yaml");
    const config = createTemplateConfig();
    expect(() =>
      validateDeployTemplateContract({
        templateType: "test",
        templateConfigPath,
        deployConfig: config,
      })
    ).toThrow("driver entry not found");
  });
});
