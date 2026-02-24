import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { saveProjectConfig } from "@/lib/config/project";
import { getUserConfigsDir } from "@/lib/paths";
import { materializeInfraForEnvironment } from "@/lib/deployments/materialize";

const tmpRoots: string[] = [];
const TEST_TEMPLATE_ID = "other";
const fixtureTemplateDir = join(getUserConfigsDir(), TEST_TEMPLATE_ID);
const fixtureTemplatePath = join(fixtureTemplateDir, "config.yaml");
let existingTemplateBackupDir: string | null = null;
let existingTemplateBackupRoot: string | null = null;
const fixtureSource = `label: Test Template
type: other
version: "1"
pipeline:
  - type: run
    command: "echo noop"
infra:
  version: "1"
  environments:
    - id: prod
      label: Production
      capabilities:
        - appRuntime
        - envConfig
        - postgres
      constraints:
        enableAppRunner: false
      outputs:
        - key: APP_BASE_URL
          type: string
        - key: DATABASE_URL
          type: secret_ref
        - key: NEXTAUTH_SECRET
          type: secret_ref
`;

beforeEach(() => {
  if (existsSync(fixtureTemplateDir)) {
    const backupRoot = mkdtempSync(join(tmpdir(), "tz-materialize-template-backup-"));
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
});

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-materialize-"));
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

describe("infra materialization", () => {
  test("generates env workspace files with backend-region defaulting", () => {
    const root = createRoot();
    saveProjectConfig(root, {
      name: "Materialize test app",
      type: TEST_TEMPLATE_ID,
    });

    const result = materializeInfraForEnvironment(root, "prod", {
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

    expect(() => materializeInfraForEnvironment(root, "uat")).toThrow(
      "Environment 'uat' is not defined"
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

    const result = materializeInfraForEnvironment(root, "prod", {
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
});
