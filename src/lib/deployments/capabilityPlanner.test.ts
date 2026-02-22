import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveProjectConfig } from "@/lib/config/project";
import type { InfraConfig, InfraEnvironmentSpec } from "@/lib/config";
import {
  persistResolvedEnvironmentOutputs,
  planEnvironmentDeployment,
} from "@/lib/deployments/capabilityPlanner";

const tmpRoots: string[] = [];

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-capability-planner-"));
  tmpRoots.push(root);
  return root;
}

function setupProject(root: string): string {
  const projectPath = join(root, "demo-project");
  mkdirSync(projectPath, { recursive: true });
  saveProjectConfig(projectPath, {
    name: "demo-project",
    type: "other",
  });
  return projectPath;
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (!root) continue;
    rmSync(root, { recursive: true, force: true });
  }
});

describe("capability planner", () => {
  test("composes deterministic modules regardless of capability order", () => {
    const infra: InfraConfig = {
      version: "1",
      environments: [
        {
          id: "prod",
          label: "Production",
          capabilities: ["dns", "postgres", "appRuntime", "envConfig"],
          constraints: { domain: "example.com" },
          outputs: [],
        },
      ],
    };

    const plan = planEnvironmentDeployment(infra, "prod");
    expect(plan.modules.map((m) => m.capability)).toEqual([
      "appRuntime",
      "envConfig",
      "postgres",
      "dns",
    ]);
  });

  test("fails fast on unsupported capability combination", () => {
    const infra: InfraConfig = {
      version: "1",
      environments: [
        {
          id: "test",
          label: "Test",
          capabilities: ["postgres"],
          constraints: {},
          outputs: [],
        },
      ],
    };

    expect(() => planEnvironmentDeployment(infra, "test")).toThrow(
      "postgres requires appRuntime"
    );
  });

  test("fails when dns capability is missing required domain constraint", () => {
    const infra: InfraConfig = {
      version: "1",
      environments: [
        {
          id: "prod",
          label: "Production",
          capabilities: ["appRuntime", "dns"],
          constraints: {},
          outputs: [],
        },
      ],
    };

    expect(() => planEnvironmentDeployment(infra, "prod")).toThrow(
      "dns capability requires constraints.domain"
    );
  });
});

describe("output resolver mapping", () => {
  function envSpec(): InfraEnvironmentSpec {
    return {
      id: "prod",
      label: "Production",
      capabilities: ["appRuntime", "postgres", "envConfig"],
      constraints: {},
      outputs: [
        { key: "APP_BASE_URL", type: "string", required: true },
        { key: "DATABASE_URL", type: "secret_ref", required: true, sensitive: true },
        { key: "FEATURE_X_ENABLED", type: "boolean", default: false },
      ],
    };
  }

  test("persists provider outputs with typed mapping and defaults", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);

    const records = persistResolvedEnvironmentOutputs({
      projectPath,
      environment: envSpec(),
      providerOutputs: {
        APP_BASE_URL: "https://app.example.com",
        DATABASE_URL: "secret://database-url",
      },
      generatedCredentialKeys: ["DATABASE_URL"],
    });

    const appBaseUrl = records.find((r) => r.key === "APP_BASE_URL");
    const dbUrl = records.find((r) => r.key === "DATABASE_URL");
    const featureFlag = records.find((r) => r.key === "FEATURE_X_ENABLED");

    expect(appBaseUrl?.source).toBe("providerOutput");
    expect(dbUrl?.type).toBe("secret_ref");
    expect(dbUrl?.secretRef).toBe("secret://database-url");
    expect(dbUrl?.isGeneratedCredential).toBe(true);
    expect(featureFlag?.source).toBe("templateDefault");
    expect(featureFlag?.value).toBe(false);
  });

  test("fails fast on unknown provider output key", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);

    expect(() =>
      persistResolvedEnvironmentOutputs({
        projectPath,
        environment: envSpec(),
        providerOutputs: {
          APP_BASE_URL: "https://app.example.com",
          DATABASE_URL: "secret://database-url",
          UNKNOWN_KEY: "bad",
        },
      })
    ).toThrow("Unknown provider output 'UNKNOWN_KEY'");
  });

  test("fails required output when provider/default is missing", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);

    expect(() =>
      persistResolvedEnvironmentOutputs({
        projectPath,
        environment: envSpec(),
        providerOutputs: {
          APP_BASE_URL: "https://app.example.com",
        },
      })
    ).toThrow("Missing required output 'DATABASE_URL'");
  });

  test("fails on invalid typed output values", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);

    expect(() =>
      persistResolvedEnvironmentOutputs({
        projectPath,
        environment: envSpec(),
        providerOutputs: {
          APP_BASE_URL: 123,
          DATABASE_URL: "secret://database-url",
        },
      })
    ).toThrow("Output 'APP_BASE_URL' must be string");
  });
});
