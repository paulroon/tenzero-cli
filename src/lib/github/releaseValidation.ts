import { callShell } from "@/lib/shell";
import { getSecretValue } from "@/lib/secrets";

type RepoRef = {
  owner: string;
  repo: string;
};

type WorkflowRun = {
  id: number;
  html_url: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: string | null;
  head_sha: string;
  created_at: string;
};

type WorkflowRunsResponse = {
  workflow_runs?: WorkflowRun[];
};

type WorkflowJob = {
  name: string;
  steps?: Array<{
    name: string;
    status: "queued" | "in_progress" | "completed";
    conclusion: string | null;
  }>;
};

type WorkflowJobsResponse = {
  jobs?: WorkflowJob[];
};

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

async function getRepoRef(projectPath: string): Promise<RepoRef> {
  const remote = await runGit(projectPath, ["remote", "get-url", "origin"]);
  const originUrl = remote.stdout;
  if (remote.exitCode !== 0 || originUrl.length === 0) {
    throw new Error("No git origin configured for this project.");
  }
  const repo = parseGitHubRepoFromOrigin(originUrl);
  if (!repo) {
    throw new Error("Git origin is not a GitHub repository URL.");
  }
  return repo;
}

async function githubFetch<T>(token: string, url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${body || response.statusText}`);
  }
  return (await response.json()) as T;
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
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to read GitHub repo variable '${name}' (${response.status}): ${body || response.statusText}`
    );
  }
  const payload = (await response.json()) as { value?: string };
  const value = payload.value?.trim();
  if (!value) return undefined;
  return value;
}

export async function resolveReleaseImageForTag(args: {
  projectPath: string;
  tag: string;
}): Promise<
  | {
      ok: true;
      imageRef: string;
      imageDigest: string;
      runUrl?: string;
    }
  | {
      ok: false;
      message: string;
      runUrl?: string;
    }
> {
  const startedAtMs = Date.now();
  const matchingWindowStartMs = startedAtMs - 60_000;
  const token = getSecretValue("GITHUB_TOKEN");
  if (!token) {
    return { ok: false, message: "Missing GITHUB_TOKEN. Cannot validate release build status." };
  }
  const repo = await getRepoRef(args.projectPath);
  const shaResult = await runGit(args.projectPath, ["rev-list", "-n", "1", args.tag]);
  if (shaResult.exitCode !== 0 || shaResult.stdout.length === 0) {
    return { ok: false, message: `Cannot resolve commit SHA for tag '${args.tag}'.` };
  }
  const tagSha = shaResult.stdout;

  const runs = await githubFetch<WorkflowRunsResponse>(
    token,
    `https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/runs?event=push&per_page=100`
  );
  const run = (runs.workflow_runs ?? [])
    .filter(
      (item) =>
        item.head_sha === tagSha &&
        new Date(item.created_at).getTime() >= matchingWindowStartMs
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  if (!run) {
    return { ok: false, message: `No GitHub Actions run found for tag '${args.tag}'.` };
  }
  if (run.status !== "completed") {
    return {
      ok: false,
      message: `GitHub Actions run for '${args.tag}' is still ${run.status}.`,
      runUrl: run.html_url,
    };
  }
  if (run.conclusion !== "success") {
    return {
      ok: false,
      message: `GitHub Actions run for '${args.tag}' concluded with '${run.conclusion ?? "unknown"}'.`,
      runUrl: run.html_url,
    };
  }
  const jobs = await githubFetch<WorkflowJobsResponse>(
    token,
    `https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/runs/${run.id}/jobs?per_page=50`
  );
  const allSteps = (jobs.jobs ?? []).flatMap((job) => job.steps ?? []);
  const buildPushStep = allSteps.find((step) => step.name === "Build and push release image");
  if (buildPushStep && buildPushStep.conclusion !== "success") {
    const validateStep = allSteps.find((step) => step.name === "Validate release vars");
    const varsHint =
      validateStep?.conclusion === "success"
        ? "Release workflow likely skipped image publish because required repo variables are missing. Configure AWS_REGION, AWS_ACCOUNT_ID, AWS_OIDC_ROLE_ARN, and ECR_REPOSITORY."
        : "Release workflow did not publish an image for this tag.";
    return {
      ok: false,
      message: varsHint,
      runUrl: run.html_url,
    };
  }

  const awsRegion =
    (await getRepoVariable(token, repo, "AWS_REGION")) ??
    process.env.AWS_REGION?.trim() ??
    process.env.AWS_DEFAULT_REGION?.trim();
  const ecrRepository = await getRepoVariable(token, repo, "ECR_REPOSITORY");
  let awsAccountId = await getRepoVariable(token, repo, "AWS_ACCOUNT_ID");

  if (!awsRegion || !ecrRepository) {
    return {
      ok: false,
      message: "Missing AWS_REGION or ECR_REPOSITORY repo variables for release image resolution.",
      runUrl: run.html_url,
    };
  }

  if (!awsAccountId) {
    const accountResult = await callShell(
      "aws",
      ["sts", "get-caller-identity", "--query", "Account", "--output", "text"],
      {
        cwd: args.projectPath,
        collect: true,
        quiet: true,
        throwOnNonZero: false,
        stdin: "ignore",
      }
    );
    if (accountResult.exitCode === 0) {
      awsAccountId = (accountResult.stdout ?? "").trim();
    }
  }
  if (!awsAccountId) {
    return {
      ok: false,
      message: "Missing AWS_ACCOUNT_ID repo variable and unable to resolve from local AWS identity.",
      runUrl: run.html_url,
    };
  }

  const digestResult = await callShell(
    "aws",
    [
      "ecr",
      "describe-images",
      "--repository-name",
      ecrRepository,
      "--image-ids",
      `imageTag=${args.tag}`,
      "--region",
      awsRegion,
      "--query",
      "imageDetails[0].imageDigest",
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
  const imageDigest = (digestResult.stdout ?? "").trim();
  if (digestResult.exitCode !== 0 || !imageDigest || imageDigest === "None") {
    const digestError = `${digestResult.stderr ?? ""} ${digestResult.stdout ?? ""}`;
    if (
      digestError.includes("ImageNotFoundException") ||
      digestError.includes("imageDigest='null'")
    ) {
      return {
        ok: false,
        message:
          `Release '${args.tag}' completed but no image was published to ECR. ` +
          "Check the GitHub Actions run and ensure release vars are fully configured.",
        runUrl: run.html_url,
      };
    }
    return {
      ok: false,
      message:
        (digestResult.stderr || digestResult.stdout || `Could not resolve ECR digest for tag '${args.tag}'.`).trim(),
      runUrl: run.html_url,
    };
  }

  const imageRef = `${awsAccountId}.dkr.ecr.${awsRegion}.amazonaws.com/${ecrRepository}@${imageDigest}`;
  return {
    ok: true,
    imageRef,
    imageDigest,
    runUrl: run.html_url,
  };
}
