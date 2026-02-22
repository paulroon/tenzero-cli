import type { TzConfig } from "@/lib/config";

export type DeploymentsGateCheck =
  | "aws-connected"
  | "backend-config-present"
  | "backend-state-read-write"
  | "backend-lock-acquisition";

export type DeploymentsGateIssue = {
  check: DeploymentsGateCheck;
  message: string;
  remediation: string;
};

export type DeploymentsGateResult = {
  allowed: boolean;
  issues: DeploymentsGateIssue[];
};

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function evaluateDeploymentsEnablementGate(config: TzConfig): DeploymentsGateResult {
  const issues: DeploymentsGateIssue[] = [];
  const aws = config.integrations?.aws;

  if (!aws?.connected) {
    issues.push({
      check: "aws-connected",
      message: "AWS integration is not connected.",
      remediation: "Connect AWS in Settings > Deployments before enabling deployments mode.",
    });
  }

  const backend = aws?.backend;
  const hasBackendConfig =
    backend &&
    nonEmpty(backend.bucket) &&
    nonEmpty(backend.region) &&
    nonEmpty(backend.profile) &&
    nonEmpty(backend.statePrefix) &&
    (backend.lockStrategy === "s3-lockfile" || backend.lockStrategy === "dynamodb");

  if (!hasBackendConfig) {
    issues.push({
      check: "backend-config-present",
      message: "Backend configuration is incomplete.",
      remediation:
        "Provide bucket, region, profile, state prefix, and lock strategy in Settings > Deployments.",
    });
  }

  if (aws?.backendChecks?.stateReadWritePassed !== true) {
    issues.push({
      check: "backend-state-read-write",
      message: "Backend read/write validation has not passed.",
      remediation: "Run backend validation checks and resolve the reported issue.",
    });
  }

  if (aws?.backendChecks?.lockAcquisitionPassed !== true) {
    issues.push({
      check: "backend-lock-acquisition",
      message: "Backend lock acquisition validation has not passed.",
      remediation: "Run backend validation checks and resolve the reported issue.",
    });
  }

  return {
    allowed: issues.length === 0,
    issues,
  };
}

export function assertDeploymentsModeEnabled(config: TzConfig): void {
  if (config.deployments?.enabled === true) return;
  throw new Error(
    "Deployments mode is not enabled. Open Settings > Deployments and complete AWS/backend setup and validation."
  );
}
