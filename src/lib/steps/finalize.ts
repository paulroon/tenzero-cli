import type { StepContext, StepExecutor } from "./types";
import { finalizeTzProjectSetup as runFinalize } from "@/lib/projectSetup";
import { ensureProjectType, type ProjectType } from "@/lib/config/project";

export const finalize: StepExecutor = async (ctx, config) => {
  const rawType =
    (config.projectType as string) ?? ctx.answers.projectType;
  const type: ProjectType = ensureProjectType(rawType);

  await runFinalize(ctx.projectPath, {
    name: ctx.projectName,
    type,
    builderAnswers: ctx.answers,
  });
};
