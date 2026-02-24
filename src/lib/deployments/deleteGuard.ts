import { loadProjectConfig, type ProjectDeploymentRunRecord } from "@/lib/config/project";

type Timestamp = string;

export type ProjectDeleteGuardBlock = {
  environmentId: string;
  reason: string;
  remediation: string;
};

export type ProjectDeleteGuardResult = {
  allowed: boolean;
  blocks: ProjectDeleteGuardBlock[];
};

function latestTimestamp(
  history: ProjectDeploymentRunRecord[],
  environmentId: string,
  action: "apply" | "destroy"
): Timestamp | undefined {
  const entries = history
    .filter(
      (record) =>
        record.environmentId === environmentId &&
        record.action === action &&
        record.status === "success"
    )
    .map((record) => record.finishedAt)
    .filter((iso) => typeof iso === "string")
    .sort((a, b) => b.localeCompare(a));
  return entries[0];
}

function hasProviderOutput(projectPath: string, environmentId: string): boolean {
  const config = loadProjectConfig(projectPath);
  if (!config?.environmentOutputs?.[environmentId]) return false;
  return Object.values(config.environmentOutputs[environmentId]).some(
    (output) => output.source === "providerOutput"
  );
}

export function evaluateProjectDeleteGuard(projectPath: string): ProjectDeleteGuardResult {
  const config = loadProjectConfig(projectPath);
  if (!config) {
    throw new Error(`Project config not found: ${projectPath}`);
  }

  const fromState = Object.keys(config.deploymentState?.environments ?? {});
  const fromOutputs = Object.keys(config.environmentOutputs ?? {}).filter((environmentId) =>
    hasProviderOutput(projectPath, environmentId)
  );
  const fromHistory = (config.deploymentRunHistory ?? []).map((record) => record.environmentId);
  const environmentIds = Array.from(new Set([...fromState, ...fromOutputs, ...fromHistory]));

  const history = config.deploymentRunHistory ?? [];
  const blocks: ProjectDeleteGuardBlock[] = [];

  for (const environmentId of environmentIds) {
    const state = config.deploymentState?.environments?.[environmentId];
    if (state?.activeLock) {
      blocks.push({
        environmentId,
        reason: "active deployment lock present",
        remediation: `Open Infra Environments > '${environmentId}' and run Destroy environment.`,
      });
      continue;
    }

    const latestApply = latestTimestamp(history, environmentId, "apply");
    const latestDestroy = latestTimestamp(history, environmentId, "destroy");
    const hasSuccessfulDestroyAfterApply =
      !!latestDestroy && (!latestApply || latestDestroy > latestApply);
    const status = state?.lastStatus;

    if (
      !hasSuccessfulDestroyAfterApply &&
      (status === "deploying" || !!latestApply || hasProviderOutput(projectPath, environmentId))
    ) {
      blocks.push({
        environmentId,
        reason: `provider-backed environment is not destroyed${
          status ? ` (status: ${status})` : ""
        }`,
        remediation: `Open Infra Environments > '${environmentId}' and run Destroy environment.`,
      });
    }
  }

  blocks.sort((a, b) => a.environmentId.localeCompare(b.environmentId));
  return {
    allowed: blocks.length === 0,
    blocks,
  };
}
