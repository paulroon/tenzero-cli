import { existsSync, readFileSync } from "node:fs";

/**
 * Read and parse a JSON file. Returns null if file doesn't exist or parsing fails.
 */
export function parseJsonFile<T = unknown>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}
