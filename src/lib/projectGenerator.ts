import { join } from "node:path";
import { existsSync } from "node:fs";
import type { ProjectBuilderAnswers } from "@/lib/generators/types";
import type { PipelineStep, Profile, StepContext } from "@/lib/steps/types";
import { stepRegistry } from "@/lib/steps/registry";

export type { ProjectBuilderAnswers };

/**
 * Generates a new project from builder answers and pipeline config.
 * Runs each pipeline step in order. Throws on failure.
 */
export type { Profile } from "@/lib/steps/types";

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

  for (const step of options.pipeline) {
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
  await stepRegistry.finalizeTzProjectSetup(ctx, {
    projectType: options.projectType,
  });
}
