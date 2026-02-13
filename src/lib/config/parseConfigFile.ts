import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Parse JSON or YAML config files.
 * Returns null when file doesn't exist or parsing fails.
 */
export function parseConfigFile<T = unknown>(path: string): T | null {
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, "utf-8");
    const ext = extname(path).toLowerCase();
    if (ext === ".yaml" || ext === ".yml") {
      return parseYaml(raw) as T;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
