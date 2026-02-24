import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { evaluateDeployWorkspaceReadiness } from "@/lib/deployments/deployWorkspaceCheck";

const tmpRoots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-deploy-workspace-check-"));
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

describe("deploy workspace readiness", () => {
  test("returns not ready when no tf files exist", () => {
    const root = createRoot();
    const result = evaluateDeployWorkspaceReadiness(root);
    expect(result.ready).toBe(false);
    expect(result.tfFiles.length).toBe(0);
    expect(result.searchedPaths.length).toBeGreaterThan(0);
  });

  test("detects tf files in .tz/deploy path", () => {
    const root = createRoot();
    const workspacePath = join(root, ".tz", "deploy", "prod");
    mkdirSync(workspacePath, { recursive: true });
    writeFileSync(join(workspacePath, "main.tf"), 'terraform {}\n', "utf-8");

    const result = evaluateDeployWorkspaceReadiness(root);
    expect(result.ready).toBe(true);
    expect(result.tfFiles.some((file) => file.endsWith("main.tf"))).toBe(true);
  });
});
