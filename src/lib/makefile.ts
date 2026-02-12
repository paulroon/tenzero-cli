import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

/** Make targets to exclude from the user-facing list */
const EXCLUDED_TARGETS = new Set([
  "%",
  ".PHONY",
  ".DEFAULT",
  ".SUFFIXES",
  ".ONESHELL",
  ".IGNORE",
  ".SILENT",
]);

/**
 * Parse a Makefile and extract user-invokable targets.
 * Excludes pattern rules (%), internal targets, and variable definitions.
 */
export function parseMakefileTargets(makefilePath: string): string[] {
  if (!existsSync(makefilePath)) return [];

  let content: string;
  try {
    content = readFileSync(makefilePath, "utf-8");
  } catch {
    return [];
  }

  const targets = new Set<string>();
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // .PHONY: target1 target2 ...
    const phonyMatch = trimmed.match(/^\.PHONY\s*:\s*(.+)$/);
    if (phonyMatch) {
      for (const t of phonyMatch[1].split(/\s+/)) {
        const target = t.trim();
        if (target && !EXCLUDED_TARGETS.has(target)) targets.add(target);
      }
      continue;
    }

    // target: [dependencies]
    const ruleMatch = line.match(/^([a-zA-Z0-9][a-zA-Z0-9._/-]*)\s*:([^=]|$)/);
    if (ruleMatch) {
      const target = ruleMatch[1].trim();
      if (!EXCLUDED_TARGETS.has(target) && !target.includes("/")) {
        targets.add(target);
      }
    }
  }

  return Array.from(targets).sort();
}

export function getMakefileTargets(projectPath: string): string[] {
  for (const name of ["Makefile", "makefile"]) {
    const path = join(projectPath, name);
    if (existsSync(path)) {
      return parseMakefileTargets(path);
    }
  }
  return [];
}
