import { cwd } from "node:process";
import { readFileSync } from "node:fs";
import {
  listProjectConfigs,
  loadDeployTemplateConfigWithError,
  loadConfig,
  loadProjectReleaseConfigWithError,
  type TzConfig,
} from "@/lib/config";
import { loadProjectConfig } from "@/lib/config/project";
import { createAwsDeployAdapter } from "@/lib/deployments/awsAdapter";
import { persistResolvedEnvironmentOutputs } from "@/lib/deployments/capabilityPlanner";
import {
  prepareDeployWorkspaceForEnvironment,
  type PrepareDeployWorkspaceResult,
} from "@/lib/deployments/deployWorkspace";
import { validateDeployTemplateContract } from "@/lib/deployments/templateContract";
import { runDeploymentsGitPreflight } from "@/lib/deployments/gitPreflight";
import {
  assertDeploymentsModeEnabled,
  evaluateDeploymentsEnablementGate,
} from "@/lib/deployments/gate";
import {
  runApply,
  runDestroy,
  type PlannedResourceChange,
  runPlan,
  runReport,
  runReportRefreshLoop,
  type ApplyResult,
  type DeployAdapter,
  type DestroyResult,
  type PlanResult,
  type ReportResult,
} from "@/lib/deployments/orchestrator";

type CommandAction = "plan" | "apply" | "destroy" | "report";
type CommandMap = Record<string, string | boolean>;

type DeploymentsCommandDeps = {
  loadUserConfig: () => TzConfig | null;
  loadReleaseConfig: typeof loadProjectReleaseConfigWithError;
  runGitPreflight: typeof runDeploymentsGitPreflight;
  createAdapter: (config: TzConfig) => DeployAdapter;
  evaluateGate: typeof evaluateDeploymentsEnablementGate;
  assertMode: typeof assertDeploymentsModeEnabled;
  runPlan: typeof runPlan;
  runApply: typeof runApply;
  runDestroy: typeof runDestroy;
  runReport: typeof runReport;
  runReportRefreshLoop: typeof runReportRefreshLoop;
  prepareDeployWorkspace: (
    projectPath: string,
    environmentId: string,
    config: TzConfig
  ) => PrepareDeployWorkspaceResult;
  validatePostInterpolationArtifacts: (
    result: PrepareDeployWorkspaceResult,
    writeLine: (text: string) => void
  ) => void;
  validatePostDeployOutputs: (args: {
    projectPath: string;
    environmentId: string;
    providerOutputs: Record<string, unknown>;
    writeLine: (text: string) => void;
  }) => void;
  validateDeployTemplateForProject: (
    projectPath: string,
    writeLine: (text: string) => void
  ) => void;
  getCwd: () => string;
  writeLine: (text: string) => void;
};

