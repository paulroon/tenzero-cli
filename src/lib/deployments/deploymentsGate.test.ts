import { describe, expect, test } from "bun:test";
import type { TzConfig } from "@/lib/config";
import {
  assertDeploymentsModeEnabled,
  evaluateDeploymentsEnablementGate,
} from "@/lib/deployments/gate";

function makeBaseConfig(): TzConfig {
  return {
    name: "Tester",
    email: "tester@example.com",
    projectDirectory: "/tmp/projects",
    projects: [],
    deployments: { enabled: false },
  };
}

describe("deployments enablement gate", () => {
  test("blocks when AWS integration is missing", () => {
    const result = evaluateDeploymentsEnablementGate(makeBaseConfig());
    expect(result.allowed).toBe(false);
    expect(result.issues.some((i) => i.check === "aws-connected")).toBe(true);
  });

  test("blocks when backend config is incomplete", () => {
    const config = makeBaseConfig();
    config.integrations = { aws: { connected: true } };

    const result = evaluateDeploymentsEnablementGate(config);
    expect(result.allowed).toBe(false);
    expect(result.issues.some((i) => i.check === "backend-config-present")).toBe(true);
  });

  test("blocks when backend checks have not passed", () => {
    const config = makeBaseConfig();
    config.integrations = {
      aws: {
        connected: true,
        backend: {
          bucket: "tz-state-123-eu-west-1",
          region: "eu-west-1",
          profile: "default",
          statePrefix: "tz/v1/default/demo",
          lockStrategy: "s3-lockfile",
        },
      },
    };

    const result = evaluateDeploymentsEnablementGate(config);
    expect(result.allowed).toBe(false);
    expect(result.issues.some((i) => i.check === "backend-state-read-write")).toBe(true);
    expect(result.issues.some((i) => i.check === "backend-lock-acquisition")).toBe(true);
  });

  test("allows when all checks pass", () => {
    const config = makeBaseConfig();
    config.integrations = {
      aws: {
        connected: true,
        backend: {
          bucket: "tz-state-123-eu-west-1",
          region: "eu-west-1",
          profile: "default",
          statePrefix: "tz/v1/default/demo",
          lockStrategy: "s3-lockfile",
        },
        backendChecks: {
          stateReadWritePassed: true,
          lockAcquisitionPassed: true,
          checkedAt: new Date().toISOString(),
        },
      },
    };

    const result = evaluateDeploymentsEnablementGate(config);
    expect(result.allowed).toBe(true);
    expect(result.issues.length).toBe(0);
  });
});

describe("deployments command guard", () => {
  test("throws actionable error when deployments mode is disabled", () => {
    expect(() => assertDeploymentsModeEnabled(makeBaseConfig())).toThrow(
      "Deployments mode is not enabled"
    );
  });

  test("passes when deployments mode is enabled", () => {
    const config = makeBaseConfig();
    config.deployments = { enabled: true };
    expect(() => assertDeploymentsModeEnabled(config)).not.toThrow();
  });
});
