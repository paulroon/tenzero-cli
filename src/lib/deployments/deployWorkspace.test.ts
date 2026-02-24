import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadProjectConfig, saveProjectConfig } from "@/lib/config/project";
import { getUserConfigsDir } from "@/lib/paths";
import { prepareDeployWorkspaceForEnvironment } from "@/lib/deployments/deployWorkspace";

const tmpRoots: string[] = [];
const TEST_TEMPLATE_ID = "other";
const fixtureTemplateDir = join(getUserConfigsDir(), TEST_TEMPLATE_ID);
const fixtureTemplatePath = join(fixtureTemplateDir, "config.yaml");
const fixtureDeployPath = join(fixtureTemplateDir, "deploy.yaml");
let existingTemplateBackupDir: string | null = null;
let existingTemplateBackupRoot: string | null = null;
const fixtureSource = `label: Test Template
type: other
version: "1"
pipeline:
  - type: run
    command: "echo noop"
`;
const deployFixtureSource = `version: "2"
providers:
  - id: aws-primary
    driver:
      type: opentofu
      entry: deployments/opentofu/main.tf
environments:
  - id: prod
    label: Production
    provider: aws-primary
    capabilities:
      - appRuntime
      - envConfig
      - postgres
    constraints:
      appPort: 9000
    outputs:
      - key: APP_BASE_URL
        type: string
        required: true
      - key: DATABASE_URL
        type: secret_ref
        required: true
      - key: NEXTAUTH_SECRET
        type: secret_ref
        required: true
presets:
  - id: cheap-and-cheerful
    label: Cheap and cheerful
    description: low cost
    environments: [prod]
    provider: aws-primary
    constraints:
      appRunnerCpu: 1024
      appRunnerMemory: 2048
      appRunnerMinSize: 1
      appRunnerMaxSize: 1
  - id: maximum-effort-at-a-price
    label: Maximum effort
    description: high perf
    environments: [prod]
    provider: aws-primary
    constraints:
      appRunnerCpu: 2048
      appRunnerMemory: 4096
      appRunnerMinSize: 2
      appRunnerMaxSize: 8
`;

beforeEach(() => {
  if (existsSync(fixtureTemplateDir)) {
    const backupRoot = mkdtempSync(join(tmpdir(), "tz-deploy-workspace-template-backup-"));
    const backupDir = join(backupRoot, TEST_TEMPLATE_ID);
    cpSync(fixtureTemplateDir, backupDir, { recursive: true });
    existingTemplateBackupDir = backupDir;
    existingTemplateBackupRoot = backupRoot;
    rmSync(fixtureTemplateDir, { recursive: true, force: true });
  } else {
    existingTemplateBackupDir = null;
    existingTemplateBackupRoot = null;
  }
  mkdirSync(fixtureTemplateDir, { recursive: true });
  writeFileSync(fixtureTemplatePath, fixtureSource, "utf-8");
  writeFileSync(fixtureDeployPath, deployFixtureSource, "utf-8");
});

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-deploy-workspace-"));
  tmpRoots.push(root);
  return root;
}

afterEach(() => {
  if (existsSync(fixtureTemplateDir)) {
    rmSync(fixtureTemplateDir, { recursive: true, force: true });
  }
  if (existingTemplateBackupDir && existsSync(existingTemplateBackupDir)) {
    mkdirSync(dirname(fixtureTemplateDir), { recursive: true });
    cpSync(existingTemplateBackupDir, fixtureTemplateDir, { recursive: true });
  }
  if (existingTemplateBackupRoot && existsSync(existingTemplateBackupRoot)) {
    rmSync(existingTemplateBackupRoot, { recursive: true, force: true });
  }
  existingTemplateBackupDir = null;
  existingTemplateBackupRoot = null;
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (!root) continue;
    rmSync(root, { recursive: true, force: true });
  }
});

