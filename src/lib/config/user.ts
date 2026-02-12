import { homedir } from "node:os";
import { join } from "node:path";
import { writeFileSync, existsSync, readdirSync } from "node:fs";
import { parseJsonFile } from "@/lib/json";
import { getUserConfigPath, TZCONFIG_FILENAME } from "@/lib/paths";

export const DEFAULT_EDITOR = "cursor";

export type TzConfig = {
  name: string;
  email: string;
  projectDirectory: string;
  projects: string[];
  /** Editor command to open projects (e.g. cursor, code). Default: cursor */
  editor?: string;
};

/** Scan project directory for subdirectories that contain .tzconfig; returns directory names (not full paths). */
export function scanProjects(projectDirectory: string): string[] {
  if (!existsSync(projectDirectory)) return [];
  try {
    const entries = readdirSync(projectDirectory, { withFileTypes: true });
    return entries
      .filter(
        (e) =>
          e.isDirectory() &&
          !e.name.startsWith(".") &&
          existsSync(join(projectDirectory, e.name, TZCONFIG_FILENAME))
      )
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Sync projects array with filesystem; returns updated config. */
export function syncProjects(
  config: Omit<TzConfig, "projects"> & { projects?: string[] }
): TzConfig {
  const projects = scanProjects(config.projectDirectory);
  return { ...config, projects };
}

export function loadConfig(): TzConfig | null {
  const parsed = parseJsonFile<Record<string, unknown>>(getUserConfigPath());
  if (!parsed || typeof parsed.name !== "string") return null;

  const projectDirectory =
    typeof parsed.projectDirectory === "string"
      ? parsed.projectDirectory
      : join(homedir(), "Projects");
  const projects =
    Array.isArray(parsed.projects) &&
    parsed.projects.every((p): p is string => typeof p === "string")
      ? parsed.projects
      : [];
  const email = typeof parsed.email === "string" ? parsed.email : "";
  const editor =
    typeof parsed.editor === "string" && parsed.editor.trim()
      ? parsed.editor.trim()
      : DEFAULT_EDITOR;
  return syncProjects({
    name: parsed.name,
    email,
    projectDirectory,
    projects,
    editor,
  });
}

export function saveConfig(config: TzConfig): void {
  writeFileSync(
    getUserConfigPath(),
    JSON.stringify(config, null, 2),
    "utf-8"
  );
}
