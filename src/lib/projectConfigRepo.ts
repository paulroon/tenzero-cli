import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  getUserConfigsDir,
  PROJECT_BUILDER_CONFIG_FILENAMES,
} from "@/lib/paths";
import { parseConfigFile } from "@/lib/config/parseConfigFile";
import { getSecretValue } from "@/lib/secrets";

const REPO_OWNER = "paulroon";
const REPO_NAME = "tz-project-configs";
const REPO_BRANCH = "main";

type GitHubContentEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
};

function isIgnoredProjectConfigId(configId: string): boolean {
  return configId.startsWith(".");
}

function withCacheBust(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("_tz", Date.now().toString());
  return parsed.toString();
}

function githubHeaders(base?: Record<string, string>): Record<string, string> {
  const token = getSecretValue("GITHUB_TOKEN");
  if (!token) return { ...(base ?? {}) };
  return {
    ...(base ?? {}),
    Authorization: `Bearer ${token}`,
  };
}

async function fetchGitHubJson<T>(url: string): Promise<T> {
  const response = await fetch(withCacheBust(url), {
    headers: githubHeaders({
      Accept: "application/vnd.github+json",
      "User-Agent": "tz-cli",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");
    const resetTime = reset
      ? new Date(Number(reset) * 1000).toLocaleTimeString()
      : null;
    const rateLimited = response.status === 403 && remaining === "0";
    if (rateLimited) {
      throw new Error(
        `GitHub API rate limit reached. Try again ${
          resetTime ? `after ${resetTime}` : "later"
        }, or set GITHUB_TOKEN to increase the limit.`
      );
    }

    if (response.status === 401) {
      throw new Error(
        "GitHub authentication failed (401). Your GITHUB_TOKEN is missing, invalid, or expired. Update it in Options -> Manage secrets, or unset env var GITHUB_TOKEN/TZ_SECRET_GITHUB_TOKEN if it is wrong."
      );
    }

    if (response.status === 403) {
      throw new Error(
        "GitHub API access denied (403). You may be temporarily rate limited. Try again shortly, or set GITHUB_TOKEN."
      );
    }

    if (response.status === 404) {
      throw new Error(
        "Project config repository or path was not found on GitHub (404)."
      );
    }

    throw new Error(`GitHub API request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

async function fetchGitHubFile(url: string): Promise<Uint8Array> {
  const response = await fetch(withCacheBust(url), {
    headers: githubHeaders({
      "User-Agent": "tz-cli",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "Failed downloading config file: GitHub authentication failed (401). Check GITHUB_TOKEN in Manage secrets or env vars."
      );
    }
    if (response.status === 404) {
      throw new Error("Failed downloading config file: file not found (404).");
    }
    if (response.status === 403) {
      throw new Error(
        "Failed downloading config file: GitHub denied access (403), likely rate limit."
      );
    }
    throw new Error(`Failed downloading file (${response.status}).`);
  }
  const bytes = await response.arrayBuffer();
  return new Uint8Array(bytes);
}

async function listRepoPath(pathInRepo: string): Promise<GitHubContentEntry[]> {
  const encodedPath = pathInRepo
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodedPath}?ref=${REPO_BRANCH}`;
  const data = await fetchGitHubJson<GitHubContentEntry[] | GitHubContentEntry>(url);
  if (!Array.isArray(data)) {
    throw new Error(`Expected directory for '${pathInRepo}'`);
  }
  return data;
}

async function downloadRepoDirectory(pathInRepo: string, localTarget: string): Promise<void> {
  const entries = await listRepoPath(pathInRepo);
  for (const entry of entries) {
    const destinationPath = join(localTarget, entry.name);
    if (entry.type === "dir") {
      mkdirSync(destinationPath, { recursive: true });
      await downloadRepoDirectory(entry.path, destinationPath);
      continue;
    }
    if (entry.type === "file" && entry.download_url) {
      const fileBytes = await fetchGitHubFile(entry.download_url);
      mkdirSync(dirname(destinationPath), { recursive: true });
      writeFileSync(destinationPath, fileBytes);
    }
  }
}

export function getLocalProjectConfigsDir(): string {
  return getUserConfigsDir();
}

export function getLocalProjectConfigPath(configId: string): string {
  return join(getLocalProjectConfigsDir(), configId);
}

export function listInstalledProjectConfigs(): string[] {
  const configsDir = getLocalProjectConfigsDir();
  if (!existsSync(configsDir)) return [];
  return readdirSync(configsDir)
    .filter((name) => {
      if (isIgnoredProjectConfigId(name)) return false;
      const path = join(configsDir, name);
      return (
        existsSync(path) &&
        statSync(path).isDirectory() &&
        resolveInstalledConfigFilePath(name) !== null
      );
    })
    .sort((a, b) => a.localeCompare(b));
}

export function isProjectConfigInstalled(configId: string): boolean {
  return existsSync(getLocalProjectConfigPath(configId));
}

function resolveInstalledConfigFilePath(configId: string): string | null {
  const configDir = getLocalProjectConfigPath(configId);
  for (const filename of PROJECT_BUILDER_CONFIG_FILENAMES) {
    const candidate = join(configDir, filename);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function getInstalledProjectConfigVersion(
  configId: string
): string | undefined {
  const configPath = resolveInstalledConfigFilePath(configId);
  if (!configPath) return undefined;
  const parsed = parseConfigFile<{ version?: unknown }>(configPath);
  return typeof parsed?.version === "string" ? parsed.version : undefined;
}

export function deleteInstalledProjectConfig(configId: string): void {
  const target = getLocalProjectConfigPath(configId);
  if (!existsSync(target)) return;
  rmSync(target, { recursive: true, force: true });
}

export async function listRemoteProjectConfigs(): Promise<string[]> {
  const root = await fetchGitHubJson<GitHubContentEntry[]>(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents?ref=${REPO_BRANCH}`
  );
  return root
    .filter(
      (entry) => entry.type === "dir" && !isIgnoredProjectConfigId(entry.name)
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function installProjectConfig(
  configId: string,
  options?: { replace?: boolean }
): Promise<void> {
  if (isIgnoredProjectConfigId(configId)) {
    throw new Error(`Invalid project config id: ${configId}`);
  }

  const replace = options?.replace === true;
  const configsDir = getLocalProjectConfigsDir();
  const destination = getLocalProjectConfigPath(configId);

  mkdirSync(configsDir, { recursive: true });

  if (existsSync(destination)) {
    if (!replace) {
      throw new Error(`Config already installed: ${configId}`);
    }
    rmSync(destination, { recursive: true, force: true });
  }

  mkdirSync(destination, { recursive: true });
  await downloadRepoDirectory(configId, destination);
}
