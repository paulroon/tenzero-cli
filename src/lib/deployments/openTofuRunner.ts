import { callShell, type CallShellResult } from "@/lib/shell";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type OpenTofuAction = "init" | "plan" | "apply" | "destroy" | "show" | "output";

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

export type OpenTofuPlanResourceChange = {
  address: string;
  actions: string[];
  providerName?: string;
  resourceType?: string;
};

type OpenTofuPlanJson = {
  resource_changes?: Array<{
    address?: unknown;
    type?: unknown;
    provider_name?: unknown;
    change?: {
      actions?: unknown;
    };
  }>;
};

type OpenTofuOutputJson = Record<
  string,
  {
    value?: unknown;
    sensitive?: unknown;
    type?: unknown;
  }
>;

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
  input: OpenTofuRunInput,
  extraTofuArgs: string[] = []
): string[] {
  const awsDir = join(homedir(), ".aws");
  const awsVolumeArgs = existsSync(awsDir) ? ["-v", `${awsDir}:/root/.aws:ro`] : [];
  const passThroughAwsEnvKeys = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_DEFAULT_REGION",
    "AWS_REGION",
    "AWS_SHARED_CREDENTIALS_FILE",
    "AWS_CONFIG_FILE",
  ] as const;
  const passThroughAwsEnvArgs = passThroughAwsEnvKeys.flatMap((key) => {
    const value = process.env[key];
    if (!value || value.trim().length === 0) return [];
    return ["-e", `${key}=${value}`];
  });

  const backend = input.backend;
  const stateKey = `${backend.statePrefix.replace(/\/+$/, "")}/${input.environmentId}/tofu.tfstate`;
  const tofuArgs =
    action === "init"
      ? ["init", "-input=false", "-no-color"]
      : action === "plan"
      ? ["plan", "-input=false", "-no-color", `-var=tz_environment_id=${input.environmentId}`]
      : action === "apply"
        ? [
            "apply",
            "-auto-approve",
            "-input=false",
            "-no-color",
            `-var=tz_environment_id=${input.environmentId}`,
          ]
        : action === "destroy"
          ? [
              "destroy",
              "-auto-approve",
              "-input=false",
              "-no-color",
              `-var=tz_environment_id=${input.environmentId}`,
            ]
          : action === "show"
            ? ["show", "-no-color"]
            : ["output", "-no-color"];
  const resolvedTofuArgs = [...tofuArgs, ...extraTofuArgs];

  return [
    "run",
    "--rm",
    "-v",
    `${input.projectPath}:/workspace`,
    ...awsVolumeArgs,
    "-w",
    "/workspace",
    "-e",
    `AWS_PROFILE=${backend.profile}`,
    "-e",
    `AWS_REGION=${backend.region}`,
    "-e",
    "TF_IN_AUTOMATION=1",
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
    ...passThroughAwsEnvArgs,
    image,
    ...resolvedTofuArgs,
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
    options?: { allowNonZero?: boolean; extraTofuArgs?: string[] }
  ): Promise<OpenTofuRunResult> {
    if (action !== "init") {
      await this.run("init", input, { allowNonZero: false });
    }
    const args = buildOpenTofuDockerArgs(this.image, action, input, options?.extraTofuArgs ?? []);
    const result = await this.runShell("docker", args, {
      cwd: input.projectPath,
      stdin: "ignore",
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

  async runPlanWithJson(input: OpenTofuRunInput): Promise<{
    run: OpenTofuRunResult;
    plannedChanges: OpenTofuPlanResourceChange[];
  }> {
    const planFile = `.tz-plan-${input.environmentId}.bin`;
    const run = await this.run("plan", input, {
      extraTofuArgs: ["-out", planFile],
    });
    const show = await this.run("show", input, {
      extraTofuArgs: ["-json", planFile],
    });

    let parsedJson: OpenTofuPlanJson | null = null;
    try {
      parsedJson = JSON.parse(show.stdout) as OpenTofuPlanJson;
    } catch {
      parsedJson = null;
    }
    const plannedChanges: OpenTofuPlanResourceChange[] = (parsedJson?.resource_changes ?? [])
      .map((entry) => {
        const address = typeof entry.address === "string" ? entry.address : null;
        const actions = Array.isArray(entry.change?.actions)
          ? entry.change.actions.filter(
              (action): action is string => typeof action === "string" && action.length > 0
            )
          : [];
        const effectiveActions = actions.filter((action) => action !== "no-op");
        if (!address || effectiveActions.length === 0) return null;
        return {
          address,
          actions: effectiveActions,
          providerName:
            typeof entry.provider_name === "string" ? entry.provider_name : undefined,
          resourceType: typeof entry.type === "string" ? entry.type : undefined,
        };
      })
      .filter((item): item is OpenTofuPlanResourceChange => item !== null);

    return { run, plannedChanges };
  }

  async runOutputValues(input: OpenTofuRunInput): Promise<Record<string, unknown>> {
    const output = await this.run("output", input, {
      extraTofuArgs: ["-json"],
    });
    let parsed: OpenTofuOutputJson | null = null;
    try {
      parsed = JSON.parse(output.stdout) as OpenTofuOutputJson;
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const values: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      if (!Object.prototype.hasOwnProperty.call(entry, "value")) continue;
      values[key] = entry.value;
    }
    return values;
  }
}
