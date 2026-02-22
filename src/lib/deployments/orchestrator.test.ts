import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { TzConfig } from "@/lib/config";
import { loadProjectConfig, saveProjectConfig } from "@/lib/config/project";
import {
  forceUnlockEnvironment,
  runApply,
  runPlan,
  runReport,
  type DeployAdapter,
} from "@/lib/deployments/orchestrator";
import { listDeploymentRunHistory } from "@/lib/deployments/runHistory";

const tmpRoots: string[] = [];

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-orchestrator-"));
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

function enabledConfig(): TzConfig {
  return {
    name: "Tester",
    email: "tester@example.com",
    projectDirectory: "/tmp/projects",
    projects: [],
    deployments: { enabled: true },
  };
}

const stubAdapter: DeployAdapter = {
  async plan() {
    return {
      status: "healthy",
      summary: { add: 1, change: 0, destroy: 0 },
      driftDetected: false,
      logs: ["plan ok"],
    };
  },
  async apply() {
    return {
      status: "healthy",
      summary: { add: 0, change: 1, destroy: 0 },
      logs: ["apply ok"],
    };
  },
  async report() {
    return {
      status: "healthy",
      driftDetected: false,
      logs: ["report ok"],
    };
  },
};

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (!root) continue;
    rmSync(root, { recursive: true, force: true });
  }
});

describe("deployments orchestrator", () => {
  test("happy path plan -> apply persists run history", async () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);
    const config = enabledConfig();

    await runPlan(config, projectPath, "test", stubAdapter, {
      nowIso: "2026-02-01T00:00:00.000Z",
    });
    await runApply(config, projectPath, "test", stubAdapter, {
      nowIso: "2026-02-01T00:05:00.000Z",
    });

    const history = listDeploymentRunHistory(projectPath, "test", "2026-02-01T00:06:00.000Z");
    expect(history.some((r) => r.action === "plan")).toBe(true);
    expect(history.some((r) => r.action === "apply")).toBe(true);
  });

  test("prod apply requires fresh plan", async () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);
    const config = enabledConfig();

    await runPlan(config, projectPath, "prod", stubAdapter, {
      nowIso: "2026-02-01T00:00:00.000Z",
    });

    await expect(
      runApply(config, projectPath, "prod", stubAdapter, {
        nowIso: "2026-02-01T00:20:00.000Z",
      })
    ).rejects.toThrow("PROD_PLAN_STALE");
  });

  test("post-force-unlock requires re-plan before apply", async () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);
    const config = enabledConfig();

    await runPlan(config, projectPath, "test", stubAdapter, {
      nowIso: "2026-02-01T00:00:00.000Z",
    });
    forceUnlockEnvironment(projectPath, "test", "2026-02-01T00:01:00.000Z");

    await expect(
      runApply(config, projectPath, "test", stubAdapter, {
        nowIso: "2026-02-01T00:02:00.000Z",
      })
    ).rejects.toThrow("REPLAN_REQUIRED_AFTER_FORCE_UNLOCK");
  });

  test("stale lock hook throws stale error", async () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);
    const config = enabledConfig();

    saveProjectConfig(projectPath, {
      ...(loadProjectConfig(projectPath) ?? {}),
      deploymentState: {
        environments: {
          test: {
            activeLock: {
              runId: "run_old",
              acquiredAt: "2026-02-01T00:00:00.000Z",
            },
          },
        },
      },
    });

    await expect(
      runPlan(config, projectPath, "test", stubAdapter, {
        nowIso: "2026-02-01T00:40:00.000Z",
      })
    ).rejects.toThrow("LOCK_STALE");
  });

  test("report updates status mapping and records run", async () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);
    const config = enabledConfig();

    const reportAdapter: DeployAdapter = {
      ...stubAdapter,
      async report() {
        return {
          status: "drifted",
          driftDetected: true,
          logs: ["drift found"],
        };
      },
    };

    const result = await runReport(config, projectPath, "test", reportAdapter, {
      nowIso: "2026-02-01T01:00:00.000Z",
    });

    expect(result.status).toBe("drifted");
    const cfg = loadProjectConfig(projectPath);
    expect(cfg?.deploymentState?.environments?.test?.lastStatus).toBe("drifted");
    expect(cfg?.deploymentState?.environments?.test?.lastPlanDriftDetected).toBe(true);
  });
});
