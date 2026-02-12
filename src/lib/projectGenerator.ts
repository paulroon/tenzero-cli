import { join } from "node:path";
import { existsSync } from "node:fs";
import type { ProjectBuilderAnswers } from "@/lib/generators/types";
import type { PipelineStep, StepContext } from "@/lib/steps/types";
import { stepRegistry } from "@/lib/steps/registry";

export type { ProjectBuilderAnswers };

/**
 * Generates a new project from builder answers and pipeline config.
 * Runs each pipeline step in order. Throws on failure.
 */
export async function generateProject(
  projectDirectory: string,
  answers: ProjectBuilderAnswers,
  options: {
    pipeline: PipelineStep[];
    configDir?: string;
    projectType: "symfony" | "nextjs" | "other";
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
    configDir: options.configDir,
  };

  for (const step of options.pipeline) {
    const executor = stepRegistry[step.type];
    if (!executor) {
      throw new Error(`Unknown pipeline step type: ${step.type}`);
    }
    await executor(ctx, step.config ?? {});
  }

  // Always run finalize at the end (implied for all projects)
  await stepRegistry.finalizeTzProjectSetup(ctx, {
    projectType: options.projectType,
  });
}