const defaultDeps: DeploymentsCommandDeps = {
  loadUserConfig: loadConfig,
  loadReleaseConfig: loadProjectReleaseConfigWithError,
  runGitPreflight: runDeploymentsGitPreflight,
  createAdapter: createAwsDeployAdapter,
  evaluateGate: evaluateDeploymentsEnablementGate,
  assertMode: assertDeploymentsModeEnabled,
  runPlan,
  runApply,
  runDestroy,
  runReport,
  runReportRefreshLoop,
  prepareDeployWorkspace: (projectPath: string, environmentId: string, config: TzConfig) =>
    prepareDeployWorkspaceForEnvironment(projectPath, environmentId, {
      backendRegion: config.integrations?.aws?.backend?.region,
    }),
  validatePostInterpolationArtifacts: (
    result: PrepareDeployWorkspaceResult,
    writeLine: (text: string) => void
  ) => {
    const tfFiles = result.filePaths.filter((path) => path.endsWith(".tf"));
    for (const filePath of tfFiles) {
      const contents = readFileSync(filePath, "utf-8");
      if (contents.includes("{{") || contents.includes("}}")) {
        throw new Error(
          `Deployment blocked: unresolved interpolation token detected in '${filePath}'.`
        );
      }
    }
    if (tfFiles.length > 0) {
      writeLine("Post-interpolation validation passed.");
    }
  },
  validatePostDeployOutputs: ({
    projectPath,
    environmentId,
    providerOutputs,
    writeLine,
  }: {
    projectPath: string;
    environmentId: string;
    providerOutputs: Record<string, unknown>;
    writeLine: (text: string) => void;
  }) => {
    const project = loadProjectConfig(projectPath);
    if (!project) return;
    const templateMeta = listProjectConfigs().find((entry) => entry.id === project.type);
    if (!templateMeta) return;
    const result = loadDeployTemplateConfigWithError(templateMeta.path);
    if (!result.exists || !result.config) return;

    const env = result.config.environments.find((item) => item.id === environmentId);
    if (!env) {
      throw new Error(
        `Deployment blocked: environment '${environmentId}' is not defined in deploy.yaml for template '${project.type}'.`
      );
    }

    const assertType = (type: string, value: unknown): boolean => {
      if (type === "string" || type === "secret_ref") return typeof value === "string";
      if (type === "number") return typeof value === "number";
      if (type === "boolean") return typeof value === "boolean";
      if (type === "json") return typeof value !== "undefined";
      return true;
    };

    for (const output of env.outputs) {
      const hasProviderValue = Object.prototype.hasOwnProperty.call(providerOutputs, output.key);
      if (!hasProviderValue) {
        if (output.required && typeof output.default === "undefined") {
          throw new Error(
            `Deployment blocked: required output '${output.key}' is missing for '${environmentId}'.`
          );
        }
        continue;
      }
      const value = providerOutputs[output.key];
      if (!assertType(output.type, value)) {
        throw new Error(
          `Deployment blocked: output '${output.key}' has invalid type for '${environmentId}'. Expected '${output.type}'.`
        );
      }
    }
    writeLine(`Post-deploy output validation passed for '${environmentId}'.`);
  },
  validateDeployTemplateForProject: (projectPath: string, writeLine: (text: string) => void) => {
    const project = loadProjectConfig(projectPath);
    if (!project) return;
    const templateMeta = listProjectConfigs().find((entry) => entry.id === project.type);
    if (!templateMeta) return;
    const result = loadDeployTemplateConfigWithError(templateMeta.path);
    if (!result.exists) {
      throw new Error(
        `Deployment blocked: deploy.yaml is required for template '${project.type}'.`
      );
    }
    if (!result.config) {
      throw new Error(
        `Deployment blocked: template deploy config is invalid for '${project.type}'. ${result.error ?? "Fix deploy.yaml and retry."}`
      );
    }
    validateDeployTemplateContract({
      templateType: project.type,
      templateConfigPath: templateMeta.path,
      deployConfig: result.config,
    });
    writeLine(`Deploy contract validated for template '${project.type}'.`);
  },
  getCwd: () => cwd(),
  writeLine: (text: string) => console.log(text),
};

function parseArgs(args: string[]): CommandMap {
  const map: CommandMap = {};
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      map[key] = true;
      continue;
    }
    map[key] = next;
    i += 1;
  }
  return map;
}

function asStringArg(map: CommandMap, key: string): string | undefined {
  const value = map[key];
  return typeof value === "string" ? value : undefined;
}

