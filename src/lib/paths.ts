import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** User config file (~/.tz.json) */
export const USER_CONFIG_FILENAME = ".tz.json";

/** Project config file (.tzconfig.json) */
export const TZ_PROJECT_CONFIG_FILENAME = ".tzconfig.json";

/** Project builder config filename within a project type directory */
export const PROJECT_BUILDER_CONFIG_FILENAME = "config.json";

export function getUserConfigPath(): string {
  return join(homedir(), USER_CONFIG_FILENAME);
}

export function getUserConfigsDir(): string {
  return join(homedir(), ".tz", "configs");
}

/** Bundled project configs (config/projects/) */
export function getBundledProjectsConfigDir(): string {
  return join(__dirname, "..", "..", "config", "projects");
}

/**
 * Directories to search for project builder configs, in order.
 * Bundled first, then ~/.tz/configs when present.
 */
export function getProjectsConfigDirs(): string[] {
  return [getBundledProjectsConfigDir(), getUserConfigsDir()];
}
