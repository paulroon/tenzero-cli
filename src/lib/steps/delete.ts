import { join } from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import type { StepContext, StepExecutor } from "./types";
import { resolveStepConfig } from "./types";

export const deleteStep: StepExecutor = async (ctx, config) => {
  const resolved = resolveStepConfig(config, ctx);
  const file = resolved.file as string | undefined;
  const required = resolved.required === true;
  if (typeof file !== "string") {
    throw new Error("delete step requires 'file' string");
  }
  const filePath = join(ctx.projectDirectory, file);
  if (!existsSync(filePath)) {
    if (required) {
      throw new Error(`delete: file not found: ${filePath}`);
    }
    return;
  }
  unlinkSync(filePath);
};
