import type { TzConfig } from "@/lib/config";
import { assertDeploymentsModeEnabled } from "@/lib/deployments/gate";
import {
  loadProjectConfig,
  saveProjectConfig,
  type DeploymentEnvironmentState,
} from "@/lib/config/project";
import { recordDeploymentRun, type DeploymentRunSummary } from "@/lib/deployments/runHistory";

export type EnvironmentStatus =
  | "healthy"
  | "drifted"
  | "deploying"
  | "failed"
  | "unknown";

export type AdapterError = {
  code: string;
  message: string;
};

export type AdapterWarning = {
  code: string;
  message: string;
};

export type PlannedResourceChange = {
  address: string;
  actions: string[];
  providerName?: string;
  resourceType?: string;
};

export type PlanResult = {
  status: EnvironmentStatus;
  summary: DeploymentRunSummary;
  driftDetected: boolean;
  plannedChanges?: PlannedResourceChange[];
  warnings?: AdapterWarning[];
  errors?: AdapterError[];
  logs?: string[];
};

export type ApplyResult = {
  status: EnvironmentStatus;
  summary: DeploymentRunSummary;
  warnings?: AdapterWarning[];
  errors?: AdapterError[];
  logs?: string[];
};

export type DestroyResult = {
  status: EnvironmentStatus;
  summary: DeploymentRunSummary;
  warnings?: AdapterWarning[];
  errors?: AdapterError[];
  logs?: string[];
};

export type ReportResult = {
  status: EnvironmentStatus;
  driftDetected: boolean;
  warnings?: AdapterWarning[];
  errors?: AdapterError[];
  logs?: string[];
};

export type DeployAdapter = {
  plan(args: { projectPath: string; environmentId: string; nowIso: string }): Promise<PlanResult>;
  apply(args: { projectPath: string; environmentId: string; nowIso: string }): Promise<ApplyResult>;
  destroy(args: {
    projectPath: string;
    environmentId: string;
    nowIso: string;
  }): Promise<DestroyResult>;
  report(args: { projectPath: string; environmentId: string; nowIso: string }): Promise<ReportResult>;
};

export type OrchestrationOptions = {
  nowIso?: string;
  actor?: string;
  lockTimeoutMs?: number;
  staleLockThresholdMs?: number;
};

export type DestroyConfirmation = {
  confirmEnvironmentId: string;
  confirmPhrase: string;
  confirmProdPhrase?: string;
};

export type ReportRefreshOptions = OrchestrationOptions & {
  intervalMs?: number;
  maxCycles?: number;
  onCycle?: (cycle: number, result: ReportResult) => void;
};

const DEFAULT_LOCK_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_STALE_LOCK_THRESHOLD_MS = 30 * 60 * 1000;
const PROD_PLAN_FRESHNESS_WINDOW_MS = 15 * 60 * 1000;

function getOrCreateEnvState(
  projectPath: string,
  environmentId: string
): { configPathState: DeploymentEnvironmentState; save: (next: DeploymentEnvironmentState) => void } {
  const config = loadProjectConfig(projectPath);
  if (!config) {
    throw new Error(`Project config not found: ${projectPath}`);
  }
  const stateMap = config.deploymentState?.environments ?? {};
  const current = stateMap[environmentId] ?? {};
  return {
    configPathState: current,
    save: (next) => {
      saveProjectConfig(projectPath, {
        ...config,
        deploymentState: {
          environments: {
            ...stateMap,
            [environmentId]: next,
          },
        },
      });
    },
  };
}

