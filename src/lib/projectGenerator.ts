import { join } from "node:path";
import { existsSync } from "node:fs";
import { createSymfonyApp } from "@/lib/generators/symfony";
import type { ProjectBuilderAnswers } from "@/lib/generators/types";
import { finalizeTzProjectSetup } from "@/lib/projectSetup";

export type { ProjectBuilderAnswers };

/**
 * Generates a new project from builder answers. Creates the project in
 * projectDirectory and throws on failure. Finalizes with .tzconfig, .gitignore,
 * and initial git commit.
 */
export async function generateProject(
  projectDirectory: string,
  answers: ProjectBuilderAnswers
): Promise<void> {
  const projectName = answers.projectName?.trim();
  if (!projectName) {
    throw new Error("Project name is required");
  }

  const projectPath = join(projectDirectory, projectName);
  if (existsSync(projectPath)) {
    throw new Error(`Project already exists: ${projectName}`);
  }

  const projectType = answers.projectType;
  if (projectType !== "symfony") {
    throw new Error("Only Symfony projects are supported for creation at this time.");
  }

  await createSymfonyApp(projectDirectory, projectName, answers);

  await finalizeTzProjectSetup(projectPath, {
    name: projectName,
    type: "symfony",
    builderAnswers: answers,
  });
}
