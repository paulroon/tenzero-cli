import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { parseJsonFile } from "@/lib/json";
import { TZ_PROJECT_CONFIG_FILENAME } from "@/lib/paths";

export const PROJECT_TYPES = ["symfony", "nextjs", "vanilla-php", "other"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export function isValidProjectType(v: unknown): v is ProjectType {
  return typeof v === "string" && PROJECT_TYPES.includes(v as ProjectType);
}

export function ensureProjectType(v: unknown): ProjectType {
  return isValidProjectType(v) ? v : "other";
}

export type ProjectOpenWith =
  | {
      type: "browser";
      url: string;
    };

export type TzProjectConfig = {
  name: string;
  path: string;
  type: ProjectType;
  /** Answers from the project builder (projectName, projectType, symfonyAuth, etc.) */
  builderAnswers?: Record<string, string>;
  openWith?: ProjectOpenWith;
};

export function loadProjectConfig(path: string): TzProjectConfig | null {
  const config = parseJsonFile<Partial<TzProjectConfig>>(
    join(path, TZ_PROJECT_CONFIG_FILENAME)
  );
  if (!config) return null;

  const type = ensureProjectType(config.type);

  const builderAnswers =
    config.builderAnswers &&
    typeof config.builderAnswers === "object" &&
    !Array.isArray(config.builderAnswers)
      ? (config.builderAnswers as Record<string, string>)
      : undefined;

  const openWithCandidate = config.openWith;
  const openWith =
    openWithCandidate &&
    typeof openWithCandidate === "object" &&
    (openWithCandidate as { type?: unknown }).type === "browser" &&
    typeof (openWithCandidate as { url?: unknown }).url === "string"
      ? {
          type: "browser" as const,
          url: (openWithCandidate as { url: string }).url,
        }
      : undefined;

  return {
    name: config.name ?? "unknown",
    path,
    type,
    builderAnswers,
    openWith,
  };
}

export function saveProjectConfig(
  projectPath: string,
  config: Partial<TzProjectConfig>
): void {
  const configPath = join(projectPath, TZ_PROJECT_CONFIG_FILENAME);
  writeFileSync(
    configPath,
    JSON.stringify({ ...config, path: projectPath }, null, 2),
    "utf-8"
  );
}