function acquireLock(
  projectPath: string,
  environmentId: string,
  runId: string,
  nowIso: string,
  lockTimeoutMs: number,
  staleLockThresholdMs: number
): void {
  const { configPathState: state, save } = getOrCreateEnvState(projectPath, environmentId);
  if (state.activeLock) {
    const acquiredAtMs = new Date(state.activeLock.acquiredAt).getTime();
    const nowMs = new Date(nowIso).getTime();
    const ageMs = nowMs - acquiredAtMs;
    if (Number.isFinite(ageMs) && ageMs > staleLockThresholdMs) {
      throw new Error(
        `LOCK_STALE: Existing lock for '${environmentId}' is stale (> ${Math.floor(
          staleLockThresholdMs / 60000
        )}m). Force-unlock before retrying.`
      );
    }
    throw new Error(
      `LOCK_TIMEOUT: Lock already held for '${environmentId}'. Timeout policy is ${Math.floor(
        lockTimeoutMs / 60000
      )}m.`
    );
  }
  save({
    ...state,
    activeLock: {
      runId,
      acquiredAt: nowIso,
    },
  });
}

function releaseLock(projectPath: string, environmentId: string): void {
  const { configPathState: state, save } = getOrCreateEnvState(projectPath, environmentId);
  save({
    ...state,
    activeLock: undefined,
  });
}

export function forceUnlockEnvironment(
  projectPath: string,
  environmentId: string,
  nowIso: string = new Date().toISOString()
): void {
  const { configPathState: state, save } = getOrCreateEnvState(projectPath, environmentId);
  save({
    ...state,
    activeLock: undefined,
    lastForceUnlockAt: nowIso,
  });
}

function newRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureProdPlanFreshness(
  environmentId: string,
  state: DeploymentEnvironmentState,
  nowIso: string
): void {
  if (environmentId !== "prod") return;
  if (!state.lastPlanAt) {
    throw new Error("PROD_PLAN_REQUIRED: prod apply requires a fresh plan.");
  }
  const ageMs = new Date(nowIso).getTime() - new Date(state.lastPlanAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs > PROD_PLAN_FRESHNESS_WINDOW_MS) {
    throw new Error("PROD_PLAN_STALE: prod apply requires a plan not older than 15 minutes.");
  }
}

function ensurePostForceUnlockReplan(state: DeploymentEnvironmentState): void {
  if (!state.lastForceUnlockAt) return;
  if (!state.lastPlanAt) {
    throw new Error(
      "REPLAN_REQUIRED_AFTER_FORCE_UNLOCK: Run plan before apply after force-unlock."
    );
  }
  if (new Date(state.lastPlanAt).getTime() <= new Date(state.lastForceUnlockAt).getTime()) {
    throw new Error(
      "REPLAN_REQUIRED_AFTER_FORCE_UNLOCK: Run plan after force-unlock before apply."
    );
  }
}

function updateEnvironmentStatus(
  projectPath: string,
  environmentId: string,
  nextStatus: EnvironmentStatus,
  nowIso: string,
  extra?: Partial<DeploymentEnvironmentState>
): void {
  const { configPathState: state, save } = getOrCreateEnvState(projectPath, environmentId);
  save({
    ...state,
    ...extra,
    lastStatus: nextStatus,
    lastStatusUpdatedAt: nowIso,
  });
}

function expectedDestroyPhrase(environmentId: string): string {
  return `destroy ${environmentId}`;
}

function expectedProdDestroyPhrase(): string {
  return "destroy prod permanently";
}

function assertDestroyConfirmation(
  environmentId: string,
  confirmation: DestroyConfirmation | undefined
): void {
  if (!confirmation) {
    throw new Error(
      "DESTROY_CONFIRMATION_REQUIRED: Provide explicit destroy confirmation to continue."
    );
  }
  if (confirmation.confirmEnvironmentId !== environmentId) {
    throw new Error(
      `DESTROY_ENVIRONMENT_MISMATCH: Confirmation environment '${confirmation.confirmEnvironmentId}' does not match '${environmentId}'.`
    );
  }
  if (confirmation.confirmPhrase !== expectedDestroyPhrase(environmentId)) {
    throw new Error(
      `DESTROY_CONFIRMATION_PHRASE_INVALID: Expected '${expectedDestroyPhrase(environmentId)}'.`
    );
  }
  if (environmentId === "prod") {
    if (!confirmation.confirmProdPhrase) {
      throw new Error(
        "PROD_DESTROY_SECOND_CONFIRM_REQUIRED: Provide secondary confirmation for prod destroy."
      );
    }
    if (confirmation.confirmProdPhrase !== expectedProdDestroyPhrase()) {
      throw new Error(
        `PROD_DESTROY_CONFIRMATION_INVALID: Expected '${expectedProdDestroyPhrase()}'.`
      );
    }
  }
}

