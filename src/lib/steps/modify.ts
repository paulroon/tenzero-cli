import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { StepContext, StepExecutor } from "./types";
import { resolveStepConfig } from "./types";

export const modify: StepExecutor = async (ctx, config) => {
  const resolved = resolveStepConfig(config, ctx);
  const file = resolved.file;
  const replacements = resolved.replacements;
  // Use raw content for appendIfMissing when interpolate is false (default for append)
  // so Symfony params like %kernel.project_dir% stay literal in .env
  const appendRaw = config.appendIfMissing as
    | { marker: string; content: string; interpolate?: boolean }
    | undefined;
  const appendIfMissing = resolved.appendIfMissing as
    | { marker: string; content: string }
    | undefined;
  if (typeof file !== "string") {
    throw new Error("modify step requires 'file' string");
  }
  const filePath = join(ctx.projectDirectory, file);
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
  if (
    appendIfMissing &&
    typeof appendIfMissing === "object" &&
    typeof appendIfMissing.marker === "string" &&
    !content.includes(appendIfMissing.marker)
  ) {
    const toAppend =
      appendRaw?.interpolate === true && typeof appendIfMissing.content === "string"
        ? appendIfMissing.content
        : typeof appendRaw?.content === "string"
          ? appendRaw.content
          : typeof appendIfMissing.content === "string"
            ? appendIfMissing.content
            : "";
    if (toAppend) {
      const sep = content.length > 0 && !content.endsWith("\n") ? "\n\n" : "\n";
      content = content + sep + toAppend;
    }
  }
  writeFileSync(filePath, content, "utf-8");
};
