import { describe, expect, test } from "bun:test";
import type { TzConfig } from "@/lib/config";
import { maybeRunDeploymentsCommand } from "@/lib/deployments/commands";

function readyConfig(): TzConfig {
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
          statePrefix: "tz/user/demo",
          lockStrategy: "s3-lockfile",
        },
        backendChecks: {
          stateReadWritePassed: true,
          lockAcquisitionPassed: true,
          checkedAt: "2026-02-22T00:00:00.000Z",
        },
      },
    },
  };
}

function withMaterialize<T extends Record<string, unknown>>(overrides: T): T {
  return {
    materializeInfra: () => ({ directoryPath: "/tmp/.tz/infra/test", filePaths: [] }),
    loadReleaseConfig: () => ({
      config: { version: "1.2.3", tagPrefix: "v" },
      exists: true,
    }),
    runGitPreflight: async () => undefined,
    ...overrides,
  };
}

describe("deployments commands", () => {
  test("returns not handled for non-deployments args", async () => {
    const result = await maybeRunDeploymentsCommand(["foo"]);
    expect(result.handled).toBe(false);
  });

  test("fails fast with gate remediation message", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(["deployments", "plan", "--env", "test"], {
      ...withMaterialize({
        loadUserConfig: () => readyConfig(),
        evaluateGate: () => ({
          allowed: false,
          issues: [
            {
              check: "aws-connected",
              message: "AWS integration is not connected.",
              remediation: "Connect AWS in Settings > Deployments.",
            },
          ],
        }),
        writeLine: (line) => lines.push(line),
      }),
    });
    expect(result.exitCode).toBe(1);
    expect(lines.join("\n")).toContain("Deployments gate blocked:");
    expect(lines.join("\n")).toContain("Connect AWS");
  });

  test("plan command prints summary and exits 0", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(["deployments", "plan", "--env", "test"], {
      ...withMaterialize({
        loadUserConfig: () => readyConfig(),
        evaluateGate: () => ({ allowed: true, issues: [] }),
        assertMode: () => undefined,
        createAdapter: () => ({} as never),
        runPlan: async () => ({
          status: "drifted",
          summary: { add: 1, change: 0, destroy: 0 },
          driftDetected: true,
        }),
        writeLine: (line) => lines.push(line),
      }),
    });
    expect(result.exitCode).toBe(0);
    expect(lines.join("\n")).toContain("Plan summary: add=1, change=0, destroy=0");
    expect(lines.join("\n")).toContain("Next step: tz deployments apply --env test");
  });

  test("destroy command propagates confirmation failure", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(
      ["deployments", "destroy", "--env", "prod"],
      withMaterialize({
        loadUserConfig: () => readyConfig(),
        evaluateGate: () => ({ allowed: true, issues: [] }),
        assertMode: () => undefined,
        createAdapter: () => ({} as never),
        runDestroy: async () => {
          throw new Error("DESTROY_CONFIRMATION_REQUIRED: Provide explicit destroy confirmation.");
        },
        writeLine: (line) => lines.push(line),
      })
    );
    expect(result.exitCode).toBe(1);
    expect(lines.join("\n")).toContain("DESTROY_CONFIRMATION_REQUIRED");
  });

  test("apply command exits non-zero when adapter returns errors", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(["deployments", "apply", "--env", "test"], {
      ...withMaterialize({
        loadUserConfig: () => readyConfig(),
        evaluateGate: () => ({ allowed: true, issues: [] }),
        assertMode: () => undefined,
        createAdapter: () => ({} as never),
        runReport: async () => ({
          status: "healthy",
          driftDetected: false,
        }),
        runApply: async () => ({
          status: "failed",
          summary: { add: 0, change: 0, destroy: 0 },
          errors: [{ code: "TF_CMD_FAILED", message: "apply failed" }],
        }),
        writeLine: (line) => lines.push(line),
      }),
    });
    expect(result.exitCode).toBe(1);
    expect(lines.join("\n")).toContain("[TF_CMD_FAILED] apply failed");
  });

  test("apply command blocks on preflight drift unless confirmed", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(["deployments", "apply", "--env", "uat"], {
      ...withMaterialize({
        loadUserConfig: () => readyConfig(),
        evaluateGate: () => ({ allowed: true, issues: [] }),
        assertMode: () => undefined,
        createAdapter: () => ({} as never),
        runReport: async () => ({
          status: "drifted",
          driftDetected: true,
        }),
        runApply: async () => ({
          status: "healthy",
          summary: { add: 0, change: 1, destroy: 0 },
        }),
        writeLine: (line) => lines.push(line),
      }),
    });
    expect(result.exitCode).toBe(1);
    expect(lines.join("\n")).toContain("Pre-apply drift check failed");
  });

  test("apply command for prod requires --confirm-drift-prod specifically", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(
      ["deployments", "apply", "--env", "prod", "--confirm-drift"],
      withMaterialize({
        loadUserConfig: () => readyConfig(),
        evaluateGate: () => ({ allowed: true, issues: [] }),
        assertMode: () => undefined,
        createAdapter: () => ({} as never),
        runReport: async () => ({
          status: "drifted",
          driftDetected: true,
        }),
        runApply: async () => ({
          status: "healthy",
          summary: { add: 0, change: 1, destroy: 0 },
        }),
        writeLine: (line) => lines.push(line),
      })
    );
    expect(result.exitCode).toBe(1);
    expect(lines.join("\n")).toContain("--confirm-drift-prod");
  });

  test("apply command for non-prod accepts --confirm-drift", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(
      ["deployments", "apply", "--env", "test", "--confirm-drift"],
      withMaterialize({
        loadUserConfig: () => readyConfig(),
        evaluateGate: () => ({ allowed: true, issues: [] }),
        assertMode: () => undefined,
        createAdapter: () => ({} as never),
        runReport: async () => ({
          status: "drifted",
          driftDetected: true,
        }),
        runApply: async () => ({
          status: "healthy",
          summary: { add: 0, change: 1, destroy: 0 },
        }),
        writeLine: (line) => lines.push(line),
      })
    );
    expect(result.exitCode).toBe(0);
    expect(lines.join("\n")).toContain("Apply summary: add=0, change=1, destroy=0");
  });

  test("report command prints remediation hints for drifted", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(["deployments", "report", "--env", "uat"], {
      ...withMaterialize({
        loadUserConfig: () => readyConfig(),
        evaluateGate: () => ({ allowed: true, issues: [] }),
        assertMode: () => undefined,
        createAdapter: () => ({} as never),
        runReport: async () => ({
          status: "drifted",
          driftDetected: true,
        }),
        writeLine: (line) => lines.push(line),
      }),
    });
    expect(result.exitCode).toBe(0);
    expect(lines.join("\n")).toContain("Remediation: review plan and apply explicitly for 'uat'.");
  });

  test("report watch mode prints cycle updates", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(
      ["deployments", "report", "--env", "test", "--watch", "--max-cycles", "2", "--interval-seconds", "0"],
      withMaterialize({
        loadUserConfig: () => readyConfig(),
        evaluateGate: () => ({ allowed: true, issues: [] }),
        assertMode: () => undefined,
        createAdapter: () => ({} as never),
        runReportRefreshLoop: async (_config, _projectPath, _env, _adapter, options) => {
          options?.onCycle?.(1, { status: "healthy", driftDetected: false });
          options?.onCycle?.(2, { status: "drifted", driftDetected: true });
          return [
            { status: "healthy", driftDetected: false },
            { status: "drifted", driftDetected: true },
          ];
        },
        writeLine: (line) => lines.push(line),
      })
    );
    expect(result.exitCode).toBe(0);
    expect(lines.join("\n")).toContain("Refresh cycle 1:");
    expect(lines.join("\n")).toContain("Refresh cycle 2:");
  });

  test("fails fast when infra materialization fails", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(["deployments", "plan", "--env", "prod"], {
      loadUserConfig: () => readyConfig(),
      loadReleaseConfig: () => ({
        config: { version: "1.0.0", tagPrefix: "v" },
        exists: true,
      }),
      evaluateGate: () => ({ allowed: true, issues: [] }),
      assertMode: () => undefined,
      createAdapter: () => ({} as never),
      runGitPreflight: async () => undefined,
      materializeInfra: () => {
        throw new Error("Template 'nextjs' has no infra definition.");
      },
      writeLine: (line) => lines.push(line),
    });
    expect(result.exitCode).toBe(1);
    expect(lines.join("\n")).toContain("has no infra definition");
  });

  test("blocks deployment when release config is missing", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(["deployments", "plan", "--env", "prod"], {
      loadUserConfig: () => readyConfig(),
      loadReleaseConfig: () => ({ config: null, exists: false }),
      evaluateGate: () => ({ allowed: true, issues: [] }),
      assertMode: () => undefined,
      createAdapter: () => ({} as never),
      runGitPreflight: async () => undefined,
      materializeInfra: () => ({ directoryPath: "/tmp/.tz/infra/prod", filePaths: [] }),
      writeLine: (line) => lines.push(line),
    });
    expect(result.exitCode).toBe(1);
    expect(lines.join("\n")).toContain("release config not found");
  });

  test("blocks deployment when git preflight fails", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(["deployments", "plan", "--env", "prod"], {
      loadUserConfig: () => readyConfig(),
      loadReleaseConfig: () => ({
        config: { version: "1.0.0", tagPrefix: "v" },
        exists: true,
      }),
      evaluateGate: () => ({ allowed: true, issues: [] }),
      assertMode: () => undefined,
      createAdapter: () => ({} as never),
      runGitPreflight: async () => {
        throw new Error("Deployment blocked: commit or stash changes first.");
      },
      materializeInfra: () => ({ directoryPath: "/tmp/.tz/infra/prod", filePaths: [] }),
      writeLine: (line) => lines.push(line),
    });
    expect(result.exitCode).toBe(1);
    expect(lines.join("\n")).toContain("commit or stash changes");
  });

  test("blocks deployment when deploy template validation fails", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(["deployments", "plan", "--env", "prod"], {
      loadUserConfig: () => readyConfig(),
      loadReleaseConfig: () => ({
        config: { version: "1.0.0", tagPrefix: "v" },
        exists: true,
      }),
      evaluateGate: () => ({ allowed: true, issues: [] }),
      assertMode: () => undefined,
      createAdapter: () => ({} as never),
      runGitPreflight: async () => undefined,
      validateDeployTemplateForProject: () => {
        throw new Error("Deployment blocked: template deploy config is invalid.");
      },
      materializeInfra: () => ({ directoryPath: "/tmp/.tz/infra/prod", filePaths: [] }),
      writeLine: (line) => lines.push(line),
    });
    expect(result.exitCode).toBe(1);
    expect(lines.join("\n")).toContain("template deploy config is invalid");
  });

  test("blocks deployment when post-interpolation validation fails", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(["deployments", "plan", "--env", "prod"], {
      loadUserConfig: () => readyConfig(),
      loadReleaseConfig: () => ({
        config: { version: "1.0.0", tagPrefix: "v" },
        exists: true,
      }),
      evaluateGate: () => ({ allowed: true, issues: [] }),
      assertMode: () => undefined,
      createAdapter: () => ({} as never),
      runGitPreflight: async () => undefined,
      validateDeployTemplateForProject: () => undefined,
      materializeInfra: () => ({ directoryPath: "/tmp/.tz/infra/prod", filePaths: [] }),
      validatePostInterpolationArtifacts: () => {
        throw new Error("Deployment blocked: unresolved interpolation token detected.");
      },
      writeLine: (line) => lines.push(line),
    });
    expect(result.exitCode).toBe(1);
    expect(lines.join("\n")).toContain("unresolved interpolation token");
  });

  test("blocks apply when post-deploy output validation fails", async () => {
    const lines: string[] = [];
    const result = await maybeRunDeploymentsCommand(["deployments", "apply", "--env", "test"], {
      ...withMaterialize({
        loadUserConfig: () => readyConfig(),
        evaluateGate: () => ({ allowed: true, issues: [] }),
        assertMode: () => undefined,
        createAdapter: () => ({} as never),
        runReport: async () => ({
          status: "healthy",
          driftDetected: false,
        }),
        runApply: async () => ({
          status: "healthy",
          summary: { add: 1, change: 0, destroy: 0 },
          providerOutputs: { APP_BASE_URL: 123 },
        }),
        validatePostDeployOutputs: () => {
          throw new Error("Deployment blocked: output 'APP_BASE_URL' has invalid type.");
        },
        writeLine: (line) => lines.push(line),
      }),
    });
    expect(result.exitCode).toBe(1);
    expect(lines.join("\n")).toContain("output 'APP_BASE_URL' has invalid type");
  });
});
