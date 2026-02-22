import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";

export type ConfigParseResult<T> = {
  data: T | null;
  error?: string;
};

/**
 * Parse JSON or YAML config files.
 * Returns null when file doesn't exist or parsing fails.
 */
export function parseConfigFile<T = unknown>(path: string): T | null {
  return parseConfigFileResult<T>(path).data;
}

export function parseConfigFileResult<T = unknown>(path: string): ConfigParseResult<T> {
  if (!existsSync(path)) {
    return { data: null, error: `Config file not found: ${path}` };
  }

  try {
    const raw = readFileSync(path, "utf-8");
    const ext = extname(path).toLowerCase();
    if (ext === ".yaml" || ext === ".yml") {
      try {
        return { data: parseYaml(raw) as T };
      } catch (err) {
        const reason = err instanceof Error ? err.message : "unknown YAML parse error";
        return { data: null, error: `Failed to parse YAML config '${path}': ${reason}` };
      }
    }
    try {
      return { data: JSON.parse(raw) as T };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown JSON parse error";
      return { data: null, error: `Failed to parse JSON config '${path}': ${reason}` };
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown read error";
    return { data: null, error: `Failed to read config '${path}': ${reason}` };
  }
}
