import type { StepContext, StepExecutor } from "./types";
import { finalizeTzProjectSetup as runFinalize } from "@/lib/projectSetup";
import type { TzProjectConfig } from "@/lib/projectConfig";

const VALID_TYPES: TzProjectConfig["type"][] = ["symfony", "nextjs", "other"];

export const finalizeTzProjectSetup: StepExecutor = async (ctx, config) => {
  const rawType =
    (config.projectType as string) ?? ctx.answers.projectType;
  const type: TzProjectConfig["type"] =
    rawType && VALID_TYPES.includes(rawType as TzProjectConfig["type"])
      ? (rawType as TzProjectConfig["type"])
      : "other";

  await runFinalize(ctx.projectPath, {
    name: ctx.projectName,
    type,
    builderAnswers: ctx.answers,
  });
};
