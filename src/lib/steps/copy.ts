import { dirname as pathDirname, resolve } from "node:path";
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
import {
  assertNoSymlinkAtPath,
  assertNoSymlinkInExistingPath,
  assertNoSymlinksRecursive,
  resolveConfinedPath,
} from "@/lib/pathSafety";
import { isInterpolationEnabled } from "./interpolation";

export const copy: StepExecutor = async (ctx, config) => {
  const resolved = resolveStepConfig(config, ctx);
  const source = resolved.source;
  const dest = resolved.dest;
  const interpolate = isInterpolationEnabled(config, resolved);
  if (typeof source !== "string" || typeof dest !== "string") {
    throw new Error("copy step requires 'source' and 'dest' strings");
  }
  const sourceBase = ctx.configDir ?? process.cwd();
  const sourcePath = resolveConfinedPath({
    step: "copy",
    field: "source",
    baseDir: sourceBase,
    userPath: source,
  });
  const destPath = resolveConfinedPath({
    step: "copy",
    field: "dest",
    baseDir: ctx.projectPath,
    userPath: dest,
  });
  if (!existsSync(sourcePath)) {
    throw new Error(`copy.config.source rejected: source not found: ${source}`);
  }
  assertNoSymlinkAtPath({ step: "copy", field: "source", path: sourcePath });
  assertNoSymlinkInExistingPath({
    step: "copy",
    field: "dest",
    baseDir: ctx.projectPath,
    targetPath: destPath,
  });
  assertNoSymlinkAtPath({ step: "copy", field: "dest", path: destPath });
  assertNoSymlinksRecursive({ step: "copy", field: "source", rootPath: sourcePath });

  if (interpolate) {
    const stat = statSync(sourcePath);
    if (stat.isDirectory()) {
      copyDirWithInterpolate(
        sourcePath,
        destPath,
        resolve(ctx.projectPath),
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
      assertNoSymlinkInExistingPath({
        step: "copy",
        field: "dest",
        baseDir: ctx.projectPath,
        targetPath: destPath,
      });
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
  projectRoot: string,
  answers: Record<string, string>,
  profile?: { name: string; email: string },
  secrets?: Record<string, string>
): void {
  assertNoSymlinkInExistingPath({
    step: "copy",
    field: "dest",
    baseDir: projectRoot,
    targetPath: destDir,
  });
  mkdirSync(destDir, { recursive: true });
  const entries = readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = resolve(sourceDir, entry.name);
    const destPath = resolve(destDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`copy.config.source rejected: symlink not allowed: ${srcPath}`);
    }
    if (entry.isDirectory()) {
      copyDirWithInterpolate(srcPath, destPath, projectRoot, answers, profile, secrets);
    } else {
      const content = readFileSync(srcPath, "utf-8");
      const interpolated = resolveVariables(
        content,
        answers,
        profile,
        secrets
      ) as string;
      assertNoSymlinkInExistingPath({
        step: "copy",
        field: "dest",
        baseDir: projectRoot,
        targetPath: destPath,
      });
      mkdirSync(pathDirname(destPath), { recursive: true });
      writeFileSync(destPath, interpolated, "utf-8");
    }
  }
}
