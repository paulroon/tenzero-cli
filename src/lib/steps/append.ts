import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { StepContext, StepExecutor } from "./types";
import { resolveStepConfig } from "./types";
import { isInterpolationEnabled, pickInterpolatedString } from "./interpolation";

export const append: StepExecutor = async (ctx, config) => {
  const resolved = resolveStepConfig(config, ctx);
  const file = resolved.file as string | undefined;
  const interpolate = isInterpolationEnabled(config, resolved);

  if (typeof file !== "string") {
    throw new Error("append step requires 'file' string");
  }
  const toAppend = pickInterpolatedString({
    interpolate,
    rawValue: config.content,
    resolvedValue: resolved.content,
    step: "append",
    field: "content",
  });

  const filePath = join(ctx.projectPath, file);
  const existing = existsSync(filePath)
    ? readFileSync(filePath, "utf-8")
    : "";
  const sep = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(filePath, existing + sep + toAppend, "utf-8");
};
