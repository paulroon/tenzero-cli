import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { StepContext, StepExecutor } from "./types";
import { resolveStepConfig } from "./types";
import {
  assertNoSymlinkAtPath,
  assertNoSymlinkInExistingPath,
  resolveConfinedPath,
} from "@/lib/pathSafety";
import { isInterpolationEnabled, pickInterpolatedString } from "./interpolation";

/** Escape special regex characters for literal string matching */
function escapeRegex(str: string): string {
  return str.replace(/[\\^$.*+?()|[\]{}]/g, "\\$&");
}

export const modify: StepExecutor = async (ctx, config) => {
  const resolved = resolveStepConfig(config, ctx);
  const file = resolved.file;
  const replacements = resolved.replacements;
  const appendRaw = config.appendIfMissing as Record<string, unknown> | undefined;
  const appendResolved = resolved.appendIfMissing as Record<string, unknown> | undefined;
  if (typeof file !== "string") {
    throw new Error("modify step requires 'file' string");
  }
  const filePath = resolveConfinedPath({
    step: "modify",
    field: "file",
    baseDir: ctx.projectPath,
    userPath: file,
  });
  assertNoSymlinkInExistingPath({
    step: "modify",
    field: "file",
    baseDir: ctx.projectPath,
    targetPath: filePath,
  });
  assertNoSymlinkAtPath({ step: "modify", field: "file", path: filePath });
  if (!existsSync(filePath)) {
    throw new Error(`modify.config.file rejected: file not found: ${file}`);
  }
  let content = readFileSync(filePath, "utf-8");
  if (Array.isArray(replacements)) {
    for (const r of replacements) {
      if (
        r &&
        typeof r === "object" &&
        typeof (r as Record<string, unknown>).search === "string" &&
        typeof (r as Record<string, unknown>).replace === "string"
      ) {
        const { search, replace } = r as { search: string; replace: string };
        content = content.replace(new RegExp(escapeRegex(search), "g"), replace);
      }
    }
  }
  if (appendRaw && appendResolved) {
    const appendInterpolate = isInterpolationEnabled(appendRaw, appendResolved);
    const marker = pickInterpolatedString({
      interpolate: appendInterpolate,
      rawValue: appendRaw.marker,
      resolvedValue: appendResolved.marker,
      step: "modify",
      field: "appendIfMissing.marker",
    });
    if (!content.includes(marker)) {
      const toAppend = pickInterpolatedString({
        interpolate: appendInterpolate,
        rawValue: appendRaw.content,
        resolvedValue: appendResolved.content,
        step: "modify",
        field: "appendIfMissing.content",
      });
      if (toAppend) {
        const sep = content.length > 0 && !content.endsWith("\n") ? "\n\n" : "\n";
        content = content + sep + toAppend;
      }
    }
  }
  writeFileSync(filePath, content, "utf-8");
};