describe("deploy workspace preparation", () => {
  test("generates env workspace files with backend-region defaulting", () => {
    const root = createRoot();
    saveProjectConfig(root, {
      name: "Materialize test app",
      type: TEST_TEMPLATE_ID,
    });

    const result = prepareDeployWorkspaceForEnvironment(root, "prod", {
      backendRegion: "eu-west-2",
    });
    const mainTfPath = result.filePaths.find((path) => path.endsWith("main.tf"));
    expect(mainTfPath).toBeDefined();
    if (!mainTfPath) return;

    const contents = readFileSync(mainTfPath, "utf-8");
    expect(contents).toContain('output "APP_BASE_URL"');
    expect(contents).toContain('output "DATABASE_URL"');
    expect(contents).toContain('output "NEXTAUTH_SECRET"');
    expect(contents).toContain('resource "aws_ecr_repository" "app"');
    expect(contents).toContain('resource "aws_ssm_parameter" "app_base_url"');
    expect(contents).toContain('resource "aws_secretsmanager_secret" "nextauth_secret"');
    expect(contents).toContain('resource "aws_secretsmanager_secret" "database_url"');
    expect(contents).toContain('variable "tz_environment_id"');
    expect(contents).toContain("tz_environment_id = var.tz_environment_id");
    expect(contents).toContain('\\"region\\":\\"eu-west-2\\"');
  });

  test("fails fast when env does not exist", () => {
    const root = createRoot();
    saveProjectConfig(root, {
      name: "Missing env app",
      type: TEST_TEMPLATE_ID,
    });

    expect(() => prepareDeployWorkspaceForEnvironment(root, "uat")).toThrow(
      "Environment 'uat' is not defined"
    );
  });

  test("fails when deploy.yaml is missing for the template", () => {
    const root = createRoot();
    saveProjectConfig(root, {
      name: "Missing deploy template app",
      type: TEST_TEMPLATE_ID,
    });
    rmSync(fixtureDeployPath, { force: true });

    expect(() => prepareDeployWorkspaceForEnvironment(root, "prod")).toThrow(
      "has no deploy.yaml definition"
    );
  });

  test("enables app runtime when a release is selected", () => {
    const root = createRoot();
    saveProjectConfig(root, {
      name: "Release selected app",
      type: TEST_TEMPLATE_ID,
      releaseState: {
        environments: {
          prod: {
            selectedReleaseTag: "v0.1.2",
            selectedImageRef:
              "206414186603.dkr.ecr.eu-west-2.amazonaws.com/tz-app-prod@sha256:abc123",
          },
        },
      },
    });

    const result = prepareDeployWorkspaceForEnvironment(root, "prod", {
      backendRegion: "eu-west-2",
    });
    const mainTfPath = result.filePaths.find((path) => path.endsWith("main.tf"));
    expect(mainTfPath).toBeDefined();
    if (!mainTfPath) return;

    const contents = readFileSync(mainTfPath, "utf-8");
    expect(contents).toContain('\\"enableAppRunner\\":true');
    expect(contents).toContain(
      '\\"appImageTag\\":\\"v0.1.2\\"'
    );
    expect(contents).toContain(
      '\\"appImageIdentifier\\":\\"206414186603.dkr.ecr.eu-west-2.amazonaws.com/tz-app-prod@sha256:abc123\\"'
    );
  });

  test("applies selected deploy preset constraint overrides", () => {
    const root = createRoot();
    saveProjectConfig(root, {
      name: "Preset selected app",
      type: TEST_TEMPLATE_ID,
      releaseState: {
        environments: {
          prod: {
            selectedDeployPresetId: "maximum-effort-at-a-price",
          },
        },
      },
    });

    const result = prepareDeployWorkspaceForEnvironment(root, "prod", {
      backendRegion: "eu-west-2",
    });
    const mainTfPath = result.filePaths.find((path) => path.endsWith("main.tf"));
    expect(mainTfPath).toBeDefined();
    if (!mainTfPath) return;
    const contents = readFileSync(mainTfPath, "utf-8");
    expect(contents).toContain('\\"appRunnerCpu\\":2048');
    expect(contents).toContain('\\"appRunnerMemory\\":4096');
    expect(contents).toContain('\\"appRunnerMinSize\\":2');
    expect(contents).toContain('\\"appRunnerMaxSize\\":8');
  });

  test("auto-selects and persists default deploy preset when not set", () => {
    const root = createRoot();
    saveProjectConfig(root, {
      name: "Preset default app",
      type: TEST_TEMPLATE_ID,
    });

    prepareDeployWorkspaceForEnvironment(root, "prod", {
      backendRegion: "eu-west-2",
    });

    const updated = loadProjectConfig(root);
    expect(updated?.releaseState?.environments?.prod?.selectedDeployPresetId).toBe(
      "cheap-and-cheerful"
    );
  });
});
