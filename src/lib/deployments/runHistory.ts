import {
  loadProjectConfig,
  saveProjectConfig,
  type ProjectDeploymentAction,
  type ProjectDeploymentRunRecord,
  type ProjectDeploymentRunStatus,
} from "@/lib/config/project";

const RUN_HISTORY_RETENTION_DAYS = 30;

export type DeploymentRunSummary = {
  add?: number;
  change?: number;
  destroy?: number;
};

export type RecordDeploymentRunInput = {
  environmentId: string;
  action: ProjectDeploymentAction;
  status: ProjectDeploymentRunStatus;
  actor?: string;
  summary?: DeploymentRunSummary;
  logs?: string[];
  startedAt?: string;
  finishedAt?: string;
};

function makeRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function redactLogLine(line: string): string {
  let redacted = line;

  redacted = redacted.replace(
    /(https?:\/\/)([^\/\s:@]+):([^@\/\s]+)@/gi,
    "$1[REDACTED]:[REDACTED]@"
  );
  redacted = redacted.replace(
    /\b(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[A-Za-z0-9_]{20,})\b/g,
    "[REDACTED]"
  );
  redacted = redacted.replace(
    /\b(password|passwd|token|secret|api[_-]?key)\b(\s*[:=]\s*)([^\s,;]+)/gi,
    (_m, key: string, sep: string) => `${key}${sep}[REDACTED]`
  );

  return redacted;
}

export function redactDeploymentLogs(lines: string[] | undefined): string[] | undefined {
  if (!Array.isArray(lines)) return undefined;
  return lines.map((line) => redactLogLine(line));
}

export function pruneDeploymentRunHistory(
  projectPath: string,
  nowIso: string = new Date().toISOString()
): ProjectDeploymentRunRecord[] {
  const config = loadProjectConfig(projectPath);
  if (!config) {
    throw new Error(`Project config not found: ${projectPath}`);
  }
  const now = new Date(nowIso).getTime();
  const history = config.deploymentRunHistory ?? [];
  const kept = history.filter((record) => {
    const expiry = new Date(record.expiresAt).getTime();
    return Number.isFinite(expiry) && expiry > now;
  });
  if (kept.length !== history.length) {
    saveProjectConfig(projectPath, {
      ...config,
      deploymentRunHistory: kept,
    });
  }
  return kept.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listDeploymentRunHistory(
  projectPath: string,
  environmentId?: string,
  nowIso: string = new Date().toISOString()
): ProjectDeploymentRunRecord[] {
  const kept = pruneDeploymentRunHistory(projectPath, nowIso);
  const filtered = environmentId
    ? kept.filter((record) => record.environmentId === environmentId)
    : kept;
  return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function recordDeploymentRun(
  projectPath: string,
  input: RecordDeploymentRunInput,
  nowIso: string = new Date().toISOString()
): ProjectDeploymentRunRecord {
  const config = loadProjectConfig(projectPath);
  if (!config) {
    throw new Error(`Project config not found: ${projectPath}`);
  }
  if (input.environmentId.trim().length === 0) {
    throw new Error("environmentId is required");
  }

  const existing = listDeploymentRunHistory(projectPath, undefined, nowIso);
  const startedAt = input.startedAt ?? nowIso;
  const finishedAt = input.finishedAt ?? nowIso;
  const record: ProjectDeploymentRunRecord = {
    id: makeRunId(),
    environmentId: input.environmentId,
    action: input.action,
    status: input.status,
    actor: input.actor,
    summary: input.summary,
    logs: redactDeploymentLogs(input.logs),
    startedAt,
    finishedAt,
    createdAt: nowIso,
    expiresAt: addDays(nowIso, RUN_HISTORY_RETENTION_DAYS),
  };

  const nextHistory = [record, ...existing].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  saveProjectConfig(projectPath, {
    ...config,
    deploymentRunHistory: nextHistory,
  });
  return record;
}
