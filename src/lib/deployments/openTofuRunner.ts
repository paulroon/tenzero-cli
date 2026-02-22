import { callShell, type CallShellResult } from "@/lib/shell";

export type OpenTofuAction = "plan" | "apply" | "destroy" | "show";

export type AwsBackendSettings = {
  bucket: string;
  region: string;
  profile: string;
  statePrefix: string;
  lockStrategy: "s3-lockfile" | "dynamodb";
};

export type OpenTofuRunInput = {
  projectPath: string;
  environmentId: string;
  backend: AwsBackendSettings;
};

export type OpenTofuRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  logs: string[];
};

type ShellExecutor = (
  cmd: string,
  args: string[],
  options?: {
    cwd?: string;
    collect?: boolean;
    throwOnNonZero?: boolean;
  }
) => Promise<CallShellResult>;

export function buildOpenTofuDockerArgs(
  image: string,
  action: OpenTofuAction,
  input: OpenTofuRunInput
): string[] {
  const backend = input.backend;
  const stateKey = `${backend.statePrefix.replace(/\/+$/, "")}/${input.environmentId}/tofu.tfstate`;
  const tofuArgs =
    action === "plan"
      ? ["plan", "-no-color", `-var=tz_environment_id=${input.environmentId}`]
      : action === "apply"
        ? ["apply", "-auto-approve", "-no-color", `-var=tz_environment_id=${input.environmentId}`]
        : action === "destroy"
          ? [
              "destroy",
              "-auto-approve",
              "-no-color",
              `-var=tz_environment_id=${input.environmentId}`,
            ]
          : ["show", "-no-color"];

  return [
    "run",
    "--rm",
    "-v",
    `${input.projectPath}:/workspace`,
    "-w",
    "/workspace",
    "-e",
    `AWS_PROFILE=${backend.profile}`,
    "-e",
    `AWS_REGION=${backend.region}`,
    "-e",
    `TZ_AWS_BACKEND_BUCKET=${backend.bucket}`,
    "-e",
    `TZ_AWS_BACKEND_REGION=${backend.region}`,
    "-e",
    `TZ_AWS_BACKEND_PROFILE=${backend.profile}`,
    "-e",
    `TZ_AWS_BACKEND_STATE_PREFIX=${backend.statePrefix}`,
    "-e",
    `TZ_AWS_BACKEND_LOCK_STRATEGY=${backend.lockStrategy}`,
    "-e",
    `TZ_AWS_BACKEND_STATE_KEY=${stateKey}`,
    image,
    ...tofuArgs,
  ];
}

export class OpenTofuDockerRunner {
  private readonly image: string;
  private readonly runShell: ShellExecutor;

  constructor(options?: { image?: string; shellExecutor?: ShellExecutor }) {
    this.image = options?.image ?? "ghcr.io/opentofu/opentofu:1.8.8";
    this.runShell = options?.shellExecutor ?? callShell;
  }

  async run(
    action: OpenTofuAction,
    input: OpenTofuRunInput,
    options?: { allowNonZero?: boolean }
  ): Promise<OpenTofuRunResult> {
    const args = buildOpenTofuDockerArgs(this.image, action, input);
    const result = await this.runShell("docker", args, {
      cwd: input.projectPath,
      collect: true,
      throwOnNonZero: options?.allowNonZero ? false : true,
    });
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    return {
      exitCode: result.exitCode,
      stdout,
      stderr,
      logs: [stdout, stderr].filter((x) => x.trim().length > 0),
    };
  }
}
