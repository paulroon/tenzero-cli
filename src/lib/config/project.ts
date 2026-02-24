import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { parseJsonFile } from "@/lib/json";
import { TZ_PROJECT_CONFIG_FILENAME } from "@/lib/paths";

export const PROJECT_TYPES = ["symfony", "nextjs", "vanilla-php", "other"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export function isValidProjectType(v: unknown): v is ProjectType {
  return typeof v === "string" && PROJECT_TYPES.includes(v as ProjectType);
}

export function ensureProjectType(v: unknown): ProjectType {
  return isValidProjectType(v) ? v : "other";
}

export type ProjectOpenWith =
  | {
      type: "browser";
      url: string;
    };

export type ProjectDeploymentAction =
  | "plan"
  | "apply"
  | "destroy"
  | "report"
  | "rotate";

export type ProjectDeploymentRunStatus = "success" | "failed" | "cancelled";

export type ProjectDeploymentRunRecord = {
  id: string;
  environmentId: string;
  action: ProjectDeploymentAction;
  status: ProjectDeploymentRunStatus;
  actor?: string;
  summary?: {
    add?: number;
    change?: number;
    destroy?: number;
  };
  logs?: string[];
  startedAt: string;
  finishedAt: string;
  createdAt: string;
  expiresAt: string;
};

export type DeploymentEnvironmentState = {
  lastPlanAt?: string;
  lastPlanDriftDetected?: boolean;
  lastForceUnlockAt?: string;
  lastReportedAt?: string;
  lastStatusUpdatedAt?: string;
  lastStatus?: "healthy" | "drifted" | "deploying" | "failed" | "unknown";
  activeLock?: {
    runId: string;
    acquiredAt: string;
  };
};

export type DeploymentState = {
  environments: Record<string, DeploymentEnvironmentState>;
};

export type ProjectEnvironmentReleaseSelection = {
  selectedImageRef?: string;
  selectedImageDigest?: string;
  selectedReleaseTag?: string;
  selectedAt?: string;
};

export type ProjectReleaseState = {
  environments: Record<string, ProjectEnvironmentReleaseSelection>;
};

export type ProjectOutputType = "string" | "number" | "boolean" | "json" | "secret_ref";
export type ProjectOutputSource = "manualOverride" | "providerOutput" | "templateDefault";

export type ProjectEnvironmentOutputRecord = {
  key: string;
  type: ProjectOutputType;
  value?: unknown;
  secretRef?: string;
  sensitive?: boolean;
  rotatable?: boolean;
  source: ProjectOutputSource;
  isGeneratedCredential?: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectEnvironmentOutputs = Record<
  string,
  Record<string, ProjectEnvironmentOutputRecord>
>;

export type ProjectEnvironmentOutputWrite = {
  key: string;
  type: ProjectOutputType;
  value?: unknown;
  secretRef?: string;
  sensitive?: boolean;
  rotatable?: boolean;
  source: ProjectOutputSource;
  isGeneratedCredential?: boolean;
};

export type TzProjectConfig = {
  name: string;
  path: string;
  type: ProjectType;
  /** Answers from the project builder (projectName, projectType, symfonyAuth, etc.) */
  builderAnswers?: Record<string, string>;
  openWith?: ProjectOpenWith;
  environmentOutputs?: ProjectEnvironmentOutputs;
  deploymentRunHistory?: ProjectDeploymentRunRecord[];
  deploymentState?: DeploymentState;
  releaseState?: ProjectReleaseState;
};

const OUTPUT_SOURCE_PRIORITY: Record<ProjectOutputSource, number> = {
  templateDefault: 1,
  providerOutput: 2,
  manualOverride: 3,
};

function isOutputType(v: unknown): v is ProjectOutputType {
  return (
    v === "string" ||
    v === "number" ||
    v === "boolean" ||
    v === "json" ||
    v === "secret_ref"
  );
}

function isOutputSource(v: unknown): v is ProjectOutputSource {
  return v === "manualOverride" || v === "providerOutput" || v === "templateDefault";
}

function normalizeEnvironmentOutputs(raw: unknown): ProjectEnvironmentOutputs | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const result: ProjectEnvironmentOutputs = {};
  for (const [environmentId, recordMap] of Object.entries(raw as Record<string, unknown>)) {
    if (!recordMap || typeof recordMap !== "object" || Array.isArray(recordMap)) continue;
    const parsedRecordMap: Record<string, ProjectEnvironmentOutputRecord> = {};
    for (const [key, value] of Object.entries(recordMap as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const candidate = value as Partial<ProjectEnvironmentOutputRecord>;
      if (typeof candidate.key !== "string" || candidate.key.length === 0) continue;
      if (candidate.key !== key) continue;
      if (!isOutputType(candidate.type)) continue;
      if (!isOutputSource(candidate.source)) continue;
      if (typeof candidate.version !== "number" || candidate.version < 1) continue;
      if (typeof candidate.createdAt !== "string" || typeof candidate.updatedAt !== "string") continue;
      parsedRecordMap[key] = {
        key: candidate.key,
        type: candidate.type,
        value: candidate.value,
        secretRef: typeof candidate.secretRef === "string" ? candidate.secretRef : undefined,
        sensitive: candidate.sensitive === true,
        rotatable: candidate.rotatable === true,
        source: candidate.source,
        isGeneratedCredential: candidate.isGeneratedCredential === true,
        version: candidate.version,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
      };
    }
    if (Object.keys(parsedRecordMap).length > 0) {
      result[environmentId] = parsedRecordMap;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function getProjectConfigPath(path: string): string {
  return join(path, TZ_PROJECT_CONFIG_FILENAME);
}

function sourceHasPriority(next: ProjectOutputSource, current: ProjectOutputSource): boolean {
  return OUTPUT_SOURCE_PRIORITY[next] >= OUTPUT_SOURCE_PRIORITY[current];
}

function normalizeDeploymentRunHistory(raw: unknown): ProjectDeploymentRunRecord[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const records: ProjectDeploymentRunRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const candidate = item as Partial<ProjectDeploymentRunRecord>;
    const isValidAction =
      candidate.action === "plan" ||
      candidate.action === "apply" ||
      candidate.action === "destroy" ||
      candidate.action === "report" ||
      candidate.action === "rotate";
    const isValidStatus =
      candidate.status === "success" ||
      candidate.status === "failed" ||
      candidate.status === "cancelled";
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.environmentId !== "string" ||
      !isValidAction ||
      !isValidStatus ||
      typeof candidate.startedAt !== "string" ||
      typeof candidate.finishedAt !== "string" ||
      typeof candidate.createdAt !== "string" ||
      typeof candidate.expiresAt !== "string"
    ) {
      continue;
    }
    records.push({
      id: candidate.id,
      environmentId: candidate.environmentId,
      action: candidate.action,
      status: candidate.status,
      actor: typeof candidate.actor === "string" ? candidate.actor : undefined,
      summary:
        candidate.summary && typeof candidate.summary === "object"
          ? {
              add:
                typeof (candidate.summary as { add?: unknown }).add === "number"
                  ? ((candidate.summary as { add: number }).add)
                  : undefined,
              change:
                typeof (candidate.summary as { change?: unknown }).change === "number"
                  ? ((candidate.summary as { change: number }).change)
                  : undefined,
              destroy:
                typeof (candidate.summary as { destroy?: unknown }).destroy === "number"
                  ? ((candidate.summary as { destroy: number }).destroy)
                  : undefined,
            }
          : undefined,
      logs: Array.isArray(candidate.logs)
        ? candidate.logs.filter((log): log is string => typeof log === "string")
        : undefined,
      startedAt: candidate.startedAt,
      finishedAt: candidate.finishedAt,
      createdAt: candidate.createdAt,
      expiresAt: candidate.expiresAt,
    });
  }
  return records.length > 0 ? records : undefined;
}

function normalizeDeploymentState(raw: unknown): DeploymentState | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const environmentsRaw = (raw as { environments?: unknown }).environments;
  if (!environmentsRaw || typeof environmentsRaw !== "object" || Array.isArray(environmentsRaw)) {
    return undefined;
  }
  const environments: Record<string, DeploymentEnvironmentState> = {};
  for (const [environmentId, value] of Object.entries(
    environmentsRaw as Record<string, unknown>
  )) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const candidate = value as Partial<DeploymentEnvironmentState>;
    const activeLockCandidate =
      candidate.activeLock &&
      typeof candidate.activeLock === "object" &&
      typeof (candidate.activeLock as { runId?: unknown }).runId === "string" &&
      typeof (candidate.activeLock as { acquiredAt?: unknown }).acquiredAt === "string"
        ? {
            runId: (candidate.activeLock as { runId: string }).runId,
            acquiredAt: (candidate.activeLock as { acquiredAt: string }).acquiredAt,
          }
        : undefined;
    environments[environmentId] = {
      lastPlanAt:
        typeof candidate.lastPlanAt === "string" ? candidate.lastPlanAt : undefined,
      lastPlanDriftDetected:
        candidate.lastPlanDriftDetected === true
          ? true
          : candidate.lastPlanDriftDetected === false
            ? false
            : undefined,
      lastForceUnlockAt:
        typeof candidate.lastForceUnlockAt === "string"
          ? candidate.lastForceUnlockAt
          : undefined,
      lastReportedAt:
        typeof candidate.lastReportedAt === "string" ? candidate.lastReportedAt : undefined,
      lastStatusUpdatedAt:
        typeof candidate.lastStatusUpdatedAt === "string"
          ? candidate.lastStatusUpdatedAt
          : undefined,
      lastStatus:
        candidate.lastStatus === "healthy" ||
        candidate.lastStatus === "drifted" ||
        candidate.lastStatus === "deploying" ||
        candidate.lastStatus === "failed" ||
        candidate.lastStatus === "unknown"
          ? candidate.lastStatus
          : undefined,
      activeLock: activeLockCandidate,
    };
  }
  return { environments };
}

function normalizeReleaseState(raw: unknown): ProjectReleaseState | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const environmentsRaw = (raw as { environments?: unknown }).environments;
  if (!environmentsRaw || typeof environmentsRaw !== "object" || Array.isArray(environmentsRaw)) {
    return undefined;
  }
  const environments: Record<string, ProjectEnvironmentReleaseSelection> = {};
  for (const [environmentId, value] of Object.entries(
    environmentsRaw as Record<string, unknown>
  )) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const candidate = value as Partial<ProjectEnvironmentReleaseSelection>;
    environments[environmentId] = {
      selectedImageRef:
        typeof candidate.selectedImageRef === "string" ? candidate.selectedImageRef : undefined,
      selectedImageDigest:
        typeof candidate.selectedImageDigest === "string" ? candidate.selectedImageDigest : undefined,
      selectedReleaseTag:
        typeof candidate.selectedReleaseTag === "string" ? candidate.selectedReleaseTag : undefined,
      selectedAt: typeof candidate.selectedAt === "string" ? candidate.selectedAt : undefined,
    };
  }
  return { environments };
}

