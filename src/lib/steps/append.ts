import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { StepContext, StepExecutor } from "./types";
import { resolveStepConfig } from "./types";

export const append: StepExecutor = async (ctx, config) => {
  const resolved = resolveStepConfig(config, ctx);
  const file = resolved.file as string | undefined;
  const interpolate = config.interpolate === true;
  const toAppend = (interpolate ? resolved.content : config.content) as
    | string
    | undefined;

  if (typeof file !== "string") {
    throw new Error("append step requires 'file' string");
  }
  if (typeof toAppend !== "string") {
    throw new Error("append step requires 'content' string");
  }

  const filePath = join(ctx.projectDirectory, file);
  const existing = existsSync(filePath)
    ? readFileSync(filePath, "utf-8")
    : "";
  const sep = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(filePath, existing + sep + toAppend, "utf-8");
};
