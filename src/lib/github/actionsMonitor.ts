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
  status: "queued" | "in_progress" | "completed";
  conclusion: string | null;
  steps?: Array<{
    name: string;
    status: "queued" | "in_progress" | "completed";
    conclusion: string | null;
  }>;
};

type WorkflowJobsResponse = {
  jobs?: WorkflowJob[];
};

export type ReleaseBuildUpdate = {
  stage: "waiting" | "running" | "completed";
  message: string;
  runUrl?: string;
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

async function githubFetch<T>(
  token: string,
  url: string
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub API request failed (${response.status}): ${body || response.statusText}`
    );
  }
  return (await response.json()) as T;
}

export async function waitForReleaseWorkflowCompletion(args: {
  projectPath: string;
  tag: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  onUpdate?: (update: ReleaseBuildUpdate) => void;
}): Promise<{ ok: true; runUrl?: string } | { ok: false; message: string; runUrl?: string }> {
  const timeoutMs = args.timeoutMs ?? 15 * 60 * 1000;
  const pollIntervalMs = args.pollIntervalMs ?? 3000;
  const startedAtMs = Date.now();
  const matchingWindowStartMs = startedAtMs - 60_000;
  const token = getSecretValue("GITHUB_TOKEN");
  if (!token) {
    return {
      ok: false,
      message: "Missing GITHUB_TOKEN. Cannot monitor GitHub Actions release build.",
    };
  }

  const repo = await getRepoRef(args.projectPath);
  const shaResult = await runGit(args.projectPath, ["rev-list", "-n", "1", args.tag]);
  if (shaResult.exitCode !== 0 || shaResult.stdout.length === 0) {
    return {
      ok: false,
      message: `Cannot resolve commit SHA for tag '${args.tag}'.`,
    };
  }
  const tagSha = shaResult.stdout;

  const start = Date.now();
  let runUrl: string | undefined;
  while (Date.now() - start < timeoutMs) {
    const runs = await githubFetch<WorkflowRunsResponse>(
      token,
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/runs?event=push&per_page=50`
    );
    const matchingRuns = (runs.workflow_runs ?? [])
      .filter(
        (item) =>
          item.head_sha === tagSha &&
          new Date(item.created_at).getTime() >= matchingWindowStartMs
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const run =
      matchingRuns.find((item) => item.status !== "completed") ??
      matchingRuns[0];
    if (!run) {
      args.onUpdate?.({
        stage: "waiting",
        message: `Waiting for GitHub Actions run for tag '${args.tag}'...`,
      });
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      continue;
    }

    runUrl = run.html_url;
    if (run.status !== "completed") {
      const jobs = await githubFetch<WorkflowJobsResponse>(
        token,
        `https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/runs/${run.id}/jobs?per_page=20`
      );
      const activeJobs = (jobs.jobs ?? [])
        .filter((job) => job.status !== "completed")
        .map((job) => {
          const activeStep = (job.steps ?? []).find(
            (step) => step.status === "in_progress" || step.status === "queued"
          );
          if (!activeStep) return job.name;
          return `${job.name} -> ${activeStep.name}`;
        })
        .slice(0, 3);
      args.onUpdate?.({
        stage: "running",
        message:
          activeJobs.length > 0
            ? `Workflow ${run.status}. Active job(s): ${activeJobs.join(", ")}`
            : `Workflow ${run.status}.`,
        runUrl,
      });
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      continue;
    }

    if (run.conclusion === "success") {
      args.onUpdate?.({
        stage: "completed",
        message: "GitHub Actions build completed successfully.",
        runUrl,
      });
      return { ok: true, runUrl };
    }
    args.onUpdate?.({
      stage: "completed",
      message: `GitHub Actions build completed with conclusion '${run.conclusion ?? "unknown"}'.`,
      runUrl,
    });
    return {
      ok: false,
      message: `GitHub Actions build failed with conclusion '${run.conclusion ?? "unknown"}'.`,
      runUrl,
    };
  }
  return {
    ok: false,
    message: `Timed out waiting for GitHub Actions run for '${args.tag}'.`,
    runUrl,
  };
}
