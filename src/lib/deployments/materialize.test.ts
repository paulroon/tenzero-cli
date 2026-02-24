import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveProjectConfig } from "@/lib/config/project";
import { materializeInfraForEnvironment } from "@/lib/deployments/materialize";

const tmpRoots: string[] = [];

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