export function loadProjectConfig(path: string): TzProjectConfig | null {
  const config = parseJsonFile<Partial<TzProjectConfig>>(
    getProjectConfigPath(path)
  );
  if (!config) return null;

  const type = ensureProjectType(config.type);

  const builderAnswers =
    config.builderAnswers &&
    typeof config.builderAnswers === "object" &&
    !Array.isArray(config.builderAnswers)
      ? (config.builderAnswers as Record<string, string>)
      : undefined;

  const openWithCandidate = config.openWith;
  const openWith =
    openWithCandidate &&
    typeof openWithCandidate === "object" &&
    (openWithCandidate as { type?: unknown }).type === "browser" &&
    typeof (openWithCandidate as { url?: unknown }).url === "string"
      ? {
          type: "browser" as const,
          url: (openWithCandidate as { url: string }).url,
        }
      : undefined;

  const environmentOutputs = normalizeEnvironmentOutputs(config.environmentOutputs);
  const deploymentRunHistory = normalizeDeploymentRunHistory(config.deploymentRunHistory);
  const deploymentState = normalizeDeploymentState(config.deploymentState);
  const releaseState = normalizeReleaseState(config.releaseState);

  return {
    name: config.name ?? "unknown",
    path,
    type,
    builderAnswers,
    openWith,
    environmentOutputs,
    deploymentRunHistory,
    deploymentState,
    releaseState,
  };
}

