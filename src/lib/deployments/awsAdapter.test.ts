import { describe, expect, test } from "bun:test";
import { createAwsDeployAdapter } from "@/lib/deployments/awsAdapter";
import { OpenTofuDockerRunner } from "@/lib/deployments/openTofuRunner";
import { ShellError } from "@/lib/shell";
import type { TzConfig } from "@/lib/config";

function configWithBackend(): TzConfig {
  return {
    name: "Tester",
    email: "tester@example.com",
    projectDirectory: "/tmp/projects",
    projects: [],
    deployments: { enabled: true },
    integrations: {
      aws: {
        connected: true,
        backend: {
          bucket: "acme-state",
          region: "ap-southeast-2",
          profile: "default",
          statePrefix: "tz/user-123/app-demo",
          lockStrategy: "s3-lockfile",
        },
      },
    },
  };
}

describe("aws deploy adapter", () => {
  test("maps plan output to drifted status", async () => {
    const runner = new OpenTofuDockerRunner({
      shellExecutor: async () => ({
        exitCode: 0,
        stdout: "Plan: 1 to add, 2 to change, 0 to destroy.",
        stderr: "",
      }),
    });
    const adapter = createAwsDeployAdapter(configWithBackend(), { runner });
    const result = await adapter.plan({
      projectPath: "/tmp/demo",
      environmentId: "test",
      nowIso: "2026-02-22T00:00:00.000Z",
    });
    expect(result.status).toBe("drifted");
    expect(result.summary.change).toBe(2);
    expect(result.driftDetected).toBe(true);
  });

  test("maps apply output summary", async () => {
    const runner = new OpenTofuDockerRunner({
      shellExecutor: async () => ({
        exitCode: 0,
        stdout: "Apply complete! Resources: 0 added, 1 changed, 0 destroyed.",
        stderr: "",
      }),
    });
    const adapter = createAwsDeployAdapter(configWithBackend(), { runner });
    const result = await adapter.apply({
      projectPath: "/tmp/demo",
      environmentId: "test",
      nowIso: "2026-02-22T00:00:00.000Z",
    });
    expect(result.status).toBe("healthy");
    expect(result.summary.change).toBe(1);
  });

  test("maps destroy output summary", async () => {
    const runner = new OpenTofuDockerRunner({
      shellExecutor: async () => ({
        exitCode: 0,
        stdout: "Destroy complete! Resources: 3 destroyed.",
        stderr: "",
      }),
    });
    const adapter = createAwsDeployAdapter(configWithBackend(), { runner });
    const result = await adapter.destroy({
      projectPath: "/tmp/demo",
      environmentId: "test",
      nowIso: "2026-02-22T00:00:00.000Z",
    });
    expect(result.status).toBe("healthy");
    expect(result.summary.destroy).toBe(3);
  });

  test("maps report via plan exit codes and show path", async () => {
    let callCount = 0;
    const runner = new OpenTofuDockerRunner({
      shellExecutor: async () => {
        callCount += 1;
        if (callCount === 1) {
          return { exitCode: 2, stdout: "Plan: 0 to add, 1 to change, 0 to destroy.", stderr: "" };
        }
        return { exitCode: 0, stdout: "show output", stderr: "" };
      },
    });
    const adapter = createAwsDeployAdapter(configWithBackend(), { runner });
    const result = await adapter.report({
      projectPath: "/tmp/demo",
      environmentId: "test",
      nowIso: "2026-02-22T00:00:00.000Z",
    });
    expect(result.status).toBe("drifted");
    expect(result.driftDetected).toBe(true);
  });

  test("normalizes docker unavailable error", async () => {
    const runner = new OpenTofuDockerRunner({
      shellExecutor: async () => {
        throw new ShellError("missing docker", 127, "", "docker not found");
      },
    });
    const adapter = createAwsDeployAdapter(configWithBackend(), { runner });
    const result = await adapter.apply({
      projectPath: "/tmp/demo",
      environmentId: "test",
      nowIso: "2026-02-22T00:00:00.000Z",
    });
    expect(result.status).toBe("failed");
    expect(result.errors?.[0]?.code).toBe("RUNNER_UNAVAILABLE");
  });
});
