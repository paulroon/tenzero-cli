import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { parseJsonFile } from "@/lib/json";
import { getUserConfigPath, TZ_PROJECT_CONFIG_FILENAME } from "@/lib/paths";

export const DEFAULT_EDITOR = "cursor";

export type AwsBackendLockStrategy = "s3-lockfile" | "dynamodb";

export type AwsIntegrationConfig = {
  connected: boolean;
  oidcRoleArn?: string;
  backend?: {
    bucket: string;
    region: string;
    profile: string;
    statePrefix: string;
    lockStrategy: AwsBackendLockStrategy;
  };
  backendChecks?: {
    stateReadWritePassed: boolean;
    lockAcquisitionPassed: boolean;
    checkedAt: string;
  };
};

export type DeploymentsConfig = {
  enabled: boolean;
  enabledAt?: string;
  enabledProfile?: string;
};

export type TzConfig = {
  name: string;
  email: string;
  projectDirectory: string;
  projects: string[];
  /** Editor command to open projects (e.g. cursor, code). Default: cursor */
  editor?: string;
  /** Allow shell syntax in run commands without per-run confirmation prompt */
  allowShellSyntax?: boolean;
  integrations?: {
    aws?: AwsIntegrationConfig;
  };
  deployments?: DeploymentsConfig;
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
          existsSync(join(projectDirectory, e.name, TZ_PROJECT_CONFIG_FILENAME))
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
  const allowShellSyntax = parsed.allowShellSyntax === true;
  const integrations =
    parsed.integrations && typeof parsed.integrations === "object"
      ? (parsed.integrations as TzConfig["integrations"])
      : undefined;
  const deployments =
    parsed.deployments &&
    typeof parsed.deployments === "object" &&
    (parsed.deployments as { enabled?: unknown }).enabled === true
      ? {
          enabled: true,
          enabledAt:
            typeof (parsed.deployments as { enabledAt?: unknown }).enabledAt === "string"
              ? ((parsed.deployments as { enabledAt: string }).enabledAt)
              : undefined,
          enabledProfile:
            typeof (parsed.deployments as { enabledProfile?: unknown }).enabledProfile === "string"
              ? ((parsed.deployments as { enabledProfile: string }).enabledProfile)
              : undefined,
        }
      : { enabled: false };
  return syncProjects({
    name: parsed.name,
    email,
    projectDirectory,
    projects,
    editor,
    allowShellSyntax,
    integrations,
    deployments,
  });
}

export function saveConfig(config: TzConfig): void {
  mkdirSync(dirname(getUserConfigPath()), { recursive: true });
  writeFileSync(
    getUserConfigPath(),
    JSON.stringify(config, null, 2),
    "utf-8"
  );
}