export async function runPlan(
  config: TzConfig,
  projectPath: string,
  environmentId: string,
  adapter: DeployAdapter,
  options?: OrchestrationOptions
): Promise<PlanResult> {
  assertDeploymentsModeEnabled(config);
  const nowIso = options?.nowIso ?? new Date().toISOString();
  const lockTimeoutMs = options?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const staleLockThresholdMs =
    options?.staleLockThresholdMs ?? DEFAULT_STALE_LOCK_THRESHOLD_MS;
  const runId = newRunId();

  acquireLock(projectPath, environmentId, runId, nowIso, lockTimeoutMs, staleLockThresholdMs);
  try {
    const result = await adapter.plan({ projectPath, environmentId, nowIso });
    updateEnvironmentStatus(projectPath, environmentId, result.status, nowIso, {
      lastPlanAt: nowIso,
      lastPlanDriftDetected: result.driftDetected,
      activeLock: undefined,
    });
    recordDeploymentRun(
      projectPath,
      {
        environmentId,
        action: "plan",
        status: result.errors && result.errors.length > 0 ? "failed" : "success",
        actor: options?.actor,
        summary: result.summary,
        logs: result.logs,
        startedAt: nowIso,
        finishedAt: nowIso,
      },
      nowIso
    );
    return result;
  } catch (error) {
    recordDeploymentRun(
      projectPath,
      {
        environmentId,
        action: "plan",
        status: "failed",
        actor: options?.actor,
        logs: [error instanceof Error ? error.message : "Plan failed"],
        startedAt: nowIso,
        finishedAt: nowIso,
      },
      nowIso
    );
    throw error;
  } finally {
    releaseLock(projectPath, environmentId);
  }
}

export async function runApply(
  config: TzConfig,
  projectPath: string,
  environmentId: string,
  adapter: DeployAdapter,
  options?: OrchestrationOptions & { confirmDriftForProd?: boolean }
): Promise<ApplyResult> {
  assertDeploymentsModeEnabled(config);
  const nowIso = options?.nowIso ?? new Date().toISOString();
  const lockTimeoutMs = options?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const staleLockThresholdMs =
    options?.staleLockThresholdMs ?? DEFAULT_STALE_LOCK_THRESHOLD_MS;
  const runId = newRunId();

  const { configPathState: preState } = getOrCreateEnvState(projectPath, environmentId);
  ensureProdPlanFreshness(environmentId, preState, nowIso);
  ensurePostForceUnlockReplan(preState);
  if (
    environmentId === "prod" &&
    preState.lastPlanDriftDetected === true &&
    options?.confirmDriftForProd !== true
  ) {
    throw new Error("PROD_DRIFT_CONFIRM_REQUIRED: Re-plan and explicitly confirm drift path.");
  }

  acquireLock(projectPath, environmentId, runId, nowIso, lockTimeoutMs, staleLockThresholdMs);
  try {
    const result = await adapter.apply({ projectPath, environmentId, nowIso });
    updateEnvironmentStatus(projectPath, environmentId, result.status, nowIso, {
      activeLock: undefined,
    });
    recordDeploymentRun(
      projectPath,
      {
        environmentId,
        action: "apply",
        status: result.errors && result.errors.length > 0 ? "failed" : "success",
        actor: options?.actor,
        summary: result.summary,
        logs: result.logs,
        startedAt: nowIso,
        finishedAt: nowIso,
      },
      nowIso
    );
    return result;
  } catch (error) {
    recordDeploymentRun(
      projectPath,
      {
        environmentId,
        action: "apply",
        status: "failed",
        actor: options?.actor,
        logs: [error instanceof Error ? error.message : "Apply failed"],
        startedAt: nowIso,
        finishedAt: nowIso,
      },
      nowIso
    );
    throw error;
  } finally {
    releaseLock(projectPath, environmentId);
  }
}

