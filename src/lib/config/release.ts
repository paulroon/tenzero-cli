import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseConfigFileResult } from "@/lib/config/parseConfigFile";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

type RawProjectReleaseConfig = {
  version?: unknown;
  tagPrefix?: unknown;
};

export type ProjectReleaseConfig = {
  version: string;
  tagPrefix: string;
};

export type LoadProjectReleaseConfigResult = {
  config: ProjectReleaseConfig | null;
  error?: string;
  exists: boolean;
};

export function getProjectReleaseConfigPath(projectPath: string): string {
  return join(projectPath, ".tz", "release.yaml");
}

export function loadProjectReleaseConfigWithError(
  projectPath: string
): LoadProjectReleaseConfigResult {
  const path = getProjectReleaseConfigPath(projectPath);
  const exists = existsSync(path);
  if (!exists) {
    return { config: null, exists };
  }

  const parsed = parseConfigFileResult<RawProjectReleaseConfig>(path);
  if (!parsed.data) {
    return {
      config: null,
      exists,
      error: parsed.error ?? `Failed to load release config: ${path}`,
    };
  }

  const version = typeof parsed.data.version === "string" ? parsed.data.version.trim() : "";
  if (!SEMVER_PATTERN.test(version)) {
    return {
      config: null,
      exists,
      error: `Invalid release config '${path}': version must be a semantic version (e.g. 1.2.3).`,
    };
  }

  const rawTagPrefix = typeof parsed.data.tagPrefix === "string" ? parsed.data.tagPrefix : "v";
  const tagPrefix = rawTagPrefix.trim().length > 0 ? rawTagPrefix.trim() : "v";
  if (/\s/.test(tagPrefix)) {
    return {
      config: null,
      exists,
      error: `Invalid release config '${path}': tagPrefix must not contain whitespace.`,
    };
  }

  return {
    config: {
      version,
      tagPrefix,
    },
    exists,
  };
}

export function loadProjectReleaseConfig(projectPath: string): ProjectReleaseConfig | null {
  return loadProjectReleaseConfigWithError(projectPath).config;
}
