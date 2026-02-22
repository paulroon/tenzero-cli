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
  getUserConfigPath,
  PROJECT_BUILDER_CONFIG_FILENAMES,
} from "@/lib/paths";
import { parseConfigFile } from "@/lib/config/parseConfigFile";
import { getSecretValue } from "@/lib/secrets";
import { parseJsonFile } from "@/lib/json";

const REPO_OWNER = "paulroon";
const REPO_NAME = "tz-project-configs";
const REPO_BRANCH = "main";
const SOURCE_META_FILENAME = ".tz-template-source.json";

type RepoRefResolution = {
  ref: string;
  pinned: boolean;
};

let cachedRepoRef: RepoRefResolution | null = null;

type GitHubContentEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  sha: string;
};

type GitHubBranchResponse = {
  commit?: {
    sha?: unknown;
  };
};

type GitHubFileResponse = {
  type: "file";
  path: string;
  content?: unknown;
  encoding?: unknown;
};

function isIgnoredProjectConfigId(configId: string): boolean {
  return configId.startsWith(".");
}

function withCacheBust(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("_tz", Date.now().toString());
  return parsed.toString();
}

function getConfiguredProjectConfigRef(): string | null {
  const raw = parseJsonFile<Record<string, unknown>>(getUserConfigPath());
  const ref = raw?.projectConfigRef;
  if (typeof ref !== "string") return null;
  const normalized = ref.trim();
  return normalized.length > 0 ? normalized : null;
}

async function resolveDefaultBranchToCommitSha(): Promise<string> {
  const encodedBranch = encodeURIComponent(REPO_BRANCH);
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/branches/${encodedBranch}`;
  const branch = await fetchGitHubJson<GitHubBranchResponse>(url);
  const sha = branch.commit?.sha;
  if (typeof sha !== "string" || !/^[a-f0-9]{40}$/i.test(sha)) {
    throw new Error("Failed to resolve template repository branch to a pinned commit SHA.");
  }
  return sha;
}

async function getEffectiveRepoRef(): Promise<RepoRefResolution> {
  if (cachedRepoRef) return cachedRepoRef;
  const configuredRef = getConfiguredProjectConfigRef();
  if (configuredRef) {
    cachedRepoRef = { ref: configuredRef, pinned: true };
    return cachedRepoRef;
  }
  const resolvedSha = await resolveDefaultBranchToCommitSha();
  cachedRepoRef = { ref: resolvedSha, pinned: true };
  return cachedRepoRef;
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

async function listRepoPath(pathInRepo: string, ref: string): Promise<GitHubContentEntry[]> {
  const encodedPath = pathInRepo
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodedPath}?ref=${encodeURIComponent(
    ref
  )}`;
  const data = await fetchGitHubJson<GitHubContentEntry[] | GitHubContentEntry>(url);
  if (!Array.isArray(data)) {
    throw new Error(`Expected directory for '${pathInRepo}'`);
  }
  return data;
}

async function fetchRepoFile(pathInRepo: string, ref: string): Promise<Uint8Array> {
  const encodedPath = pathInRepo
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodedPath}?ref=${encodeURIComponent(
    ref
  )}`;
  const data = await fetchGitHubJson<GitHubFileResponse | GitHubContentEntry[]>(url);
  if (Array.isArray(data)) {
    throw new Error(`Expected file for '${pathInRepo}'`);
  }
  if (data.type !== "file") {
    throw new Error(`Expected file for '${pathInRepo}'`);
  }
  if (data.encoding !== "base64" || typeof data.content !== "string") {
    throw new Error(`Unexpected content encoding while downloading '${pathInRepo}'`);
  }
  const raw = data.content.replace(/\n/g, "");
  return new Uint8Array(Buffer.from(raw, "base64"));
}

async function downloadRepoDirectory(
  pathInRepo: string,
  localTarget: string,
  ref: string
): Promise<void> {
  const entries = await listRepoPath(pathInRepo, ref);
  for (const entry of entries) {
    const destinationPath = join(localTarget, entry.name);
    if (entry.type === "dir") {
      mkdirSync(destinationPath, { recursive: true });
      await downloadRepoDirectory(entry.path, destinationPath, ref);
      continue;
    }
    if (entry.type === "file") {
      const fileBytes = await fetchRepoFile(entry.path, ref);
      mkdirSync(dirname(destinationPath), { recursive: true });
      writeFileSync(destinationPath, fileBytes);
    }
  }
}

function writeTemplateSourceMetadata(configId: string, destination: string, ref: string): void {
  const metaPath = join(destination, SOURCE_META_FILENAME);
  const metadata = {
    templateId: configId,
    repository: `${REPO_OWNER}/${REPO_NAME}`,
    ref,
    installedAt: new Date().toISOString(),
  };
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf-8");
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
  const repoRef = await getEffectiveRepoRef();
  const root = await fetchGitHubJson<GitHubContentEntry[]>(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents?ref=${encodeURIComponent(
      repoRef.ref
    )}`
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
    throw new Error(`Invalid app template id: ${configId}`);
  }

  const replace = options?.replace === true;
  const configsDir = getLocalProjectConfigsDir();
  const destination = getLocalProjectConfigPath(configId);

  mkdirSync(configsDir, { recursive: true });

  if (existsSync(destination)) {
    if (!replace) {
      throw new Error(`App template already installed: ${configId}`);
    }
    rmSync(destination, { recursive: true, force: true });
  }

  const repoRef = await getEffectiveRepoRef();
  mkdirSync(destination, { recursive: true });
  await downloadRepoDirectory(configId, destination, repoRef.ref);
  writeTemplateSourceMetadata(configId, destination, repoRef.ref);
}
