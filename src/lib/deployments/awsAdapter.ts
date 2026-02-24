import type { TzConfig } from "@/lib/config";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ShellError } from "@/lib/shell";
import {
  OpenTofuDockerRunner,
  type AwsBackendSettings,
  type OpenTofuPlanResourceChange,
} from "@/lib/deployments/openTofuRunner";
import type {
  AdapterError,
  ApplyResult,
  DeployAdapter,
  DestroyResult,
  PlanResult,
  PlannedResourceChange,
  ReportResult,
} from "@/lib/deployments/orchestrator";

function requireAwsBackend(config: TzConfig): AwsBackendSettings {
  const backend = config.integrations?.aws?.backend;
  if (!backend) {
    throw new Error(
      "BACKEND_CONFIG_INVALID: Missing AWS backend config. Configure Deployments backend settings first."
    );
  }
  return backend;
}

function parsePlanSummary(text: string): { add: number; change: number; destroy: number } {
  const match = text.match(/Plan:\s+(\d+)\s+to add,\s+(\d+)\s+to change,\s+(\d+)\s+to destroy\./i);
  if (!match) return { add: 0, change: 0, destroy: 0 };
  return {
    add: Number(match[1] ?? 0),
    change: Number(match[2] ?? 0),
    destroy: Number(match[3] ?? 0),
  };
}

function parseApplySummary(text: string): { add: number; change: number; destroy: number } {
  const match = text.match(
    /Apply complete!\s+Resources:\s+(\d+)\s+added,\s+(\d+)\s+changed,\s+(\d+)\s+destroyed\./i
  );
  if (!match) return { add: 0, change: 0, destroy: 0 };
  return {
    add: Number(match[1] ?? 0),
    change: Number(match[2] ?? 0),
    destroy: Number(match[3] ?? 0),
  };
}

function parseDestroySummary(text: string): { add: number; change: number; destroy: number } {
  const match = text.match(/Destroy complete!\s+Resources:\s+(\d+)\s+destroyed\./i);
  if (!match) return { add: 0, change: 0, destroy: 0 };
  return {
    add: 0,
    change: 0,
    destroy: Number(match[1] ?? 0),
  };
}

function normalizeAdapterError(error: unknown): AdapterError {
  if (error instanceof ShellError) {
    if (error.exitCode === 127) {
      return {
        code: "RUNNER_UNAVAILABLE",
        message: "Docker/OpenTofu runner unavailable. Ensure Docker is installed and running.",
      };
    }
    return {
      code: "TF_CMD_FAILED",
      message: error.stderr?.trim() || error.message,
    };
  }
  return {
    code: "ADAPTER_ERROR",
    message: error instanceof Error ? error.message : "Unknown adapter error",
  };
}

function toPlannedChanges(
  changes: OpenTofuPlanResourceChange[] | undefined
): PlannedResourceChange[] | undefined {
  if (!changes || changes.length === 0) return undefined;
  return changes.map((entry) => ({
    address: entry.address,
    actions: entry.actions,
    providerName: entry.providerName,
    resourceType: entry.resourceType,
  }));
}

async function readProviderOutputs(
  runner: OpenTofuDockerRunner,
  projectPath: string,
  environmentId: string,
  backend: AwsBackendSettings
): Promise<Record<string, unknown> | undefined> {
  try {
    const values = await runner.runOutputValues({
      projectPath,
      environmentId,
      backend,
    });
    return Object.keys(values).length > 0 ? values : undefined;
  } catch {
    return undefined;
  }
}

export function createAwsDeployAdapter(
  config: TzConfig,
  options?: { runner?: OpenTofuDockerRunner }
): DeployAdapter {
  const backend = requireAwsBackend(config);
  const runner = options?.runner ?? new OpenTofuDockerRunner();
  const resolveWorkspacePath = (projectPath: string, environmentId: string): string => {
    const materializedPath = join(projectPath, ".tz", "infra", environmentId);
    return existsSync(materializedPath) ? materializedPath : projectPath;
  };

  return {
    async plan({ projectPath, environmentId }): Promise<PlanResult> {
      try {
        const detailed = await runner.runPlanWithJson({
          projectPath: resolveWorkspacePath(projectPath, environmentId),
          environmentId,
          backend,
        });
        const summary = parsePlanSummary(detailed.run.stdout);
        const driftDetected = summary.add + summary.change + summary.destroy > 0;
        return {
          status: driftDetected ? "drifted" : "healthy",
          summary,
          driftDetected,
          plannedChanges: toPlannedChanges(detailed.plannedChanges),
          logs: detailed.run.logs,
        };
      } catch (error) {
        return {
          status: "failed",
          summary: { add: 0, change: 0, destroy: 0 },
          driftDetected: false,
          errors: [normalizeAdapterError(error)],
          logs: [error instanceof Error ? error.message : "Plan failed"],
        };
      }
    },

    async apply({ projectPath, environmentId }): Promise<ApplyResult> {
      try {
        const workspacePath = resolveWorkspacePath(projectPath, environmentId);
        const result = await runner.run("apply", {
          projectPath: workspacePath,
          environmentId,
          backend,
        });
        const providerOutputs = await readProviderOutputs(
          runner,
          workspacePath,
          environmentId,
          backend
        );
        return {
          status: "healthy",
          summary: parseApplySummary(result.stdout),
          providerOutputs,
          logs: result.logs,
        };
      } catch (error) {
        return {
          status: "failed",
          summary: { add: 0, change: 0, destroy: 0 },
          errors: [normalizeAdapterError(error)],
          logs: [error instanceof Error ? error.message : "Apply failed"],
        };
      }
    },

    async destroy({ projectPath, environmentId }): Promise<DestroyResult> {
      try {
        const result = await runner.run("destroy", {
          projectPath: resolveWorkspacePath(projectPath, environmentId),
          environmentId,
          backend,
        });
        return {
          status: "healthy",
          summary: parseDestroySummary(result.stdout),
          logs: result.logs,
        };
      } catch (error) {
        return {
          status: "failed",
          summary: { add: 0, change: 0, destroy: 0 },
          errors: [normalizeAdapterError(error)],
          logs: [error instanceof Error ? error.message : "Destroy failed"],
        };
      }
    },

    async report({ projectPath, environmentId }): Promise<ReportResult> {
      try {
        const workspacePath = resolveWorkspacePath(projectPath, environmentId);
        const planResult = await runner.run(
          "plan",
          { projectPath: workspacePath, environmentId, backend },
          { allowNonZero: true }
        );
        if (planResult.exitCode === 0) {
          const providerOutputs = await readProviderOutputs(
            runner,
            workspacePath,
            environmentId,
            backend
          );
          return {
            status: "healthy",
            driftDetected: false,
            providerOutputs,
            logs: [...planResult.logs],
          };
        }
        if (planResult.exitCode === 2) {
          const providerOutputs = await readProviderOutputs(
            runner,
            workspacePath,
            environmentId,
            backend
          );
          return {
            status: "drifted",
            driftDetected: true,
            providerOutputs,
            logs: [...planResult.logs],
          };
        }
        return {
          status: "failed",
          driftDetected: false,
          errors: [
            {
              code: "TF_REPORT_FAILED",
              message: planResult.stderr || "Unable to determine report status",
            },
          ],
          logs: [...planResult.logs],
        };
      } catch (error) {
        return {
          status: "failed",
          driftDetected: false,
          errors: [normalizeAdapterError(error)],
          logs: [error instanceof Error ? error.message : "Report failed"],
        };
      }
    },
  };
}
