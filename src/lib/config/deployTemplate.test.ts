import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadDeployTemplateConfigWithError } from "@/lib/config/deployTemplate";

const tmpRoots: string[] = [];

function createTmpTemplateRoot(): { root: string; configPath: string } {
  const root = mkdtempSync(join(tmpdir(), "tz-deploy-template-"));
  tmpRoots.push(root);
  mkdirSync(root, { recursive: true });
  const configPath = join(root, "config.yaml");
  writeFileSync(configPath, "label: Test App\ntype: nextjs\n", "utf-8");
  return { root, configPath };
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (!root) continue;
    rmSync(root, { recursive: true, force: true });
  }
});

describe("deploy template config", () => {
  test("returns missing when deploy.yaml does not exist", () => {
    const { configPath } = createTmpTemplateRoot();
    const result = loadDeployTemplateConfigWithError(configPath);
    expect(result.exists).toBe(false);
    expect(result.config).toBeNull();
  });

  test("loads valid deploy.yaml with provider-aware presets", () => {
    const { root, configPath } = createTmpTemplateRoot();
    writeFileSync(
      join(root, "deploy.yaml"),
      [
        'version: "2"',
        "providers:",
        "  - id: aws-primary",
        "    driver:",
        "      type: opentofu",
        "      entry: deployments/opentofu/main.tf",
        "environments:",
        "  - id: prod",
        "    label: Production",
        "    provider: aws-primary",
        "    capabilities: [appRuntime, envConfig]",
        "    constraints:",
        "      appPort: 9000",
        "    outputs:",
        "      - key: APP_BASE_URL",
        "        type: string",
        "presets:",
        "  - id: cheap-and-cheerful",
        "    label: Cheap and cheerful",
        "    description: Lowest cost profile.",
        "    environments: [prod]",
        "    constraints:",
        "      appRunnerCpu: 1024",
        "      appRunnerMemory: 2048",
      ].join("\n"),
      "utf-8"
    );
    const result = loadDeployTemplateConfigWithError(configPath);
    expect(result.exists).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.config?.version).toBe("2");
    expect(result.config?.providers[0]?.id).toBe("aws-primary");
    expect(result.config?.environments[0]?.id).toBe("prod");
    expect(result.config?.presets[0]?.id).toBe("cheap-and-cheerful");
  });

  test("fails when preset references unknown environment", () => {
    const { root, configPath } = createTmpTemplateRoot();
    writeFileSync(
      join(root, "deploy.yaml"),
      [
        'version: "2"',
        "providers:",
        "  - id: aws-primary",
        "    driver:",
        "      type: opentofu",
        "      entry: deployments/opentofu/main.tf",
        "environments:",
        "  - id: prod",
        "    label: Production",
        "    provider: aws-primary",
        "    capabilities: [appRuntime]",
        "    constraints: {}",
        "    outputs: []",
        "presets:",
        "  - id: p1",
        "    label: Preset 1",
        "    description: desc",
        "    environments: [uat]",
        "    constraints: {}",
      ].join("\n"),
      "utf-8"
    );
    const result = loadDeployTemplateConfigWithError(configPath);
    expect(result.config).toBeNull();
    expect(result.error).toContain("references unknown environment 'uat'");
  });

  test("fails when no compatible preset exists for environment/provider", () => {
    const { root, configPath } = createTmpTemplateRoot();
    writeFileSync(
      join(root, "deploy.yaml"),
      [
        'version: "2"',
        "providers:",
        "  - id: aws-primary",
        "    driver:",
        "      type: opentofu",
        "      entry: deployments/opentofu/main.tf",
        "  - id: do-primary",
        "    driver:",
        "      type: opentofu",
        "      entry: deployments/opentofu/main.tf",
        "environments:",
        "  - id: prod",
        "    label: Production",
        "    provider: aws-primary",
        "    capabilities: [appRuntime]",
        "    constraints: {}",
        "    outputs: []",
        "presets:",
        "  - id: p1",
        "    label: Preset 1",
        "    description: desc",
        "    provider: do-primary",
        "    environments: [prod]",
        "    constraints: {}",
      ].join("\n"),
      "utf-8"
    );
    const result = loadDeployTemplateConfigWithError(configPath);
    expect(result.config).toBeNull();
    expect(result.error).toContain("no compatible preset found for environment 'prod'");
  });
});
