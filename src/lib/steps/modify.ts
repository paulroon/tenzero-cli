import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { StepContext, StepExecutor } from "./types";
import { resolveStepConfig } from "./types";

export const modify: StepExecutor = async (ctx, config) => {
  const resolved = resolveStepConfig(config, ctx);
  const file = resolved.file;
  const replacements = resolved.replacements;
  if (typeof file !== "string") {
    throw new Error("modify step requires 'file' string");
  }
  const filePath = join(ctx.projectPath, file);
  if (!existsSync(filePath)) {
    throw new Error(`modify: file not found: ${filePath}`);
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
        content = content.replace(new RegExp(search, "g"), replace);
      }
    }
  }
  writeFileSync(filePath, content, "utf-8");
};
