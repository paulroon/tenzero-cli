import type { StepContext, StepExecutor } from "./types";
import { finalizeTzProjectSetup as runFinalize } from "@/lib/projectSetup";
import { ensureProjectType, type ProjectType } from "@/lib/config/project";

export const finalize: StepExecutor = async (ctx, config) => {
  const rawType =
    (config.projectType as string) ?? ctx.answers.projectType;
  const type: ProjectType = ensureProjectType(rawType);
  const bootstrapReleaseConfig = config.bootstrapReleaseConfig === true;
  const bootstrapReleaseWorkflow = config.bootstrapReleaseWorkflow === true;
  const templateId =
    typeof config.templateId === "string" && config.templateId.trim().length > 0
      ? config.templateId.trim()
      : undefined;
  const awsRegionForReleaseWorkflow =
    typeof config.awsRegionForReleaseWorkflow === "string"
      ? config.awsRegionForReleaseWorkflow
      : undefined;

  await runFinalize(ctx.projectPath, {
    name: ctx.projectName,
    type,
    templateId,
    builderAnswers: ctx.answers,
    bootstrapReleaseConfig,
    bootstrapReleaseWorkflow,
    awsRegionForReleaseWorkflow,
  });
};
