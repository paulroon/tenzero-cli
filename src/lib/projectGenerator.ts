import { join } from "node:path";
import { existsSync } from "node:fs";
import type { ProjectBuilderAnswers, PipelineStep, Profile, StepContext } from "@/lib/steps/types";
import { stepRegistry } from "@/lib/steps/registry";
import { getApplicablePipelineSteps } from "@/lib/config/projectBuilder";
import type { ProjectType } from "@/lib/config/project";
import { getSecretsForInterpolation } from "@/lib/secrets";
import { getStepLabel } from "./projectGenerator/stepLabels";

export type { ProjectBuilderAnswers, Profile } from "@/lib/steps/types";

export type StepProgress = {
  index: number;
  total: number;
  label: string;
  status: "running" | "done" | "error";
};

export type GenerationProgressCallback = (progress: StepProgress) => void;

/**
 * Generates a new project from builder answers and pipeline config.
 * Runs each pipeline step in order. Skips steps whose 'when' doesn't match answers.
 * Calls onProgress before/after each step for UI updates.
 */
export async function generateProject(
  projectDirectory: string,
  answers: ProjectBuilderAnswers,
  options: {
    pipeline: PipelineStep[];
    configDir?: string;
    projectType: ProjectType;
    bootstrapReleaseConfig?: boolean;
    bootstrapReleaseWorkflow?: boolean;
    awsRegionForReleaseWorkflow?: string;
    profile: Profile;
    allowShellSyntaxCommands?: boolean;
    onProgress?: GenerationProgressCallback;
  }
): Promise<void> {
  const projectName = answers.projectName?.trim();
  if (!projectName) {
    throw new Error("Project name is required");
  }

  const projectPath = join(projectDirectory, projectName);
  if (existsSync(projectPath)) {
    throw new Error(`Project already exists: ${projectName}`);
  }

  const ctx: StepContext = {
    projectDirectory,
    projectPath,
    projectName,
    answers,
    profile: options.profile,
    secrets: getSecretsForInterpolation(),
    allowShellSyntaxCommands: options.allowShellSyntaxCommands,
    configDir: options.configDir,
  };

  const applicableSteps = getApplicablePipelineSteps(options.pipeline, answers);
  const allSteps: Array<{ step: PipelineStep; config: Record<string, unknown> }> = [
    ...applicableSteps.map((step) => ({
      step,
      config: {
        ...step.config,
        interpolate: step.interpolate ?? step.config?.interpolate ?? false,
      },
    })),
    {
      step: {
        type: "finalize",
        config: {
          projectType: options.projectType,
          bootstrapReleaseConfig: options.bootstrapReleaseConfig === true,
          bootstrapReleaseWorkflow: options.bootstrapReleaseWorkflow === true,
          awsRegionForReleaseWorkflow: options.awsRegionForReleaseWorkflow,
        },
      },
      config: {
        projectType: options.projectType,
        bootstrapReleaseConfig: options.bootstrapReleaseConfig === true,
        bootstrapReleaseWorkflow: options.bootstrapReleaseWorkflow === true,
        awsRegionForReleaseWorkflow: options.awsRegionForReleaseWorkflow,
      },
    },
  ];
  const total = allSteps.length;
  const onProgress = options.onProgress;

  for (let i = 0; i < allSteps.length; i++) {
    const { step, config } = allSteps[i];
    const label = getStepLabel(step, ctx);
    onProgress?.({
      index: i,
      total,
      label,
      status: "running",
    });

    const executor = stepRegistry[step.type];
    if (!executor) {
      throw new Error(`Unknown pipeline step type: ${step.type}`);
    }

    try {
      await executor(ctx, config);
      onProgress?.({
        index: i,
        total,
        label,
        status: "done",
      });
    } catch (err) {
      onProgress?.({
        index: i,
        total,
        label,
        status: "error",
      });
      throw err;
    }
  }
}
