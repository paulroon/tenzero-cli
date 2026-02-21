import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { getUserConfigsDir } from "@/lib/paths";

const REPO_OWNER = "paulroon";
const REPO_NAME = "tz-project-configs";
const REPO_BRANCH = "main";

type GitHubContentEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
};

async function fetchGitHubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "tz-cli",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

async function fetchGitHubFile(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "tz-cli",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed downloading file (${response.status})`);
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
      const path = join(configsDir, name);
      return existsSync(path) && statSync(path).isDirectory();
    })
    .sort((a, b) => a.localeCompare(b));
}

export function isProjectConfigInstalled(configId: string): boolean {
  return existsSync(getLocalProjectConfigPath(configId));
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
    .filter((entry) => entry.type === "dir")
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export async function installProjectConfig(
  configId: string,
  options?: { replace?: boolean }
): Promise<void> {
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
