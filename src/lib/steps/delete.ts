import { rmSync, existsSync } from "node:fs";
import type { StepContext, StepExecutor } from "./types";
import { resolveStepConfig } from "./types";
import {
  assertNoSymlinkAtPath,
  assertNoSymlinkInExistingPath,
  resolveConfinedPath,
} from "@/lib/pathSafety";

export const deleteStep: StepExecutor = async (ctx, config) => {
  const resolved = resolveStepConfig(config, ctx);
  const file = resolved.file as string | undefined;
  const required = resolved.required === true;
  if (typeof file !== "string") {
    throw new Error("delete step requires 'file' string");
  }
  const filePath = resolveConfinedPath({
    step: "delete",
    field: "file",
    baseDir: ctx.projectPath,
    userPath: file,
  });
  assertNoSymlinkInExistingPath({
    step: "delete",
    field: "file",
    baseDir: ctx.projectPath,
    targetPath: filePath,
  });
  assertNoSymlinkAtPath({ step: "delete", field: "file", path: filePath });
  if (!existsSync(filePath)) {
    if (required) {
      throw new Error(`delete.config.file rejected: file not found: ${file}`);
    }
    return;
  }
  rmSync(filePath, { recursive: true, force: false });
};
