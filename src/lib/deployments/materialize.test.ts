import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { saveProjectConfig } from "@/lib/config/project";
import { getUserConfigsDir } from "@/lib/paths";
import { materializeInfraForEnvironment } from "@/lib/deployments/materialize";

const tmpRoots: string[] = [];
const TEST_TEMPLATE_ID = "nextjs";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..", "..");
const sourceTemplatePath = join(repoRoot, "tz-project-config", "nextjs", "config.yaml");
const fixtureTemplateDir = join(getUserConfigsDir(), TEST_TEMPLATE_ID);
const fixtureTemplatePath = join(fixtureTemplateDir, "config.yaml");
let existingTemplateBackupDir: string | null = null;

beforeEach(() => {
  const fixtureSource = readFileSync(sourceTemplatePath, "utf-8");
  if (existsSync(fixtureTemplateDir)) {
    const backupRoot = mkdtempSync(join(tmpdir(), "tz-materialize-template-backup-"));
    const backupDir = join(backupRoot, TEST_TEMPLATE_ID);
    cpSync(fixtureTemplateDir, backupDir, { recursive: true });
    existingTemplateBackupDir = backupDir;
    tmpRoots.push(backupRoot);
    rmSync(fixtureTemplateDir, { recursive: true, force: true });
  } else {
    existingTemplateBackupDir = null;
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
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (!root) continue;
    rmSync(root, { recursive: true, force: true });
  }
  if (existsSync(fixtureTemplateDir)) {
    rmSync(fixtureTemplateDir, { recursive: true, force: true });
  }
  if (existingTemplateBackupDir && existsSync(existingTemplateBackupDir)) {
    mkdirSync(dirname(fixtureTemplateDir), { recursive: true });
    cpSync(existingTemplateBackupDir, fixtureTemplateDir, { recursive: true });
    existingTemplateBackupDir = null;
  }
});

describe("infra materialization", () => {
  test("generates env workspace files with backend-region defaulting", () => {
    const root = createRoot();
    saveProjectConfig(root, {
      name: "Materialize test app",
      type: "nextjs",
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
      type: "nextjs",
    });

    expect(() => materializeInfraForEnvironment(root, "uat")).toThrow(
      "Environment 'uat' is not defined"
    );
  });
});
