import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TZCONFIG_FILENAME } from "./config";

export type TzProjectConfig = {
  name: string;
  path: string;
  type: "symfony" | "nextjs" | "other";
};

export function loadProjectConfig(path: string): TzProjectConfig | null {
  const configPath = join(path, TZCONFIG_FILENAME);
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const config = JSON.parse(
      readFileSync(configPath, "utf8")
    ) as Partial<TzProjectConfig>;

    return {
      name: config.name ?? "unknown",
      path,
      type: (config.type as TzProjectConfig["type"]) ?? "other",
    };
  } catch {
    return null;
  }
}
