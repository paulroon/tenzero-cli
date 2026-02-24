import { callShell } from "@/lib/shell";

async function runGit(
  projectPath: string,
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
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

export async function runDeploymentsGitPreflight(args: {
  projectPath: string;
  releaseConfig: { version: string; tagPrefix: string };
}): Promise<void> {
  const { projectPath } = args;

  const insideGit = await runGit(projectPath, ["rev-parse", "--is-inside-work-tree"]);
  if (insideGit.exitCode !== 0 || insideGit.stdout !== "true") {
    throw new Error(
      "Deployment blocked: project is not a valid git working tree. Initialize git and retry."
    );
  }

  const status = await runGit(projectPath, ["status", "--porcelain"]);
  if (status.exitCode !== 0) {
    throw new Error(
      `Deployment blocked: unable to check git working tree state. ${status.stderr || status.stdout || "git status failed."}`
    );
  }
  if (status.stdout.length > 0) {
    throw new Error("Deployment blocked: commit or stash changes first.");
  }

  const branch = await runGit(projectPath, ["branch", "--show-current"]);
  if (branch.exitCode !== 0) {
    throw new Error(
      `Deployment blocked: unable to determine current branch. ${branch.stderr || branch.stdout || "git branch check failed."}`
    );
  }
  if (branch.stdout.length === 0) {
    throw new Error("Deployment blocked: use a branch or tagged release.");
  }

}