export async function runReport(
  config: TzConfig,
  projectPath: string,
  environmentId: string,
  adapter: DeployAdapter,
  options?: OrchestrationOptions
): Promise<ReportResult> {
  assertDeploymentsModeEnabled(config);
  const nowIso = options?.nowIso ?? new Date().toISOString();
  const result = await adapter.report({ projectPath, environmentId, nowIso });
  updateEnvironmentStatus(projectPath, environmentId, result.status, nowIso, {
    lastPlanDriftDetected: result.driftDetected,
    lastReportedAt: nowIso,
  });
  recordDeploymentRun(
    projectPath,
    {
      environmentId,
      action: "report",
      status: result.errors && result.errors.length > 0 ? "failed" : "success",
      actor: options?.actor,
      logs: result.logs,
      startedAt: nowIso,
      finishedAt: nowIso,
    },
    nowIso
  );
  return result;
}

export async function runDestroy(
  config: TzConfig,
  projectPath: string,
  environmentId: string,
  adapter: DeployAdapter,
  confirmation: DestroyConfirmation,
  options?: OrchestrationOptions
): Promise<DestroyResult> {
  assertDeploymentsModeEnabled(config);
  assertDestroyConfirmation(environmentId, confirmation);

  const nowIso = options?.nowIso ?? new Date().toISOString();
  const lockTimeoutMs = options?.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const staleLockThresholdMs =
    options?.staleLockThresholdMs ?? DEFAULT_STALE_LOCK_THRESHOLD_MS;
  const runId = newRunId();

  acquireLock(projectPath, environmentId, runId, nowIso, lockTimeoutMs, staleLockThresholdMs);
  try {
    const result = await adapter.destroy({ projectPath, environmentId, nowIso });
    updateEnvironmentStatus(
      projectPath,
      environmentId,
      result.status === "healthy" ? "unknown" : result.status,
      nowIso,
      {
        activeLock: undefined,
      }
    );
    recordDeploymentRun(
      projectPath,
      {
        environmentId,
        action: "destroy",
        status: result.errors && result.errors.length > 0 ? "failed" : "success",
        actor: options?.actor,
        summary: result.summary,
        logs: result.logs,
        startedAt: nowIso,
        finishedAt: nowIso,
      },
      nowIso
    );
    return result;
  } catch (error) {
    recordDeploymentRun(
      projectPath,
      {
        environmentId,
        action: "destroy",
        status: "failed",
        actor: options?.actor,
        logs: [error instanceof Error ? error.message : "Destroy failed"],
        startedAt: nowIso,
        finishedAt: nowIso,
      },
      nowIso
    );
    throw error;
  } finally {
    releaseLock(projectPath, environmentId);
  }
}

export async function runReportRefreshLoop(
  config: TzConfig,
  projectPath: string,
  environmentId: string,
  adapter: DeployAdapter,
  options?: ReportRefreshOptions
): Promise<ReportResult[]> {
  const maxCycles = options?.maxCycles ?? 3;
  const intervalMs = options?.intervalMs ?? 5000;
  const results: ReportResult[] = [];
  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    const cycleNowIso = options?.nowIso ?? new Date().toISOString();
    const result = await runReport(config, projectPath, environmentId, adapter, {
      ...options,
      nowIso: cycleNowIso,
    });
    results.push(result);
    options?.onCycle?.(cycle, result);
    if (cycle < maxCycles && intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return results;
}
