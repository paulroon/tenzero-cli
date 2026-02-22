import type { TzConfig } from "@/lib/config";
import { ShellError } from "@/lib/shell";
import {
  OpenTofuDockerRunner,
  type AwsBackendSettings,
} from "@/lib/deployments/openTofuRunner";
import type {
  AdapterError,
  ApplyResult,
  DeployAdapter,
  DestroyResult,
  PlanResult,
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

export function createAwsDeployAdapter(
  config: TzConfig,
  options?: { runner?: OpenTofuDockerRunner }
): DeployAdapter {
  const backend = requireAwsBackend(config);
  const runner = options?.runner ?? new OpenTofuDockerRunner();

  return {
    async plan({ projectPath, environmentId }): Promise<PlanResult> {
      try {
        const result = await runner.run("plan", { projectPath, environmentId, backend });
        const summary = parsePlanSummary(result.stdout);
        const driftDetected = summary.add + summary.change + summary.destroy > 0;
        return {
          status: driftDetected ? "drifted" : "healthy",
          summary,
          driftDetected,
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
        const result = await runner.run("apply", { projectPath, environmentId, backend });
        return {
          status: "healthy",
          summary: parseApplySummary(result.stdout),
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
        const result = await runner.run("destroy", { projectPath, environmentId, backend });
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
        const planResult = await runner.run(
          "plan",
          { projectPath, environmentId, backend },
          { allowNonZero: true }
        );
        const showResult = await runner.run("show", { projectPath, environmentId, backend });
        if (planResult.exitCode === 0) {
          return {
            status: "healthy",
            driftDetected: false,
            logs: [...planResult.logs, ...showResult.logs],
          };
        }
        if (planResult.exitCode === 2) {
          return {
            status: "drifted",
            driftDetected: true,
            logs: [...planResult.logs, ...showResult.logs],
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
          logs: [...planResult.logs, ...showResult.logs],
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
