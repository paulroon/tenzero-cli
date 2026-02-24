import { basename } from "node:path";
import { callShell } from "@/lib/shell";
import { getSecretValue } from "@/lib/secrets";

type RepoRef = {
  owner: string;
  repo: string;
};

const REQUIRED_RELEASE_REPO_VARIABLES = [
  "AWS_REGION",
  "AWS_ACCOUNT_ID",
  "AWS_OIDC_ROLE_ARN",
  "ECR_REPOSITORY",
] as const;

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
  const httpsMatch = originUrl.match(
    /^https:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i
  );
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  return null;
}

function isConfiguredVariableValue(value: string | undefined): boolean {
  return !!value && value.trim().length > 0 && value.trim() !== "__SET_ME__";
}

async function getRepoVariableValue(
  token: string,
  repo: RepoRef,
  name: string
): Promise<string | undefined> {
  const response = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/variables/${name}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );
  if (response.status === 404) return undefined;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to read GitHub repo variable '${name}' (${response.status}): ${body || response.statusText}`
    );
  }
  const payload = (await response.json()) as { value?: string };
  const value = payload.value?.trim();
  return value && value.length > 0 ? value : undefined;
}

async function resolveAwsAccountId(projectPath: string): Promise<string | undefined> {
  const accountResult = await callShell(
    "aws",
    ["sts", "get-caller-identity", "--query", "Account", "--output", "text"],
    {
      cwd: projectPath,
      collect: true,
      quiet: true,
      throwOnNonZero: false,
      stdin: "ignore",
    }
  );
  if (accountResult.exitCode !== 0) return undefined;
  const account = (accountResult.stdout ?? "").trim();
  return account.length > 0 && account !== "None" ? account : undefined;
}

async function upsertVariable(args: {
  token: string;
  repo: RepoRef;
  name: string;
  value: string;
}): Promise<void> {
  const updateResponse = await fetch(
    `https://api.github.com/repos/${args.repo.owner}/${args.repo.repo}/actions/variables/${args.name}`,
    {
      method: "PATCH",
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
  if (updateResponse.status >= 200 && updateResponse.status < 300) return;
  if (updateResponse.status === 404) {
    const createResponse = await fetch(
      `https://api.github.com/repos/${args.repo.owner}/${args.repo.repo}/actions/variables`,
      {
        method: "POST",
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
    if (createResponse.status >= 200 && createResponse.status < 300) return;
    const createBody = await createResponse.text();
    throw new Error(
      `Failed to create GitHub repo variable '${args.name}' (${createResponse.status}): ${createBody || createResponse.statusText}`
    );
  }
  const updateBody = await updateResponse.text();
  throw new Error(
    `Failed to update GitHub repo variable '${args.name}' (${updateResponse.status}): ${updateBody || updateResponse.statusText}`
  );
}

export async function bootstrapGithubRepoVariables(args: {
  projectPath: string;
  projectName: string;
  awsRegion?: string;
  oidcRoleArn?: string;
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
  const existingValues: Partial<Record<(typeof REQUIRED_RELEASE_REPO_VARIABLES)[number], string>> = {};
  for (const name of REQUIRED_RELEASE_REPO_VARIABLES) {
    existingValues[name] = await getRepoVariableValue(token, repo, name);
  }
  const inferredRegion =
    (isConfiguredVariableValue(existingValues.AWS_REGION) ? existingValues.AWS_REGION : undefined) ||
    args.awsRegion?.trim() ||
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim();
  const inferredAccountId =
    (isConfiguredVariableValue(existingValues.AWS_ACCOUNT_ID) ? existingValues.AWS_ACCOUNT_ID : undefined) ||
    (await resolveAwsAccountId(args.projectPath));
  const defaults: Record<string, string> = {
    AWS_REGION: inferredRegion || "__SET_ME__",
    AWS_ACCOUNT_ID: inferredAccountId || "__SET_ME__",
    AWS_OIDC_ROLE_ARN:
      existingValues.AWS_OIDC_ROLE_ARN ||
      args.oidcRoleArn?.trim() ||
      "__SET_ME__",
    ECR_REPOSITORY: existingValues.ECR_REPOSITORY || `tz-${projectSlug}-prod`,
  };
  try {
    for (const [name, value] of Object.entries(defaults)) {
      await upsertVariable({ token, repo, name, value });
    }
  } catch (error) {
    return {
      configured: false,
      message:
        error instanceof Error
          ? `Failed GitHub variable bootstrap: ${error.message}`
          : "Failed GitHub variable bootstrap.",
    };
  }
  return {
    configured: true,
    message: `Configured GitHub Actions variables for ${repo.owner}/${repo.repo}.`,
  };
}

export async function validateGithubRepoVariablesForRelease(args: {
  projectPath: string;
}): Promise<{ ok: true } | { ok: false; message: string; missing: string[] }> {
  const token = getSecretValue("GITHUB_TOKEN");
  if (!token) {
    return {
      ok: false,
      message: "Missing GITHUB_TOKEN. Cannot validate GitHub release variables.",
      missing: [...REQUIRED_RELEASE_REPO_VARIABLES],
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
      ok: false,
      message: "No git origin configured yet.",
      missing: [...REQUIRED_RELEASE_REPO_VARIABLES],
    };
  }
  const repo = parseGitHubRepoFromOrigin(originUrl);
  if (!repo) {
    return {
      ok: false,
      message: "Git origin is not a GitHub repository URL.",
      missing: [...REQUIRED_RELEASE_REPO_VARIABLES],
    };
  }

  const missing: string[] = [];
  for (const name of REQUIRED_RELEASE_REPO_VARIABLES) {
    const value = await getRepoVariableValue(token, repo, name);
    if (!isConfiguredVariableValue(value)) {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Release is blocked until required GitHub repo variables are configured: ${missing.join(", ")}.`,
      missing,
    };
  }
  return { ok: true };
}
