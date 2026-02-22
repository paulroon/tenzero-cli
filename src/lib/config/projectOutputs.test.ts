import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getProjectEnvironmentOutputs,
  saveProjectConfig,
  upsertProjectEnvironmentOutputs,
} from "@/lib/config/project";

const tmpRoots: string[] = [];

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-project-outputs-"));
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

function setupProject(root: string): string {
  const projectPath = join(root, "demo-project");
  mkdirSync(projectPath, { recursive: true });
  saveProjectConfig(projectPath, {
    name: "demo-project",
    type: "other",
  });
  return projectPath;
}

describe("project environment outputs persistence", () => {
  test("persists and loads outputs by environment", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);

    upsertProjectEnvironmentOutputs(projectPath, "test", [
      {
        key: "APP_BASE_URL",
        type: "string",
        value: "https://test.example.com",
        source: "providerOutput",
      },
    ]);

    const outputs = getProjectEnvironmentOutputs(projectPath, "test");
    expect(outputs.length).toBe(1);
    expect(outputs[0]?.key).toBe("APP_BASE_URL");
    expect(outputs[0]?.type).toBe("string");
    expect(outputs[0]?.value).toBe("https://test.example.com");
    expect(outputs[0]?.version).toBe(1);
  });

  test("applies precedence manualOverride > providerOutput > templateDefault", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);

    upsertProjectEnvironmentOutputs(projectPath, "test", [
      {
        key: "APP_BASE_URL",
        type: "string",
        value: "https://default.example.com",
        source: "templateDefault",
      },
    ]);

    upsertProjectEnvironmentOutputs(projectPath, "test", [
      {
        key: "APP_BASE_URL",
        type: "string",
        value: "https://provider.example.com",
        source: "providerOutput",
      },
    ]);

    // Lower precedence update should be ignored.
    upsertProjectEnvironmentOutputs(projectPath, "test", [
      {
        key: "APP_BASE_URL",
        type: "string",
        value: "https://fallback.example.com",
        source: "templateDefault",
      },
    ]);

    // Higher precedence update should apply.
    upsertProjectEnvironmentOutputs(projectPath, "test", [
      {
        key: "APP_BASE_URL",
        type: "string",
        value: "https://manual.example.com",
        source: "manualOverride",
      },
    ]);

    const outputs = getProjectEnvironmentOutputs(projectPath, "test");
    expect(outputs[0]?.value).toBe("https://manual.example.com");
    expect(outputs[0]?.source).toBe("manualOverride");
  });

  test("blocks manual overrides for generated credentials", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);

    upsertProjectEnvironmentOutputs(projectPath, "prod", [
      {
        key: "DATABASE_URL",
        type: "secret_ref",
        secretRef: "secret://database-url",
        source: "providerOutput",
        isGeneratedCredential: true,
      },
    ]);

    expect(() =>
      upsertProjectEnvironmentOutputs(projectPath, "prod", [
        {
          key: "DATABASE_URL",
          type: "secret_ref",
          secretRef: "secret://manual-override",
          source: "manualOverride",
        },
      ])
    ).toThrow("Manual override is not allowed for generated credential");
  });

  test("increments version on effective updates", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);

    upsertProjectEnvironmentOutputs(projectPath, "test", [
      {
        key: "FEATURE_ENABLED",
        type: "boolean",
        value: true,
        source: "templateDefault",
      },
    ]);

    upsertProjectEnvironmentOutputs(projectPath, "test", [
      {
        key: "FEATURE_ENABLED",
        type: "boolean",
        value: false,
        source: "providerOutput",
      },
    ]);

    const outputs = getProjectEnvironmentOutputs(projectPath, "test");
    expect(outputs[0]?.version).toBe(2);
  });

  test("rejects type changes for existing output key", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);

    upsertProjectEnvironmentOutputs(projectPath, "test", [
      {
        key: "PORT",
        type: "number",
        value: 3000,
        source: "templateDefault",
      },
    ]);

    expect(() =>
      upsertProjectEnvironmentOutputs(projectPath, "test", [
        {
          key: "PORT",
          type: "string",
          value: "3000",
          source: "providerOutput",
        },
      ])
    ).toThrow("Cannot change output type");
  });
});
