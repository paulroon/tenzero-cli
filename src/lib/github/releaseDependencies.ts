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

async function getRepoRef(projectPath: string): Promise<RepoRef | null> {
  const remote = await runGit(projectPath, ["remote", "get-url", "origin"]);
  if (remote.exitCode !== 0 || remote.stdout.length === 0) return null;
  return parseGitHubRepoFromOrigin(remote.stdout);
}

async function getRepoVariable(
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
  if (!response.ok) return undefined;
  const payload = (await response.json()) as { value?: string };
  const value = payload.value?.trim();
  if (!value || value === "__SET_ME__") return undefined;
  return value;
}

export async function ensureReleaseEcrRepository(args: {
  projectPath: string;
  projectName: string;
  awsRegionHint?: string;
}): Promise<
  | { ok: true; message: string; ecrStatus: "created" | "already-exists" }
  | { ok: false; message: string }
> {
  const token = getSecretValue("GITHUB_TOKEN");
  if (!token) {
    return { ok: false, message: "Missing GITHUB_TOKEN. Cannot ensure release repository." };
  }
  const repo = await getRepoRef(args.projectPath);
  if (!repo) {
    return { ok: false, message: "No GitHub origin configured for this project." };
  }

  const awsRegion =
    (await getRepoVariable(token, repo, "AWS_REGION")) ??
    args.awsRegionHint?.trim() ??
    process.env.AWS_REGION?.trim() ??
    process.env.AWS_DEFAULT_REGION?.trim();
  if (!awsRegion) {
    return { ok: false, message: "Missing AWS region. Set AWS_REGION repo variable first." };
  }

  const ecrRepository =
    (await getRepoVariable(token, repo, "ECR_REPOSITORY")) ??
    `tz-${toProjectSlug(args.projectName || basename(args.projectPath))}-prod`;

  const describeResult = await callShell(
    "aws",
    [
      "ecr",
      "describe-repositories",
      "--repository-names",
      ecrRepository,
      "--region",
      awsRegion,
      "--query",
      "repositories[0].repositoryName",
      "--output",
      "text",
    ],
    {
      cwd: args.projectPath,
      collect: true,
      quiet: true,
      throwOnNonZero: false,
      stdin: "ignore",
    }
  );
  if (describeResult.exitCode === 0) {
    return {
      ok: true,
      message: `Release repository '${ecrRepository}' is ready in ${awsRegion}.`,
      ecrStatus: "already-exists",
    };
  }

  const describeError = `${describeResult.stderr ?? ""} ${describeResult.stdout ?? ""}`;
  const repoMissing =
    describeError.includes("RepositoryNotFoundException") ||
    describeError.includes("does not exist in the registry");
  if (!repoMissing) {
    return {
      ok: false,
      message:
        describeError.trim() ||
        `Failed checking ECR repository '${ecrRepository}' in region '${awsRegion}'.`,
    };
  }

  const createResult = await callShell(
    "aws",
    [
      "ecr",
      "create-repository",
      "--repository-name",
      ecrRepository,
      "--region",
      awsRegion,
      "--image-tag-mutability",
      "MUTABLE",
      "--image-scanning-configuration",
      "scanOnPush=true",
    ],
    {
      cwd: args.projectPath,
      collect: true,
      quiet: true,
      throwOnNonZero: false,
      stdin: "ignore",
    }
  );
  if (createResult.exitCode !== 0) {
    return {
      ok: false,
      message:
        (createResult.stderr || createResult.stdout || "").trim() ||
        `Failed creating ECR repository '${ecrRepository}' in region '${awsRegion}'.`,
    };
  }

  return {
    ok: true,
    message: `Created release repository '${ecrRepository}' in ${awsRegion}.`,
    ecrStatus: "created",
  };
}

export async function deleteReleaseEcrRepository(args: {
  projectPath: string;
  projectName: string;
  awsRegionHint?: string;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const token = getSecretValue("GITHUB_TOKEN");
  const repoRef = token ? await getRepoRef(args.projectPath) : null;

  const awsRegion =
    (token && repoRef ? await getRepoVariable(token, repoRef, "AWS_REGION") : undefined) ??
    args.awsRegionHint?.trim() ??
    process.env.AWS_REGION?.trim() ??
    process.env.AWS_DEFAULT_REGION?.trim();
  if (!awsRegion) {
    return {
      ok: false,
      message: "Missing AWS region. Cannot delete release repository.",
    };
  }

  const ecrRepository =
    (token && repoRef ? await getRepoVariable(token, repoRef, "ECR_REPOSITORY") : undefined) ??
    `tz-${toProjectSlug(args.projectName || basename(args.projectPath))}-prod`;

  const deleteResult = await callShell(
    "aws",
    [
      "ecr",
      "delete-repository",
      "--repository-name",
      ecrRepository,
      "--region",
      awsRegion,
      "--force",
    ],
    {
      cwd: args.projectPath,
      collect: true,
      quiet: true,
      throwOnNonZero: false,
      stdin: "ignore",
    }
  );
  if (deleteResult.exitCode === 0) {
    return {
      ok: true,
      message: `Deleted release repository '${ecrRepository}' in ${awsRegion}.`,
    };
  }
  const deleteError = `${deleteResult.stderr ?? ""} ${deleteResult.stdout ?? ""}`;
  if (
    deleteError.includes("RepositoryNotFoundException") ||
    deleteError.includes("does not exist in the registry")
  ) {
    return {
      ok: true,
      message: `Release repository '${ecrRepository}' was already missing in ${awsRegion}.`,
    };
  }
  return {
    ok: false,
    message:
      deleteError.trim() ||
      `Failed deleting release repository '${ecrRepository}' in region '${awsRegion}'.`,
  };
}
