import { join, dirname as pathDirname } from "node:path";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import type { StepContext, StepExecutor } from "./types";
import { resolveStepConfig, resolveVariables } from "./types";

export const copy: StepExecutor = async (ctx, config) => {
  const resolved = resolveStepConfig(config, ctx);
  const source = resolved.source;
  const dest = resolved.dest;
  const interpolate = resolved.interpolate === true;
  if (typeof source !== "string" || typeof dest !== "string") {
    throw new Error("copy step requires 'source' and 'dest' strings");
  }
  const sourcePath = ctx.configDir
    ? join(ctx.configDir, source)
    : join(process.cwd(), source);
  const destPath = join(ctx.projectPath, dest);
  if (!existsSync(sourcePath)) {
    throw new Error(`copy: source not found: ${sourcePath}`);
  }
  if (interpolate) {
    const stat = statSync(sourcePath);
    if (stat.isDirectory()) {
      copyDirWithInterpolate(
        sourcePath,
        destPath,
        ctx.answers,
        ctx.profile,
        ctx.secrets
      );
    } else {
      const content = readFileSync(sourcePath, "utf-8");
      const interpolated = resolveVariables(
        content,
        ctx.answers,
        ctx.profile,
        ctx.secrets
      ) as string;
      mkdirSync(pathDirname(destPath), { recursive: true });
      writeFileSync(destPath, interpolated, "utf-8");
    }
  } else {
    cpSync(sourcePath, destPath, { recursive: true });
  }
};

function copyDirWithInterpolate(
  sourceDir: string,
  destDir: string,
  answers: Record<string, string>,
  profile?: { name: string; email: string },
  secrets?: Record<string, string>
): void {
  mkdirSync(destDir, { recursive: true });
  const entries = readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(sourceDir, entry.name);
    const destPath = join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirWithInterpolate(srcPath, destPath, answers, profile, secrets);
    } else {
      const content = readFileSync(srcPath, "utf-8");
      const interpolated = resolveVariables(
        content,
        answers,
        profile,
        secrets
      ) as string;
      mkdirSync(pathDirname(destPath), { recursive: true });
      writeFileSync(destPath, interpolated, "utf-8");
    }
  }
}