function asNumberArg(map: CommandMap, key: string): number | undefined {
  const value = asStringArg(map, key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasErrors(result: { errors?: Array<{ code: string; message: string }> }): boolean {
  return Array.isArray(result.errors) && result.errors.length > 0;
}

function writePlanSummary(writeLine: (text: string) => void, result: PlanResult): void {
  writeLine(`Status: ${result.status}`);
  writeLine(
    `Plan summary: add=${result.summary.add ?? 0}, change=${result.summary.change ?? 0}, destroy=${result.summary.destroy ?? 0}`
  );
  writeLine(`Drift detected: ${result.driftDetected ? "yes" : "no"}`);
  const plannedChanges = result.plannedChanges ?? [];
  if (plannedChanges.length === 0) {
    writeLine("Planned resource changes: none");
    return;
  }
  writeLine("Planned resource changes:");
  for (const change of plannedChanges) {
    writeLine(`- [${change.actions.join(",")}] ${change.address}`);
  }
}

function writeApplySummary(writeLine: (text: string) => void, result: ApplyResult): void {
  writeLine(`Status: ${result.status}`);
  writeLine(
    `Apply summary: add=${result.summary.add ?? 0}, change=${result.summary.change ?? 0}, destroy=${result.summary.destroy ?? 0}`
  );
}

function writeDestroySummary(writeLine: (text: string) => void, result: DestroyResult): void {
  writeLine(`Status: ${result.status}`);
  writeLine(
    `Destroy summary: add=${result.summary.add ?? 0}, change=${result.summary.change ?? 0}, destroy=${result.summary.destroy ?? 0}`
  );
}

function writeReportSummary(writeLine: (text: string) => void, result: ReportResult): void {
  writeLine(`Status: ${result.status}`);
  writeLine(`Drift detected: ${result.driftDetected ? "yes" : "no"}`);
}

function writeErrors(
  writeLine: (text: string) => void,
  errors: Array<{ code: string; message: string }>
): void {
  writeLine("Errors:");
  for (const error of errors) {
    writeLine(`- [${error.code}] ${error.message}`);
  }
}

function writeReportRemediation(
  writeLine: (text: string) => void,
  environmentId: string,
  result: ReportResult
): void {
  if (result.status === "drifted") {
    writeLine(`Remediation: review plan and apply explicitly for '${environmentId}'.`);
  }
  if (result.status === "unknown") {
    writeLine("Remediation: rerun report after backend/lock health check.");
  }
}

function formatOutputValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "undefined") return "(empty)";
  try {
    return JSON.stringify(value);
  } catch {
    return "(unserializable)";
  }
}

