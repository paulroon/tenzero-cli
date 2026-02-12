import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { TZCONFIG_FILENAME } from "./config";
import { parseJsonFile } from "./json";

export type TzProjectConfig = {
  name: string;
  path: string;
  type: "symfony" | "nextjs" | "other";
  /** Answers from the project builder (projectName, projectType, symfonyAuth, etc.) */
  builderAnswers?: Record<string, string>;
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

  const builderAnswers =
    config.builderAnswers &&
    typeof config.builderAnswers === "object" &&
    !Array.isArray(config.builderAnswers)
      ? (config.builderAnswers as Record<string, string>)
      : undefined;

  return {
    name: config.name ?? "unknown",
    path,
    type,
    builderAnswers,
  };
}

export function saveProjectConfig(
  projectPath: string,
  config: Partial<TzProjectConfig>
): void {
  const configPath = join(projectPath, TZCONFIG_FILENAME);
  writeFileSync(
    configPath,
    JSON.stringify({ ...config, path: projectPath }, null, 2),
    "utf-8"
  );
}
