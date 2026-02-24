import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveProjectConfig } from "@/lib/config/project";
import { evaluateProjectDeleteGuard } from "@/lib/deployments/deleteGuard";

const tmpRoots: string[] = [];

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-delete-guard-"));
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

describe("project delete guard", () => {
  test("allows delete when no provider-backed env evidence exists", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);

    const result = evaluateProjectDeleteGuard(projectPath);
    expect(result.allowed).toBe(true);
    expect(result.blocks.length).toBe(0);
  });

  test("blocks delete when apply succeeded without destroy", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);
    saveProjectConfig(projectPath, {
      name: "demo-project",
      type: "other",
      deploymentRunHistory: [
        {
          id: "run_apply",
          environmentId: "test",
          action: "apply",
          status: "success",
          startedAt: "2026-02-22T00:00:00.000Z",
          finishedAt: "2026-02-22T00:01:00.000Z",
          createdAt: "2026-02-22T00:01:00.000Z",
          expiresAt: "2026-03-24T00:01:00.000Z",
        },
      ],
      deploymentState: {
        environments: {
          test: {
            lastStatus: "healthy",
          },
        },
      },
    });

    const result = evaluateProjectDeleteGuard(projectPath);
    expect(result.allowed).toBe(false);
    expect(result.blocks.length).toBe(1);
    expect(result.blocks[0]?.environmentId).toBe("test");
    expect(result.blocks[0]?.remediation).toContain("Infra Environments");
  });

  test("allows delete after successful destroy after apply", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);
    saveProjectConfig(projectPath, {
      name: "demo-project",
      type: "other",
      deploymentRunHistory: [
        {
          id: "run_apply",
          environmentId: "test",
          action: "apply",
          status: "success",
          startedAt: "2026-02-22T00:00:00.000Z",
          finishedAt: "2026-02-22T00:01:00.000Z",
          createdAt: "2026-02-22T00:01:00.000Z",
          expiresAt: "2026-03-24T00:01:00.000Z",
        },
        {
          id: "run_destroy",
          environmentId: "test",
          action: "destroy",
          status: "success",
          startedAt: "2026-02-22T01:00:00.000Z",
          finishedAt: "2026-02-22T01:01:00.000Z",
          createdAt: "2026-02-22T01:01:00.000Z",
          expiresAt: "2026-03-24T01:01:00.000Z",
        },
      ],
      deploymentState: {
        environments: {
          test: {
            lastStatus: "unknown",
          },
        },
      },
    });

    const result = evaluateProjectDeleteGuard(projectPath);
    expect(result.allowed).toBe(true);
    expect(result.blocks.length).toBe(0);
  });

  test("blocks delete when active lock exists", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);
    saveProjectConfig(projectPath, {
      name: "demo-project",
      type: "other",
      deploymentState: {
        environments: {
          prod: {
            activeLock: {
              runId: "run_lock",
              acquiredAt: "2026-02-22T00:00:00.000Z",
            },
          },
        },
      },
    });

    const result = evaluateProjectDeleteGuard(projectPath);
    expect(result.allowed).toBe(false);
    expect(result.blocks[0]?.reason).toContain("active deployment lock");
  });

  test("uses in-app remediation guidance", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);
    saveProjectConfig(projectPath, {
      name: "demo-project",
      type: "other",
      environmentOutputs: {
        prod: {
          DATABASE_URL: {
            key: "DATABASE_URL",
            type: "secret_ref",
            secretRef: "secret://prod-db",
            source: "providerOutput",
            version: 1,
            createdAt: "2026-02-22T00:00:00.000Z",
            updatedAt: "2026-02-22T00:00:00.000Z",
          },
        },
      },
    });

    const result = evaluateProjectDeleteGuard(projectPath);
    expect(result.allowed).toBe(false);
    expect(result.blocks[0]?.environmentId).toBe("prod");
    expect(result.blocks[0]?.remediation).toContain("Destroy environment");
  });

  test("allows delete when only failed status exists without apply success", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);
    saveProjectConfig(projectPath, {
      name: "demo-project",
      type: "other",
      deploymentState: {
        environments: {
          prod: {
            lastStatus: "failed",
          },
        },
      },
      deploymentRunHistory: [
        {
          id: "run_report_failed",
          environmentId: "prod",
          action: "report",
          status: "failed",
          startedAt: "2026-02-22T00:00:00.000Z",
          finishedAt: "2026-02-22T00:00:10.000Z",
          createdAt: "2026-02-22T00:00:10.000Z",
          expiresAt: "2026-03-24T00:00:10.000Z",
        },
      ],
    });

    const result = evaluateProjectDeleteGuard(projectPath);
    expect(result.allowed).toBe(true);
    expect(result.blocks.length).toBe(0);
  });

  test("allows delete when only healthy status exists without apply success", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);
    saveProjectConfig(projectPath, {
      name: "demo-project",
      type: "other",
      deploymentState: {
        environments: {
          prod: {
            lastStatus: "healthy",
          },
        },
      },
      deploymentRunHistory: [
        {
          id: "run_report_ok",
          environmentId: "prod",
          action: "report",
          status: "success",
          startedAt: "2026-02-22T00:00:00.000Z",
          finishedAt: "2026-02-22T00:00:10.000Z",
          createdAt: "2026-02-22T00:00:10.000Z",
          expiresAt: "2026-03-24T00:00:10.000Z",
        },
      ],
    });

    const result = evaluateProjectDeleteGuard(projectPath);
    expect(result.allowed).toBe(true);
    expect(result.blocks.length).toBe(0);
  });
});
