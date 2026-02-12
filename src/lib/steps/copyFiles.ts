import { join } from "node:path";
import { cpSync, existsSync } from "node:fs";
import type { StepContext, StepExecutor } from "./types";
import { resolveVariables } from "./types";

export const copyFiles: StepExecutor = async (ctx, config) => {
  const resolved = resolveVariables(config, ctx.answers) as Record<string, unknown>;
  const source = resolved.source;
  const dest = resolved.dest;
  if (typeof source !== "string" || typeof dest !== "string") {
    throw new Error("copyFiles step requires 'source' and 'dest' strings");
  }
  const sourcePath = ctx.configDir
    ? join(ctx.configDir, source)
    : join(process.cwd(), source);
  // dest is relative to projectDirectory (e.g. "%projectName%/.env" -> projectDirectory/projectName/.env)
  const destPath = join(ctx.projectDirectory, dest);
  if (!existsSync(sourcePath)) {
    throw new Error(`copyFiles: source not found: ${sourcePath}`);
  }
  cpSync(sourcePath, destPath, { recursive: true });
};
