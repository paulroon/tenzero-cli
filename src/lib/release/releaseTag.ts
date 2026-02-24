import { callShell } from "@/lib/shell";
import {
  loadProjectReleaseConfigWithError,
} from "@/lib/config";

type Result =
  | { ok: true; tag: string; created: boolean }
  | { ok: false; message: string };

type SuggestResult =
  | { ok: true; tag: string }
  | { ok: false; message: string };

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

function parseSemverCore(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function nextSemverWithPatchRollover10(version: string): string | null {
  const parsed = parseSemverCore(version);
  if (!parsed) return null;
  if (parsed.patch >= 9) {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

function compareSemver(a: string, b: string): number {
  const pa = parseSemverCore(a);
  const pb = parseSemverCore(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

async function ensureCleanGitState(projectPath: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const inside = await runGit(projectPath, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.exitCode !== 0 || inside.stdout !== "true") {
    return { ok: false, message: "Deployment blocked: project is not a valid git working tree." };
  }

  const status = await runGit(projectPath, ["status", "--porcelain"]);
  if (status.exitCode !== 0) {
    return {
      ok: false,
      message:
        status.stderr || status.stdout || "Deployment blocked: unable to check git working tree state.",
    };
  }
  if (status.stdout.length > 0) {
    return { ok: false, message: "Deployment blocked: commit or stash changes first." };
  }

  const branch = await runGit(projectPath, ["branch", "--show-current"]);
  if (branch.exitCode !== 0 || branch.stdout.length === 0) {
    return { ok: false, message: "Deployment blocked: use a branch or tagged release." };
  }
  return { ok: true };
}

export async function suggestNextReleaseTag(projectPath: string): Promise<SuggestResult> {
  const release = loadProjectReleaseConfigWithError(projectPath);
  if (release.error) return { ok: false, message: release.error };
  if (!release.config) {
    return {
      ok: false,
      message:
        "Release config not found. Create .tz/release.yaml with version and tagPrefix first.",
    };
  }
  const releaseConfig = release.config;
  const tagsResult = await runGit(projectPath, [
    "tag",
    "--list",
    `${releaseConfig.tagPrefix}*`,
  ]);
  let baseVersion = releaseConfig.version;
  if (tagsResult.exitCode === 0) {
    const versions = (tagsResult.stdout ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith(releaseConfig.tagPrefix))
      .map((line) => line.slice(releaseConfig.tagPrefix.length))
      .filter((version) => parseSemverCore(version) !== null);
    if (versions.length > 0) {
      baseVersion = versions.sort((a, b) => compareSemver(a, b)).at(-1) ?? baseVersion;
    }
  }

  const next = nextSemverWithPatchRollover10(baseVersion);
  if (!next) {
    return {
      ok: false,
      message: `Cannot compute next release from '${baseVersion}'. Use core semver like 1.2.3.`,
    };
  }
  return { ok: true, tag: `${releaseConfig.tagPrefix}${next}` };
}

export async function createReleaseTagForProject(
  projectPath: string,
  requestedTag: string
): Promise<Result> {
  const release = loadProjectReleaseConfigWithError(projectPath);
  if (release.error) return { ok: false, message: release.error };
  if (!release.config) {
    return {
      ok: false,
      message:
        "Release config not found. Create .tz/release.yaml with version and tagPrefix first.",
    };
  }
  const tag = requestedTag.trim();
  if (!tag.startsWith(release.config.tagPrefix)) {
    return {
      ok: false,
      message: `Release tag must start with '${release.config.tagPrefix}'.`,
    };
  }
  const tagVersion = tag.slice(release.config.tagPrefix.length);
  if (!parseSemverCore(tagVersion)) {
    return { ok: false, message: `Invalid release tag '${tag}'. Expected semantic version tag.` };
  }

  const cleanState = await ensureCleanGitState(projectPath);
  if (!cleanState.ok) return cleanState;

  const existingTag = await runGit(projectPath, ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]);
  if (existingTag.exitCode === 0) {
    return { ok: false, message: `Release tag '${tag}' already exists. Choose another version.` };
  }

  const createTag = await runGit(projectPath, ["tag", tag]);
  if (createTag.exitCode !== 0) {
    return {
      ok: false,
      message: createTag.stderr || createTag.stdout || `Failed to create release tag '${tag}'.`,
    };
  }

  return { ok: true, tag, created: true };
}

export async function pushReleaseTagToOrigin(
  projectPath: string,
  tag: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const release = loadProjectReleaseConfigWithError(projectPath);
  if (release.error) return { ok: false, message: release.error };
  if (!release.config) {
    return {
      ok: false,
      message:
        "Release config not found. Create .tz/release.yaml with version and tagPrefix first.",
    };
  }
  const pushResult = await runGit(projectPath, ["push", "origin", tag]);
  if (pushResult.exitCode !== 0) {
    return {
      ok: false,
      message:
        pushResult.stderr || pushResult.stdout || `Failed to push release tag '${tag}' to origin.`,
    };
  }
  return { ok: true };
}

export async function ensureReleaseTagForProject(projectPath: string): Promise<Result> {
  const release = loadProjectReleaseConfigWithError(projectPath);
  if (release.error) return { ok: false, message: release.error };
  if (!release.config) {
    return {
      ok: false,
      message:
        "Deployment blocked: release config not found. Create .tz/release.yaml with version and tagPrefix first.",
    };
  }
  const expectedTag = `${release.config.tagPrefix}${release.config.version}`;

  const cleanState = await ensureCleanGitState(projectPath);
  if (!cleanState.ok) return cleanState;
  return { ok: true, tag: expectedTag, created: false };
}
