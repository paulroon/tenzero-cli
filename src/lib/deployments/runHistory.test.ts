import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveProjectConfig } from "@/lib/config/project";
import {
  listDeploymentRunHistory,
  pruneDeploymentRunHistory,
  recordDeploymentRun,
} from "@/lib/deployments/runHistory";

const tmpRoots: string[] = [];

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-run-history-"));
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

describe("deployment run history", () => {
  test("records run metadata and lists reverse-chronological order", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);

    recordDeploymentRun(
      projectPath,
      {
        environmentId: "test",
        action: "plan",
        status: "success",
      },
      "2026-01-01T00:00:00.000Z"
    );

    recordDeploymentRun(
      projectPath,
      {
        environmentId: "test",
        action: "apply",
        status: "failed",
      },
      "2026-01-02T00:00:00.000Z"
    );

    const history = listDeploymentRunHistory(
      projectPath,
      "test",
      "2026-01-02T12:00:00.000Z"
    );
    expect(history.length).toBe(2);
    expect(history[0]?.action).toBe("apply");
    expect(history[1]?.action).toBe("plan");
  });

  test("redacts sensitive log content before persistence", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);

    recordDeploymentRun(projectPath, {
      environmentId: "prod",
      action: "apply",
      status: "failed",
      logs: [
        "password=supersecret",
        "token: abcdef12345",
        "https://user:pass@example.com/path",
      ],
    });

    const history = listDeploymentRunHistory(projectPath, "prod");
    const logs = history[0]?.logs ?? [];
    expect(logs[0]).toContain("password=[REDACTED]");
    expect(logs[1]).toContain("token: [REDACTED]");
    expect(logs[2]).toContain("https://[REDACTED]:[REDACTED]@example.com/path");
  });

  test("retention cleanup removes records older than 30 days", () => {
    const root = createProjectRoot();
    const projectPath = setupProject(root);

    recordDeploymentRun(
      projectPath,
      {
        environmentId: "test",
        action: "plan",
        status: "success",
      },
      "2026-01-01T00:00:00.000Z"
    );
    recordDeploymentRun(
      projectPath,
      {
        environmentId: "test",
        action: "report",
        status: "success",
      },
      "2026-01-10T00:00:00.000Z"
    );

    // By Feb 5, Jan 1 record expires (30d), Jan 10 record remains.
    const remaining = pruneDeploymentRunHistory(projectPath, "2026-02-05T00:00:00.000Z");
    expect(remaining.length).toBe(1);
    expect(remaining[0]?.action).toBe("report");
  });
});
