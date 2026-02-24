import type { TzConfig } from "@/lib/config";
import { ShellError } from "@/lib/shell";
import {
  type AwsBackendSettings,
  type OpenTofuPlanResourceChange,
} from "@/lib/deployments/openTofuRunner";
import { OpenTofuDockerRunner } from "@/lib/deployments/openTofuRunner";
import { OpenTofuEngine } from "@/lib/deployments/openTofuEngine";
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

export function createAwsDeployAdapter(
  config: TzConfig,
  options?: { runner?: OpenTofuDockerRunner; engine?: OpenTofuEngine }
): DeployAdapter {
  const backend = requireAwsBackend(config);
  const runner = options?.runner ?? new OpenTofuDockerRunner();
  const engine = options?.engine ?? new OpenTofuEngine({ backend, runner });

  return {
    async plan({ projectPath, environmentId }): Promise<PlanResult> {
      try {
        const result = await engine.plan({ projectPath, environmentId });
        return {
          status: result.status,
          summary: result.summary,
          driftDetected: result.driftDetected,
          plannedChanges: toPlannedChanges(result.plannedChanges),
          logs: result.logs,
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
        const result = await engine.apply({ projectPath, environmentId });
        return {
          status: result.status,
          summary: result.summary,
          providerOutputs: result.providerOutputs,
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
        const result = await engine.destroy({ projectPath, environmentId });
        return {
          status: result.status,
          summary: result.summary,
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
        const result = await engine.report({ projectPath, environmentId });
        if (result.status === "healthy" || result.status === "drifted") {
          return {
            status: result.status,
            driftDetected: result.driftDetected,
            providerOutputs: result.providerOutputs,
            logs: result.logs,
          };
        }
        return {
          status: "failed",
          driftDetected: false,
          errors: [
            {
              code: "TF_REPORT_FAILED",
              message: result.errorMessage ?? "Unable to determine report status",
            },
          ],
          logs: result.logs,
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
