import { join } from "node:path";
import { existsSync } from "node:fs";
import type { ProjectBuilderAnswers, PipelineStep, Profile, StepContext } from "@/lib/steps/types";
import { stepRegistry } from "@/lib/steps/registry";
import { getApplicablePipelineSteps } from "@/lib/config/projectBuilder";

export type { ProjectBuilderAnswers, Profile } from "@/lib/steps/types";

/**
 * Generates a new project from builder answers and pipeline config.
 * Runs each pipeline step in order. Skips steps whose 'when' doesn't match answers.
 */
export async function generateProject(
  projectDirectory: string,
  answers: ProjectBuilderAnswers,
  options: {
    pipeline: PipelineStep[];
    configDir?: string;
    projectType: "symfony" | "nextjs" | "other";
    profile: Profile;
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
    configDir: options.configDir,
  };

  const applicableSteps = getApplicablePipelineSteps(options.pipeline, answers);

  for (const step of applicableSteps) {
    const executor = stepRegistry[step.type];
    if (!executor) {
      throw new Error(`Unknown pipeline step type: ${step.type}`);
    }
    const config = {
      ...step.config,
      interpolate: step.interpolate ?? step.config?.interpolate ?? false,
    };
    await executor(ctx, config);
  }

  // Always run finalize at the end (implied for all projects)
  await stepRegistry.finalize(ctx, {
    projectType: options.projectType,
  });
}
