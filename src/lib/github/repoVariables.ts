import { basename } from "node:path";
import { callShell } from "@/lib/shell";
import { getSecretValue } from "@/lib/secrets";

type RepoRef = {
  owner: string;
  repo: string;
};

function toProjectSlug(name: string): string {
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

async function upsertVariable(args: {
  token: string;
  repo: RepoRef;
  name: string;
  value: string;
}): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/${args.repo.owner}/${args.repo.repo}/actions/variables/${args.name}`,
    {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${args.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: args.name,
        value: args.value,
      }),
    }
  );
  if (response.status >= 200 && response.status < 300) return;
  const body = await response.text();
  throw new Error(
    `Failed to set GitHub repo variable '${args.name}' (${response.status}): ${body || response.statusText}`
  );
}

export async function bootstrapGithubRepoVariables(args: {
  projectPath: string;
  projectName: string;
  awsRegion?: string;
}): Promise<{ configured: boolean; message?: string }> {
  const token = getSecretValue("GITHUB_TOKEN");
  if (!token) {
    return {
      configured: false,
      message: "Skipped GitHub variable bootstrap: GITHUB_TOKEN not configured.",
    };
  }

  const remote = await callShell("git", ["remote", "get-url", "origin"], {
    cwd: args.projectPath,
    collect: true,
    quiet: true,
    throwOnNonZero: false,
    stdin: "ignore",
  });
  const originUrl = (remote.stdout ?? "").trim();
  if (remote.exitCode !== 0 || originUrl.length === 0) {
    return {
      configured: false,
      message: "Skipped GitHub variable bootstrap: no git origin configured yet.",
    };
  }
  const repo = parseGitHubRepoFromOrigin(originUrl);
  if (!repo) {
    return {
      configured: false,
      message: "Skipped GitHub variable bootstrap: origin is not a GitHub repository URL.",
    };
  }

  const projectSlug = toProjectSlug(args.projectName || basename(args.projectPath));
  const defaults: Record<string, string> = {
    AWS_REGION: args.awsRegion || "__SET_ME__",
    AWS_ACCOUNT_ID: "__SET_ME__",
    AWS_OIDC_ROLE_ARN: "__SET_ME__",
    ECR_REPOSITORY: `tz-${projectSlug}-prod`,
  };
  for (const [name, value] of Object.entries(defaults)) {
    await upsertVariable({ token, repo, name, value });
  }
  return {
    configured: true,
    message: `Configured GitHub Actions variables for ${repo.owner}/${repo.repo}.`,
  };
}