function persistProviderOutputs(
  projectPath: string,
  environmentId: string,
  providerOutputs: Record<string, unknown>,
  writeLine: (text: string) => void
): void {
  if (Object.keys(providerOutputs).length === 0) return;
  const project = loadProjectConfig(projectPath);
  if (!project) return;
  const templateMeta = listProjectConfigs().find((entry) => entry.id === project.type);
  if (!templateMeta) return;
  const deployConfigResult = loadDeployTemplateConfigWithError(templateMeta.path);
  const environment = deployConfigResult.config?.environments.find(
    (entry) => entry.id === environmentId
  );
  if (!environment) return;
  const allowedOutputKeys = new Set(environment.outputs.map((output) => output.key));
  const filteredProviderOutputs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(providerOutputs)) {
    if (!allowedOutputKeys.has(key)) continue;
    filteredProviderOutputs[key] = value;
  }
  if (Object.keys(filteredProviderOutputs).length === 0) return;
  try {
    const outputs = persistResolvedEnvironmentOutputs({
      projectPath,
      environment,
      providerOutputs: filteredProviderOutputs,
    });
    if (outputs.length === 0) return;
    writeLine("Runtime outputs:");
    for (const output of outputs) {
      if (output.sensitive === true && output.key !== "APP_BASE_URL") {
        writeLine(`- ${output.key}: (sensitive)`);
        continue;
      }
      writeLine(`- ${output.key}: ${formatOutputValue(output.value)}`);
    }
  } catch (error) {
    writeLine(
      `Warning: unable to persist runtime outputs for '${environmentId}': ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
}

export async function maybeRunDeploymentsCommand(
  argv: string[],
  overrides?: Partial<DeploymentsCommandDeps>
): Promise<{ handled: boolean; exitCode: number; planChanges?: PlannedResourceChange[] }> {
  if (argv[0] !== "deployments") {
    return { handled: false, exitCode: 0 };
  }
  const deps: DeploymentsCommandDeps = { ...defaultDeps, ...overrides };

  const action = argv[1] as CommandAction | undefined;
  if (!action || !["plan", "apply", "destroy", "report"].includes(action)) {
    deps.writeLine(
      "Usage: tz deployments <plan|apply|destroy|report> --env <environmentId> [--project <path>] [--confirm-env <id>] [--confirm <phrase>] [--confirm-prod <phrase>] [--confirm-drift] [--confirm-drift-prod] [--watch] [--interval-seconds <n>] [--max-cycles <n>]"
    );
    return { handled: true, exitCode: 1 };
  }

  const config = deps.loadUserConfig();
  if (!config) {
    deps.writeLine("User config not found. Run tz setup first.");
    return { handled: true, exitCode: 1 };
  }

  const gate = deps.evaluateGate(config);
  if (!gate.allowed) {
    const issue = gate.issues[0];
    deps.writeLine(
      `Deployments gate blocked: ${issue?.message ?? "unknown issue"}${issue?.remediation ? ` ${issue.remediation}` : ""}`
    );
    return { handled: true, exitCode: 1 };
  }

  try {
    deps.assertMode(config);
  } catch (error) {
    deps.writeLine(error instanceof Error ? error.message : "Deployments mode not enabled.");
    return { handled: true, exitCode: 1 };
  }

  const flags = parseArgs(argv.slice(2));
  const environmentId = asStringArg(flags, "env");
  if (!environmentId) {
    deps.writeLine("Missing required argument: --env <environmentId>");
    return { handled: true, exitCode: 1 };
  }
  const projectPath = asStringArg(flags, "project") ?? deps.getCwd();
  const releaseConfigResult = deps.loadReleaseConfig(projectPath);
  let requiredReleaseConfig: NonNullable<typeof releaseConfigResult.config> | null = null;
  if (action !== "destroy") {
    if (releaseConfigResult.error) {
      deps.writeLine(releaseConfigResult.error);
      return { handled: true, exitCode: 1 };
    }
    if (!releaseConfigResult.config) {
      deps.writeLine(
        "Deployment blocked: release config not found. Create .tz/release.yaml with version and tagPrefix first."
      );
      return { handled: true, exitCode: 1 };
    }
    requiredReleaseConfig = releaseConfigResult.config;
  }
  const adapter = deps.createAdapter(config);

  try {
    if (action !== "destroy") {
      if (!requiredReleaseConfig) {
        throw new Error(
          "Deployment blocked: release config not found. Create .tz/release.yaml with version and tagPrefix first."
        );
      }
      await deps.runGitPreflight({
        projectPath,
        releaseConfig: requiredReleaseConfig,
      });
      deps.validateDeployTemplateForProject(projectPath, deps.writeLine);
    }
    const deployWorkspace = deps.prepareDeployWorkspace(projectPath, environmentId, config);
    deps.validatePostInterpolationArtifacts(deployWorkspace, deps.writeLine);

    if (action === "plan") {
      deps.writeLine(`Starting plan for '${environmentId}'...`);
      const result = await deps.runPlan(config, projectPath, environmentId, adapter);
      writePlanSummary(deps.writeLine, result);
      if (hasErrors(result)) {
        writeErrors(deps.writeLine, result.errors ?? []);
        return { handled: true, exitCode: 1 };
      }
      deps.writeLine(`Plan completed for '${environmentId}'.`);
      if (result.driftDetected) {
        deps.writeLine(`Next step: tz deployments apply --env ${environmentId}`);
      }
      return { handled: true, exitCode: 0, planChanges: result.plannedChanges };
    }

    if (action === "apply") {
      deps.writeLine(`Starting pre-apply drift check for '${environmentId}'...`);
      const preflight = await deps.runReport(config, projectPath, environmentId, adapter);
      if (hasErrors(preflight)) {
        writeReportSummary(deps.writeLine, preflight);
        writeErrors(deps.writeLine, preflight.errors ?? []);
        return { handled: true, exitCode: 1 };
      }
      const requiresProdDriftConfirm = environmentId === "prod";
      const hasDriftConfirm =
        requiresProdDriftConfirm
          ? flags["confirm-drift-prod"] === true
          : flags["confirm-drift"] === true;
      if (preflight.status === "drifted" && !hasDriftConfirm) {
        deps.writeLine(
          requiresProdDriftConfirm
            ? `Pre-apply drift check failed for '${environmentId}'. Run plan/review and retry with --confirm-drift-prod when ready.`
            : `Pre-apply drift check failed for '${environmentId}'. Run plan/review and retry with --confirm-drift when ready.`
        );
        return { handled: true, exitCode: 1 };
      }
      deps.writeLine(`Pre-apply drift check passed for '${environmentId}'.`);
      deps.writeLine(`Starting apply for '${environmentId}'...`);
      const result = await deps.runApply(config, projectPath, environmentId, adapter, {
        confirmDriftForProd: flags["confirm-drift-prod"] === true,
      });
      writeApplySummary(deps.writeLine, result);
      deps.validatePostDeployOutputs({
        projectPath,
        environmentId,
        providerOutputs: result.providerOutputs ?? {},
        writeLine: deps.writeLine,
      });
      if (result.providerOutputs) {
        persistProviderOutputs(projectPath, environmentId, result.providerOutputs, deps.writeLine);
      }
      if (hasErrors(result)) {
        writeErrors(deps.writeLine, result.errors ?? []);
        return { handled: true, exitCode: 1 };
      }
      deps.writeLine(`Apply completed for '${environmentId}'.`);
      return { handled: true, exitCode: 0 };
    }

    if (action === "destroy") {
      const result = await deps.runDestroy(
        config,
        projectPath,
        environmentId,
        adapter,
        {
          confirmEnvironmentId: asStringArg(flags, "confirm-env") ?? "",
          confirmPhrase: asStringArg(flags, "confirm") ?? "",
          confirmProdPhrase: asStringArg(flags, "confirm-prod"),
        },
        undefined
      );
      writeDestroySummary(deps.writeLine, result);
      if (hasErrors(result)) {
        writeErrors(deps.writeLine, result.errors ?? []);
        return { handled: true, exitCode: 1 };
      }
      return { handled: true, exitCode: 0 };
    }

    if (flags.watch === true) {
      const intervalSeconds = asNumberArg(flags, "interval-seconds") ?? 5;
      const maxCycles = asNumberArg(flags, "max-cycles") ?? 3;
      const cycleResults = await deps.runReportRefreshLoop(
        config,
        projectPath,
        environmentId,
        adapter,
        {
          intervalMs: Math.max(0, Math.floor(intervalSeconds * 1000)),
          maxCycles: Math.max(1, Math.floor(maxCycles)),
          onCycle: (cycle, cycleResult) => {
            deps.writeLine(`Refresh cycle ${cycle}:`);
            writeReportSummary(deps.writeLine, cycleResult);
            deps.validatePostDeployOutputs({
              projectPath,
              environmentId,
              providerOutputs: cycleResult.providerOutputs ?? {},
              writeLine: deps.writeLine,
            });
            if (cycleResult.providerOutputs) {
              persistProviderOutputs(
                projectPath,
                environmentId,
                cycleResult.providerOutputs,
                deps.writeLine
              );
            }
            writeReportRemediation(deps.writeLine, environmentId, cycleResult);
          },
        }
      );
      const last = cycleResults[cycleResults.length - 1];
      if (!last) return { handled: true, exitCode: 1 };
      if (hasErrors(last)) {
        writeErrors(deps.writeLine, last.errors ?? []);
        return { handled: true, exitCode: 1 };
      }
      return { handled: true, exitCode: 0 };
    }

    const result = await deps.runReport(config, projectPath, environmentId, adapter);
    writeReportSummary(deps.writeLine, result);
    deps.validatePostDeployOutputs({
      projectPath,
      environmentId,
      providerOutputs: result.providerOutputs ?? {},
      writeLine: deps.writeLine,
    });
    if (result.providerOutputs) {
      persistProviderOutputs(projectPath, environmentId, result.providerOutputs, deps.writeLine);
    }
    if (hasErrors(result)) {
      writeErrors(deps.writeLine, result.errors ?? []);
      return { handled: true, exitCode: 1 };
    }
    writeReportRemediation(deps.writeLine, environmentId, result);
    return { handled: true, exitCode: 0 };
  } catch (error) {
    deps.writeLine(error instanceof Error ? error.message : "Deployment command failed.");
    return { handled: true, exitCode: 1 };
  }
}
