import { join } from "node:path";
import { TZCONFIG_FILENAME } from "./config";
import { parseJsonFile } from "./json";

export type TzProjectConfig = {
  name: string;
  path: string;
  type: "symfony" | "nextjs" | "other";
};

const VALID_TYPES: TzProjectConfig["type"][] = ["symfony", "nextjs", "other"];

export function loadProjectConfig(path: string): TzProjectConfig | null {
  const config = parseJsonFile<Partial<TzProjectConfig>>(
    join(path, TZCONFIG_FILENAME)
  );
  if (!config) return null;

  const type = config.type && VALID_TYPES.includes(config.type)
    ? config.type
    : "other";

  return {
    name: config.name ?? "unknown",
    path,
    type,
  };
}