export function saveProjectConfig(
  projectPath: string,
  config: Partial<TzProjectConfig>
): void {
  const configPath = getProjectConfigPath(projectPath);
  writeFileSync(
    configPath,
    JSON.stringify({ ...config, path: projectPath }, null, 2),
    "utf-8"
  );
}

export function upsertProjectEnvironmentOutputs(
  projectPath: string,
  environmentId: string,
  writes: ProjectEnvironmentOutputWrite[]
): ProjectEnvironmentOutputRecord[] {
  if (environmentId.trim().length === 0) {
    throw new Error("environmentId is required");
  }
  const config = loadProjectConfig(projectPath);
  if (!config) {
    throw new Error(`Project config not found: ${projectPath}`);
  }

  const environmentOutputs: ProjectEnvironmentOutputs = {
    ...(config.environmentOutputs ?? {}),
  };
  const existingByKey = { ...(environmentOutputs[environmentId] ?? {}) };
  const now = new Date().toISOString();

  for (const write of writes) {
    if (!write.key || write.key.trim().length === 0) {
      throw new Error("Output write key is required");
    }
    const current = existingByKey[write.key];

    if (current && current.type !== write.type) {
      throw new Error(
        `Cannot change output type for '${write.key}' in environment '${environmentId}'`
      );
    }

    if (
      current?.isGeneratedCredential === true &&
      write.source === "manualOverride"
    ) {
      throw new Error(
        `Manual override is not allowed for generated credential '${write.key}'`
      );
    }

    if (current && !sourceHasPriority(write.source, current.source)) {
      continue;
    }

    const isGeneratedCredential = write.isGeneratedCredential ?? current?.isGeneratedCredential ?? false;
    if (isGeneratedCredential && write.source === "manualOverride") {
      throw new Error(
        `Manual override is not allowed for generated credential '${write.key}'`
      );
    }

    const createdAt = current?.createdAt ?? now;
    const version = current ? current.version + 1 : 1;

    existingByKey[write.key] = {
      key: write.key,
      type: write.type,
      value: write.value,
      secretRef: write.secretRef,
      sensitive: write.sensitive ?? current?.sensitive ?? false,
      rotatable: write.rotatable ?? current?.rotatable ?? false,
      source: write.source,
      isGeneratedCredential,
      version,
      createdAt,
      updatedAt: now,
    };
  }

  environmentOutputs[environmentId] = existingByKey;
  saveProjectConfig(projectPath, {
    ...config,
    environmentOutputs,
  });

  return Object.values(existingByKey);
}

export function getProjectEnvironmentOutputs(
  projectPath: string,
  environmentId: string
): ProjectEnvironmentOutputRecord[] {
  const config = loadProjectConfig(projectPath);
  if (!config?.environmentOutputs?.[environmentId]) return [];
  return Object.values(config.environmentOutputs[environmentId]);
}
