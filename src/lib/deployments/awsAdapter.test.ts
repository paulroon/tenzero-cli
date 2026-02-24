import { describe, expect, test } from "bun:test";
import { createAwsDeployAdapter } from "@/lib/deployments/awsAdapter";
import { OpenTofuDockerRunner } from "@/lib/deployments/openTofuRunner";
import { OpenTofuEngine } from "@/lib/deployments/openTofuEngine";
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

  test("maps report via plan exit codes", async () => {
    const runner = new OpenTofuDockerRunner({
      shellExecutor: async () => ({
        exitCode: 2,
        stdout: "Plan: 0 to add, 1 to change, 0 to destroy.",
        stderr: "",
      }),
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

  test("delegates execution to injected open tofu engine", async () => {
    const engine = {
      plan: async () => ({
        status: "drifted" as const,
        summary: { add: 1, change: 0, destroy: 0 },
        driftDetected: true,
        plannedChanges: [
          {
            address: "aws_apprunner_service.app[0]",
            actions: ["create"],
            providerName: "registry.terraform.io/hashicorp/aws",
            resourceType: "aws_apprunner_service",
          },
        ],
        logs: ["engine plan output"],
      }),
      apply: async () => ({
        status: "healthy" as const,
        summary: { add: 0, change: 1, destroy: 0 },
        providerOutputs: {
          APP_BASE_URL: "https://prod.example.com",
        },
        logs: ["engine apply output"],
      }),
      destroy: async () => ({
        status: "healthy" as const,
        summary: { add: 0, change: 0, destroy: 2 },
        logs: ["engine destroy output"],
      }),
      report: async () => ({
        status: "healthy" as const,
        driftDetected: false,
        providerOutputs: {
          APP_BASE_URL: "https://prod.example.com",
        },
        logs: ["engine report output"],
      }),
    } as unknown as OpenTofuEngine;

    const adapter = createAwsDeployAdapter(configWithBackend(), { engine });
    const plan = await adapter.plan({
      projectPath: "/tmp/demo",
      environmentId: "prod",
      nowIso: "2026-02-22T00:00:00.000Z",
    });
    expect(plan.status).toBe("drifted");
    expect(plan.plannedChanges?.[0]?.address).toBe("aws_apprunner_service.app[0]");

    const apply = await adapter.apply({
      projectPath: "/tmp/demo",
      environmentId: "prod",
      nowIso: "2026-02-22T00:00:00.000Z",
    });
    expect(apply.providerOutputs?.APP_BASE_URL).toBe("https://prod.example.com");
  });
});
