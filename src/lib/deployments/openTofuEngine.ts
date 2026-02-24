import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  OpenTofuDockerRunner,
  type AwsBackendSettings,
  type OpenTofuPlanResourceChange,
} from "@/lib/deployments/openTofuRunner";

export type DeploymentRunSummary = {
  add: number;
  change: number;
  destroy: number;
};

export type OpenTofuEnginePlanResult = {
  status: "healthy" | "drifted";
  summary: DeploymentRunSummary;
  driftDetected: boolean;
  plannedChanges?: OpenTofuPlanResourceChange[];
  logs: string[];
};

export type OpenTofuEngineApplyResult = {
  status: "healthy";
  summary: DeploymentRunSummary;
  providerOutputs?: Record<string, unknown>;
  logs: string[];
};

export type OpenTofuEngineDestroyResult = {
  status: "healthy";
  summary: DeploymentRunSummary;
  logs: string[];
};

export type OpenTofuEngineReportResult = {
  status: "healthy" | "drifted" | "failed";
  driftDetected: boolean;
  providerOutputs?: Record<string, unknown>;
  logs: string[];
  errorMessage?: string;
};

function parsePlanSummary(text: string): DeploymentRunSummary {
  const match = text.match(/Plan:\s+(\d+)\s+to add,\s+(\d+)\s+to change,\s+(\d+)\s+to destroy\./i);
  if (!match) return { add: 0, change: 0, destroy: 0 };
  return {
    add: Number(match[1] ?? 0),
    change: Number(match[2] ?? 0),
    destroy: Number(match[3] ?? 0),
  };
}

function parseApplySummary(text: string): DeploymentRunSummary {
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

function parseDestroySummary(text: string): DeploymentRunSummary {
  const match = text.match(/Destroy complete!\s+Resources:\s+(\d+)\s+destroyed\./i);
  if (!match) return { add: 0, change: 0, destroy: 0 };
  return {
    add: 0,
    change: 0,
    destroy: Number(match[1] ?? 0),
  };
}

export class OpenTofuEngine {
  private readonly backend: AwsBackendSettings;
  private readonly runner: OpenTofuDockerRunner;
  private readonly resolveWorkspacePath: (projectPath: string, environmentId: string) => string;

  constructor(args: {
    backend: AwsBackendSettings;
    runner?: OpenTofuDockerRunner;
    resolveWorkspacePath?: (projectPath: string, environmentId: string) => string;
  }) {
    this.backend = args.backend;
    this.runner = args.runner ?? new OpenTofuDockerRunner();
    this.resolveWorkspacePath =
      args.resolveWorkspacePath ??
      ((projectPath: string, environmentId: string) => {
        const materializedPath = join(projectPath, ".tz", "infra", environmentId);
        return existsSync(materializedPath) ? materializedPath : projectPath;
      });
  }

  private async readProviderOutputs(
    projectPath: string,
    environmentId: string
  ): Promise<Record<string, unknown> | undefined> {
    try {
      const values = await this.runner.runOutputValues({
        projectPath,
        environmentId,
        backend: this.backend,
      });
      return Object.keys(values).length > 0 ? values : undefined;
    } catch {
      return undefined;
    }
  }

  async plan(args: {
    projectPath: string;
    environmentId: string;
  }): Promise<OpenTofuEnginePlanResult> {
    const workspacePath = this.resolveWorkspacePath(args.projectPath, args.environmentId);
    const detailed = await this.runner.runPlanWithJson({
      projectPath: workspacePath,
      environmentId: args.environmentId,
      backend: this.backend,
    });
    const summary = parsePlanSummary(detailed.run.stdout);
    const driftDetected = summary.add + summary.change + summary.destroy > 0;
    return {
      status: driftDetected ? "drifted" : "healthy",
      summary,
      driftDetected,
      plannedChanges: detailed.plannedChanges,
      logs: detailed.run.logs,
    };
  }

  async apply(args: {
    projectPath: string;
    environmentId: string;
  }): Promise<OpenTofuEngineApplyResult> {
    const workspacePath = this.resolveWorkspacePath(args.projectPath, args.environmentId);
    const result = await this.runner.run("apply", {
      projectPath: workspacePath,
      environmentId: args.environmentId,
      backend: this.backend,
    });
    const providerOutputs = await this.readProviderOutputs(workspacePath, args.environmentId);
    return {
      status: "healthy",
      summary: parseApplySummary(result.stdout),
      providerOutputs,
      logs: result.logs,
    };
  }

  async destroy(args: {
    projectPath: string;
    environmentId: string;
  }): Promise<OpenTofuEngineDestroyResult> {
    const workspacePath = this.resolveWorkspacePath(args.projectPath, args.environmentId);
    const result = await this.runner.run("destroy", {
      projectPath: workspacePath,
      environmentId: args.environmentId,
      backend: this.backend,
    });
    return {
      status: "healthy",
      summary: parseDestroySummary(result.stdout),
      logs: result.logs,
    };
  }

  async report(args: {
    projectPath: string;
    environmentId: string;
  }): Promise<OpenTofuEngineReportResult> {
    const workspacePath = this.resolveWorkspacePath(args.projectPath, args.environmentId);
    const planResult = await this.runner.run(
      "plan",
      {
        projectPath: workspacePath,
        environmentId: args.environmentId,
        backend: this.backend,
      },
      { allowNonZero: true }
    );
    if (planResult.exitCode === 0) {
      const providerOutputs = await this.readProviderOutputs(workspacePath, args.environmentId);
      return {
        status: "healthy",
        driftDetected: false,
        providerOutputs,
        logs: [...planResult.logs],
      };
    }
    if (planResult.exitCode === 2) {
      const providerOutputs = await this.readProviderOutputs(workspacePath, args.environmentId);
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
      logs: [...planResult.logs],
      errorMessage: planResult.stderr || "Unable to determine report status",
    };
  }
}
