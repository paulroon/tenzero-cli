import { join, dirname as pathDirname } from "node:path";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { StepContext, StepExecutor } from "./types";
import { resolveVariables } from "./types";

export const copyFiles: StepExecutor = async (ctx, config) => {
  const resolved = resolveVariables(config, ctx.answers, ctx.profile) as Record<string, unknown>;
  const source = resolved.source;
  const dest = resolved.dest;
  const interpolate = resolved.interpolate === true;
  if (typeof source !== "string" || typeof dest !== "string") {
    throw new Error("copy step requires 'source' and 'dest' strings");
  }
  const sourcePath = ctx.configDir
    ? join(ctx.configDir, source)
    : join(process.cwd(), source);
  const destPath = join(ctx.projectDirectory, dest);
  if (!existsSync(sourcePath)) {
    throw new Error(`copy: source not found: ${sourcePath}`);
  }
  if (interpolate) {
    const content = readFileSync(sourcePath, "utf-8");
    const interpolated = resolveVariables(content, ctx.answers, ctx.profile) as string;
    mkdirSync(pathDirname(destPath), { recursive: true });
    writeFileSync(destPath, interpolated, "utf-8");
  } else {
    cpSync(sourcePath, destPath, { recursive: true });
  }
};
