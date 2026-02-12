import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { parseJsonFile } from "@/lib/json";
import { TZCONFIG_FILENAME } from "@/lib/paths";

export const PROJECT_TYPES = ["symfony", "nextjs", "other"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export function isValidProjectType(v: unknown): v is ProjectType {
  return typeof v === "string" && PROJECT_TYPES.includes(v as ProjectType);
}

export function ensureProjectType(v: unknown): ProjectType {
  return isValidProjectType(v) ? v : "other";
}

export type TzProjectConfig = {
  name: string;
  path: string;
  type: ProjectType;
  /** Answers from the project builder (projectName, projectType, symfonyAuth, etc.) */
  builderAnswers?: Record<string, string>;
};

export function loadProjectConfig(path: string): TzProjectConfig | null {
  const config = parseJsonFile<Partial<TzProjectConfig>>(
    join(path, TZCONFIG_FILENAME)
  );
  if (!config) return null;

  const type = ensureProjectType(config.type);

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
