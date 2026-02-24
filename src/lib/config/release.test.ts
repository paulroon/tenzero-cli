import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProjectReleaseConfigWithError } from "@/lib/config/release";

const tmpRoots: string[] = [];

function createTmpProject(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-release-config-"));
  tmpRoots.push(root);
  mkdirSync(join(root, ".tz"), { recursive: true });
  return root;
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (!root) continue;
    rmSync(root, { recursive: true, force: true });
  }
});

describe("project release config", () => {
  test("returns missing when release config file does not exist", () => {
    const projectPath = createTmpProject();
    const result = loadProjectReleaseConfigWithError(projectPath);
    expect(result.exists).toBe(false);
    expect(result.config).toBeNull();
  });

  test("loads valid release config with defaults", () => {
    const projectPath = createTmpProject();
    const path = join(projectPath, ".tz", "release.yaml");
    writeFileSync(path, "version: 1.2.3\n", "utf-8");

    const result = loadProjectReleaseConfigWithError(projectPath);
    expect(result.exists).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.config).toEqual({ version: "1.2.3", tagPrefix: "v" });
  });

  test("fails invalid semantic version", () => {
    const projectPath = createTmpProject();
    const path = join(projectPath, ".tz", "release.yaml");
    writeFileSync(path, "version: banana\n", "utf-8");

    const result = loadProjectReleaseConfigWithError(projectPath);
    expect(result.config).toBeNull();
    expect(result.error).toContain("version must be a semantic version");
  });
});
