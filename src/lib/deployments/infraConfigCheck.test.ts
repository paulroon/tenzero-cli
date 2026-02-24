import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { evaluateInfraConfigReadiness } from "@/lib/deployments/infraConfigCheck";

const tmpRoots: string[] = [];

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-infra-check-"));
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

describe("infra config readiness", () => {
  test("returns not ready when no tf files exist", () => {
    const root = createRoot();
    const result = evaluateInfraConfigReadiness(root);
    expect(result.ready).toBe(false);
    expect(result.tfFiles.length).toBe(0);
    expect(result.searchedPaths.length).toBeGreaterThan(0);
  });

  test("detects tf files in .tz/infra path", () => {
    const root = createRoot();
    const infraPath = join(root, ".tz", "infra", "prod");
    mkdirSync(infraPath, { recursive: true });
    writeFileSync(join(infraPath, "main.tf"), 'terraform {}\n', "utf-8");

    const result = evaluateInfraConfigReadiness(root);
    expect(result.ready).toBe(true);
    expect(result.tfFiles.some((file) => file.endsWith("main.tf"))).toBe(true);
  });
});
