import { cwd } from "node:process";
import { loadConfig, type TzConfig } from "@/lib/config";
import { createAwsDeployAdapter } from "@/lib/deployments/awsAdapter";
import {
  assertDeploymentsModeEnabled,
  evaluateDeploymentsEnablementGate,
} from "@/lib/deployments/gate";
import {
  runApply,
  runDestroy,
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
  createAdapter: (config: TzConfig) => DeployAdapter;
  evaluateGate: typeof evaluateDeploymentsEnablementGate;
  assertMode: typeof assertDeploymentsModeEnabled;
  runPlan: typeof runPlan;
  runApply: typeof runApply;
  runDestroy: typeof runDestroy;
  runReport: typeof runReport;
  runReportRefreshLoop: typeof runReportRefreshLoop;
  getCwd: () => string;
  writeLine: (text: string) => void;
};

const defaultDeps: DeploymentsCommandDeps = {
  loadUserConfig: loadConfig,
  createAdapter: createAwsDeployAdapter,
  evaluateGate: evaluateDeploymentsEnablementGate,
  assertMode: assertDeploymentsModeEnabled,
  runPlan,
  runApply,
  runDestroy,
  runReport,
  runReportRefreshLoop,
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

export async function maybeRunDeploymentsCommand(
  argv: string[],
  overrides?: Partial<DeploymentsCommandDeps>
): Promise<{ handled: boolean; exitCode: number }> {
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
  const adapter = deps.createAdapter(config);

  try {
    if (action === "plan") {
      const result = await deps.runPlan(config, projectPath, environmentId, adapter);
      writePlanSummary(deps.writeLine, result);
      if (hasErrors(result)) {
        writeErrors(deps.writeLine, result.errors ?? []);
        return { handled: true, exitCode: 1 };
      }
      if (result.driftDetected) {
        deps.writeLine(`Next step: tz deployments apply --env ${environmentId}`);
      }
      return { handled: true, exitCode: 0 };
    }

    if (action === "apply") {
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
      const result = await deps.runApply(config, projectPath, environmentId, adapter, {
        confirmDriftForProd: flags["confirm-drift-prod"] === true,
      });
      writeApplySummary(deps.writeLine, result);
      if (hasErrors(result)) {
        writeErrors(deps.writeLine, result.errors ?? []);
        return { handled: true, exitCode: 1 };
      }
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
