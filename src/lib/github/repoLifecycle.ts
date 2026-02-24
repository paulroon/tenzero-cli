import { basename } from "node:path";
import { callShell } from "@/lib/shell";
import { getSecretValue } from "@/lib/secrets";

type RepoRef = {
  owner: string;
  repo: string;
};

type GitHubUser = {
  login?: string;
};

function buildGithubOriginUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}.git`;
}

function buildGithubAuthOriginUrl(owner: string, repo: string, token: string): string {
  const encodedToken = encodeURIComponent(token);
  return `https://x-access-token:${encodedToken}@github.com/${owner}/${repo}.git`;
}

function sanitizeGitMessage(raw: string, token: string): string {
  if (!raw) return raw;
  const encodedToken = encodeURIComponent(token);
  return raw.split(token).join("[REDACTED]").split(encodedToken).join("[REDACTED]");
}

function toRepoName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.length > 0 ? normalized : "app";
}

function parseGitHubRepoFromOrigin(originUrl: string): RepoRef | null {
  const sshMatch = originUrl.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (sshMatch?.[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }
  const httpsMatch = originUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  return null;
}

async function runGit(projectPath: string, args: string[]) {
  const result = await callShell("git", args, {
    cwd: projectPath,
    collect: true,
    quiet: true,
    throwOnNonZero: false,
    stdin: "ignore",
  });
  return {
    exitCode: result.exitCode,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

async function githubFetch(
  token: string,
  url: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
}

export async function ensureGithubOriginForProject(args: {
  projectPath: string;
  projectName: string;
}): Promise<{
  configured: boolean;
  repo?: RepoRef;
  message: string;
}> {
  const token = getSecretValue("GITHUB_TOKEN");
  if (!token) {
    return {
      configured: false,
      message: "Skipped GitHub repo setup: GITHUB_TOKEN not configured.",
    };
  }

  const origin = await runGit(args.projectPath, ["remote", "get-url", "origin"]);
  if (origin.exitCode === 0 && origin.stdout.length > 0) {
    const repo = parseGitHubRepoFromOrigin(origin.stdout);
    if (!repo) {
      return {
        configured: false,
        message: "Skipped GitHub repo setup: origin exists but is not GitHub.",
      };
    }
    return {
      configured: true,
      repo,
      message: `Using existing GitHub origin ${repo.owner}/${repo.repo}.`,
    };
  }

  const meResponse = await githubFetch(token, "https://api.github.com/user");
  if (!meResponse.ok) {
    const body = await meResponse.text();
    return {
      configured: false,
      message: `Skipped GitHub repo setup: failed to resolve token user (${meResponse.status}) ${body || meResponse.statusText}.`,
    };
  }
  const me = (await meResponse.json()) as GitHubUser;
  const owner = typeof me.login === "string" && me.login.trim().length > 0 ? me.login : "";
  if (!owner) {
    return { configured: false, message: "Skipped GitHub repo setup: token user login missing." };
  }
  const repoName = toRepoName(args.projectName || basename(args.projectPath));

  const createRepoResponse = await githubFetch(token, "https://api.github.com/user/repos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: repoName,
      private: true,
      auto_init: false,
    }),
  });
  if (!createRepoResponse.ok && createRepoResponse.status !== 422) {
    const body = await createRepoResponse.text();
    return {
      configured: false,
      message: `Skipped GitHub repo setup: failed to create repo (${createRepoResponse.status}) ${body || createRepoResponse.statusText}.`,
    };
  }

  const originUrl = buildGithubOriginUrl(owner, repoName);
  const addOrigin = await runGit(args.projectPath, ["remote", "add", "origin", originUrl]);
  if (addOrigin.exitCode !== 0) {
    return {
      configured: false,
      message: addOrigin.stderr || addOrigin.stdout || "Failed to add git origin.",
    };
  }

  await runGit(args.projectPath, ["branch", "-M", "main"]);
  const authenticatedOriginUrl = buildGithubAuthOriginUrl(owner, repoName, token);
  const setAuthOrigin = await runGit(args.projectPath, [
    "remote",
    "set-url",
    "origin",
    authenticatedOriginUrl,
  ]);
  if (setAuthOrigin.exitCode !== 0) {
    return {
      configured: false,
      message:
        sanitizeGitMessage(setAuthOrigin.stderr || setAuthOrigin.stdout || "", token) ||
        "Failed to configure authenticated git origin.",
    };
  }
  const pushMain = await runGit(args.projectPath, ["push", "-u", "origin", "main"]);
  const restoreOrigin = await runGit(args.projectPath, [
    "remote",
    "set-url",
    "origin",
    originUrl,
  ]);
  if (restoreOrigin.exitCode !== 0) {
    return {
      configured: false,
      message:
        sanitizeGitMessage(restoreOrigin.stderr || restoreOrigin.stdout || "", token) ||
        "Initial push succeeded, but failed to restore git origin URL.",
    };
  }
  if (pushMain.exitCode !== 0) {
    return {
      configured: false,
      message:
        sanitizeGitMessage(pushMain.stderr || pushMain.stdout || "", token) ||
        "Failed to push initial branch to origin.",
    };
  }
  return {
    configured: true,
    repo: { owner, repo: repoName },
    message: `Configured GitHub origin ${owner}/${repoName}.`,
  };
}

export async function maybeDeleteGithubRepoForProject(projectPath: string): Promise<{
  attempted: boolean;
  message: string;
}> {
  const token = getSecretValue("GITHUB_TOKEN");
  if (!token) {
    return { attempted: false, message: "Skipped remote repo delete: GITHUB_TOKEN not configured." };
  }
  const origin = await runGit(projectPath, ["remote", "get-url", "origin"]);
  if (origin.exitCode !== 0 || origin.stdout.length === 0) {
    return { attempted: false, message: "Skipped remote repo delete: no git origin found." };
  }
  const repo = parseGitHubRepoFromOrigin(origin.stdout);
  if (!repo) {
    return { attempted: false, message: "Skipped remote repo delete: origin is not GitHub." };
  }
  const response = await githubFetch(
    token,
    `https://api.github.com/repos/${repo.owner}/${repo.repo}`,
    { method: "DELETE" }
  );
  if (response.status === 204 || response.status === 404) {
    return {
      attempted: true,
      message:
        response.status === 204
          ? `Deleted remote GitHub repo ${repo.owner}/${repo.repo}.`
          : `Remote GitHub repo ${repo.owner}/${repo.repo} was already missing.`,
    };
  }
  const body = await response.text();
  return {
    attempted: true,
    message: `Failed to delete remote GitHub repo ${repo.owner}/${repo.repo}: ${response.status} ${body || response.statusText}.`,
  };
}
