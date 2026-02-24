import React, { useState, useMemo, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { render } from "ink";
import { Alert, Select } from "@inkjs/ui";
import { useBackKey } from "@/hooks/useBackKey";
import { useCurrentProject } from "@/contexts/CurrentProjectContext";
import {
  syncProjects,
  saveConfig,
  DEFAULT_EDITOR,
  listProjectConfigs,
  loadDeployTemplateConfigWithError,
  loadProjectReleaseConfigWithError,
  type TzProjectConfig,
  type TzConfig,
} from "@/lib/config";
import { loadProjectConfig, saveProjectConfig } from "@/lib/config/project";
import { getMakefileTargets } from "@/lib/makefile";
import { callShell } from "@/lib/shell";
import { setResumeProjectPath } from "@/lib/resumeState";
import { getInkInstance, setInkInstance } from "@/lib/inkInstance";
import { getErrorMessage } from "@/lib/errors";
import { evaluateProjectDeleteGuard } from "@/lib/deployments/deleteGuard";
import { maybeRunDeploymentsCommand } from "@/lib/deployments/commands";
import { evaluateDeployWorkspaceReadiness } from "@/lib/deployments/deployWorkspaceCheck";
import { prepareDeployWorkspaceForEnvironment } from "@/lib/deployments/deployWorkspace";
import {
  createReleaseTagForProject,
  ensureReleaseTagForProject,
  pushReleaseTagToOrigin,
  suggestNextReleaseTag,
} from "@/lib/release/releaseTag";
import { waitForReleaseWorkflowCompletion } from "@/lib/github/actionsMonitor";
import { maybeDeleteGithubRepoForProject } from "@/lib/github/repoLifecycle";
import { resolveReleaseImageForTag } from "@/lib/github/releaseValidation";
import {
  bootstrapGithubRepoVariables,
  validateGithubRepoVariablesForRelease,
} from "@/lib/github/repoVariables";
import {
  ensureReleaseEcrRepository,
  deleteReleaseEcrRepository,
} from "@/lib/github/releaseDependencies";
import { ensureGithubOidcRoleForDeployments } from "@/lib/github/oidcRole";
import App from "@/ui/App";
import { DeleteProjectView } from "@/ui/dashboard/DeleteProjectView";
import { ReleaseBuildMonitorView } from "@/ui/dashboard/ReleaseBuildMonitorView";
import { PendingApplyView } from "@/ui/dashboard/PendingApplyView";
import { EnvironmentActionsView } from "@/ui/dashboard/EnvironmentActionsView";
import { ReleaseSelectorView } from "@/ui/dashboard/ReleaseSelectorView";
import { DeploymentEnvironmentsListView } from "@/ui/dashboard/DeploymentEnvironmentsListView";
import { DashboardHomeView } from "@/ui/dashboard/DashboardHomeView";
import { ConfirmDestroyView } from "@/ui/dashboard/ConfirmDestroyView";
import { ConfirmDriftView } from "@/ui/dashboard/ConfirmDriftView";
import { resolveNextReleaseSelection } from "@/ui/dashboard/releaseSelectionState";
import type {
  DeploymentStep,
  DeploymentStepId,
  DeploymentStepStatus,
  PlannedChange,
  ReleaseBuildMonitorState,
} from "@/ui/dashboard/types";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

type ActionChoice = "delete";

type Props = {
  onBack: () => void;
  config: TzConfig;
  onConfigUpdate?: (config: TzConfig) => void;
};

function isDockerizedValue(value: unknown): boolean {
  return value === "yes" || value === "true";
}

function isPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("EACCES") || error.message.includes("EPERM");
}

function hasDockerComposeFile(projectPath: string): boolean {
  return existsSync(join(projectPath, "docker-compose.yml"));
}

function toUiDeploymentError(logs: string[]): string {
  if (logs.some((line) => line.includes("Pre-apply drift check failed"))) {
    return "Drift detected. Confirm in this screen to continue deployment.";
  }
  if (logs.some((line) => line.includes("--confirm-drift-prod"))) {
    return "Production drift confirmation is required. Confirm in this screen to continue.";
  }
  if (logs.some((line) => line.includes("--confirm-drift"))) {
    return "Drift confirmation is required. Confirm in this screen to continue.";
  }
  if (logs.some((line) => line.startsWith("Usage: tz deployments"))) {
    return "Deployment action failed due to invalid internal arguments. Please retry from this screen.";
  }
  return logs[logs.length - 1] ?? "Deployment action failed.";
}

function detectHostPortFromCompose(projectPath: string): string | null {
  const composePath = join(projectPath, "docker-compose.yml");
  if (!existsSync(composePath)) return null;
  try {
    const content = readFileSync(composePath, "utf-8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*-\s*["']?(\d+):(\d+)(?:\/tcp|\/udp)?["']?\s*$/);
      if (match?.[1]) return match[1];
    }
  } catch {
    // Ignore parse/read issues and fall back.
  }
  return null;
}

function detectPortFromEnvLocal(projectPath: string): string | null {
  const envPath = join(projectPath, ".env.local");
  if (!existsSync(envPath)) return null;
  try {
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/^\s*PORT\s*=\s*(\d+)\s*$/m);
    if (match?.[1]) return match[1];
  } catch {
    // Ignore parse/read issues and fall back.
  }
  return null;
}

function getProjectOpenUrl(projectPath: string, projectType: string): string {
  const composePort = detectHostPortFromCompose(projectPath);
  if (composePort) return `http://localhost:${composePort}`;

  const envPort = detectPortFromEnvLocal(projectPath);
  if (envPort) return `http://localhost:${envPort}`;

  const fallbackPort = projectType === "nextjs" ? "3000" : "8000";
  return `http://localhost:${fallbackPort}`;
}

function resolveOpenUrl(project: TzProjectConfig): string {
  if (project.openWith?.type === "browser" && project.openWith.url) {
    return project.openWith.url;
  }
  return getProjectOpenUrl(project.path, project.type);
}

export default function Dashboard({
  onBack,
  config,
  onConfigUpdate,
}: Props) {
  const { currentProject, clearCurrentProject } = useCurrentProject();
  const [choice, setChoice] = useState<ActionChoice | null>(null);
  const [deleteRemoteRepoOnDelete, setDeleteRemoteRepoOnDelete] = useState<boolean | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [menuView, setMenuView] = useState<"main" | "actions" | "make">("main");
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string | null>(null);
  const [confirmDestroyEnvironmentId, setConfirmDestroyEnvironmentId] = useState<string | null>(
    null
  );
  const [confirmDriftEnvironmentId, setConfirmDriftEnvironmentId] = useState<string | null>(null);
  const [pendingApplyEnvironmentId, setPendingApplyEnvironmentId] = useState<string | null>(null);
  const [editReleaseEnvironmentId, setEditReleaseEnvironmentId] = useState<string | null>(null);
  const [createReleaseEntry, setCreateReleaseEntry] = useState(false);
  const [loadingReleaseTags, setLoadingReleaseTags] = useState(false);
  const [availableReleaseTags, setAvailableReleaseTags] = useState<string[]>([]);
  const [availableDeployPresets, setAvailableDeployPresets] = useState<
    Array<{ id: string; label: string; description: string }>
  >([]);
  const [selectedEnvironmentProvider, setSelectedEnvironmentProvider] = useState<string | null>(
    null
  );
  const [suggestedReleaseTag, setSuggestedReleaseTag] = useState<string>("");
  const [releaseBuildMonitor, setReleaseBuildMonitor] = useState<ReleaseBuildMonitorState | null>(
    null
  );
  const [deploymentNotice, setDeploymentNotice] = useState<string | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
  const [deploymentPlannedChanges, setDeploymentPlannedChanges] = useState<PlannedChange[]>([]);
  const [deploymentSteps, setDeploymentSteps] = useState<DeploymentStep[]>([]);
  const [deploymentStartedAt, setDeploymentStartedAt] = useState<number | null>(null);
  const [deploymentInProgress, setDeploymentInProgress] = useState(false);
  const [deploymentRefreshKey, setDeploymentRefreshKey] = useState(0);
  const deploymentActionCooldownUntilRef = useRef(0);

  useBackKey(() => {
    if (
      releaseBuildMonitor &&
      (releaseBuildMonitor.stage === "pushing" ||
        releaseBuildMonitor.stage === "waiting" ||
        releaseBuildMonitor.stage === "running")
    ) {
      return;
    }
    if (releaseBuildMonitor) {
      setReleaseBuildMonitor(null);
      return;
    }
    if (confirmDestroyEnvironmentId) {
      setConfirmDestroyEnvironmentId(null);
      setDeploymentError(null);
      return;
    }
    if (confirmDriftEnvironmentId) {
      setConfirmDriftEnvironmentId(null);
      setDeploymentError(null);
      return;
    }
    if (editReleaseEnvironmentId) {
      closeReleaseSelector();
      setLoadingReleaseTags(false);
      setDeploymentError(null);
      return;
    }
    if (pendingApplyEnvironmentId) {
      setPendingApplyEnvironmentId(null);
      setDeploymentNotice(null);
      setDeploymentSteps((prev) =>
        prev.map((step) =>
          step.status === "pending" ? { ...step, status: "skipped" } : step
        )
      );
      return;
    }
    if (choice !== null) {
      setChoice(null);
      setDeleteRemoteRepoOnDelete(null);
      setDeleteError(null);
    } else if (selectedEnvironmentId) {
      setSelectedEnvironmentId(null);
      setDeploymentError(null);
    } else if (menuView !== "main") {
      setMenuView("main");
    } else {
      clearCurrentProject();
      onBack();
    }
  });

  const isDockerized = isDockerizedValue(currentProject?.builderAnswers?.dockerize);

  useInput(
    (input, key) => {
      if (!currentProject) return;
      if (input.toLowerCase() === "e" && !key.ctrl && !key.meta) {
        const editor = config.editor?.trim() || DEFAULT_EDITOR;
        void callShell(
          `${editor} ${JSON.stringify(currentProject.path)}`,
          { loginShell: true, detached: true }
        );
      }
      if (
        input.toLowerCase() === "o" &&
        !key.ctrl &&
        !key.meta &&
        (isDockerized || currentProject.openWith?.type === "browser")
      ) {
        const url = resolveOpenUrl(currentProject);
        const cmd =
          process.platform === "win32"
            ? ["cmd", "/c", "start", url]
            : process.platform === "darwin"
              ? ["open", url]
              : ["xdg-open", url];
        void callShell(cmd[0], cmd.slice(1), { detached: true });
      }
      if (
        input.toLowerCase() === "s" &&
        !key.ctrl &&
        !key.meta &&
        isDockerized
      ) {
        void (async () => {
          setResumeProjectPath(currentProject.path);
          const instance = getInkInstance();
          await instance?.unmount();
          try {
            await callShell("docker", ["compose", "exec", "-it", "app", "sh"], {
              cwd: currentProject.path,
              stdin: "inherit",
              throwOnNonZero: false,
            });
          } catch {
            /* user may have Ctrl+C or container may have exited */
          }
          const newInstance = render(<App />);
          setInkInstance(newInstance);
        })();
      }
    },
    { isActive: !!currentProject }
  );

  const makeTargets = useMemo(
    () => (currentProject ? getMakefileTargets(currentProject.path) : []),
    [currentProject?.path]
  );
  const deployTemplateConfig = useMemo(() => {
    if (!currentProject) return null;
    const templateMeta = listProjectConfigs().find((entry) => entry.id === currentProject.type);
    if (!templateMeta) return null;
    return loadDeployTemplateConfigWithError(templateMeta.path).config;
  }, [currentProject?.type]);
  const projectStateConfig = useMemo(
    () => (currentProject ? loadProjectConfig(currentProject.path) : null),
    [currentProject?.path, deploymentRefreshKey]
  );
  const deployEnvironments = deployTemplateConfig?.environments ?? [];
  const deployWorkspaceReadiness = useMemo(
    () => (currentProject ? evaluateDeployWorkspaceReadiness(currentProject.path) : null),
    [currentProject?.path, deploymentRefreshKey]
  );

  useEffect(() => {
    if (!currentProject || menuView !== "actions" || !selectedEnvironmentId) return;
    const readiness = evaluateDeployWorkspaceReadiness(currentProject.path);
    if (readiness.ready) return;
    try {
      prepareDeployWorkspaceForEnvironment(currentProject.path, selectedEnvironmentId, {
        backendRegion: config.integrations?.aws?.backend?.region,
      });
      setDeploymentRefreshKey((v) => v + 1);
    } catch (error) {
      setDeploymentError(
        getErrorMessage(error, "Failed to generate deploy workspace for this environment.")
      );
    }
  }, [currentProject, menuView, selectedEnvironmentId]);

  const handleMakeSelect = async (target: string) => {
    if (!currentProject) return;
    await callShell("make", [target], {
      cwd: currentProject.path,
      throwOnNonZero: false,
    });
  };

  if (!currentProject) return null;

  const handleDeleteConfirm = async () => {
    try {
      setDeleteError(null);
      const deleteGuard = evaluateProjectDeleteGuard(currentProject.path);
      if (!deleteGuard.allowed) {
        const environmentIds = Array.from(
          new Set(deleteGuard.blocks.map((block) => block.environmentId))
        ).sort((a, b) => a.localeCompare(b));
        for (const environmentId of environmentIds) {
          const destroyArgs = [
            "deployments",
            "destroy",
            "--env",
            environmentId,
            "--confirm-env",
            environmentId,
            "--confirm",
            `destroy ${environmentId}`,
          ];
          if (environmentId === "prod") {
            destroyArgs.push("--confirm-prod", "destroy prod permanently");
          }
          const destroyLogs: string[] = [];
          const destroyResult = await maybeRunDeploymentsCommand(destroyArgs, {
            getCwd: () => currentProject.path,
            writeLine: (line) => {
              const normalized = line.trim();
              if (normalized.length > 0) destroyLogs.push(normalized);
            },
          });
          if (!destroyResult.handled || destroyResult.exitCode !== 0) {
            const details = destroyLogs.slice(-6).join("\n");
            throw new Error(
              details.length > 0
                ? `Failed to destroy environment '${environmentId}' before deleting app.\n${details}`
                : `Failed to destroy environment '${environmentId}' before deleting app.`
            );
          }
        }
      }

      const isDockerized = isDockerizedValue(currentProject.builderAnswers?.dockerize);

      const stopDockerIfPossible = async () => {
        if (!isDockerized || !hasDockerComposeFile(currentProject.path)) return;
        await callShell(
          "docker",
          ["compose", "down", "--remove-orphans", "--volumes"],
          {
            cwd: currentProject.path,
            stdin: "ignore",
            throwOnNonZero: false,
          }
        );
      };

      await stopDockerIfPossible();
      if (deployTemplateConfig) {
        const ecrDeleteResult = await deleteReleaseEcrRepository({
          projectPath: currentProject.path,
          projectName: currentProject.name,
          awsRegionHint: config.integrations?.aws?.backend?.region,
        });
        if (!ecrDeleteResult.ok) {
          throw new Error(ecrDeleteResult.message);
        }
      }
      if (deleteRemoteRepoOnDelete) {
        const remoteDeleteResult = await maybeDeleteGithubRepoForProject(
          currentProject.path
        );
        if (!remoteDeleteResult.attempted) {
          throw new Error(
            `Remote GitHub repo deletion was requested but not attempted: ${remoteDeleteResult.message}`
          );
        }
        if (remoteDeleteResult.message.startsWith("Failed to delete remote GitHub repo")) {
          throw new Error(remoteDeleteResult.message);
        }
      }
      try {
        rmSync(currentProject.path, { recursive: true });
      } catch (err) {
        if (!isDockerized || !isPermissionError(err)) throw err;
        // If docker still has a bind mount or locked files, ensure it's fully down.
        await stopDockerIfPossible();
        rmSync(currentProject.path, { recursive: true });
      }
      const updatedConfig = syncProjects(config);
      saveConfig(updatedConfig);
      onConfigUpdate?.(updatedConfig);
      clearCurrentProject();
      onBack();
    } catch (err) {
      setDeleteError(getErrorMessage(err, "Failed to delete"));
    }
  };

  const handleDeleteCancel = () => {
    setChoice(null);
    setDeleteRemoteRepoOnDelete(null);
    setDeleteError(null);
  };

  const getEnvironmentStatus = (environmentId: string): string => {
    const status = projectStateConfig?.deploymentState?.environments?.[environmentId]?.lastStatus;
    if (status) return status;
    const hasProviderOutputs = Object.values(
      projectStateConfig?.environmentOutputs?.[environmentId] ?? {}
    ).some((record) => record.source === "providerOutput");
    return hasProviderOutputs ? "unknown" : "not deployed";
  };

  const isEnvironmentDeployed = (environmentId: string): boolean => {
    const status = getEnvironmentStatus(environmentId);
    return (
      status === "healthy" ||
      status === "drifted" ||
      status === "deploying" ||
      status === "failed"
    );
  };

  const runDeploymentAction = async (
    argv: string[],
    successNotice: string,
    options?: {
      onLogLine?: (line: string) => void;
      resetLogs?: boolean;
      bypassCooldown?: boolean;
    }
  ): Promise<{ exitCode: number; logs: string[]; planChanges?: PlannedChange[] }> => {
    const now = Date.now();
    if (
      deploymentInProgress ||
      (!options?.bypassCooldown && now < deploymentActionCooldownUntilRef.current)
    ) {
      return { exitCode: 1, logs: [] };
    }
    setDeploymentInProgress(true);
    setDeploymentError(null);
    setDeploymentNotice(null);
    if (options?.resetLogs !== false) {
      setDeploymentLogs([]);
    }
    const logs: string[] = [];
    try {
      const result = await maybeRunDeploymentsCommand(argv, {
        getCwd: () => currentProject.path,
        writeLine: (line) => {
          const chunks = line.split(/\r?\n/).filter((entry) => entry.trim().length > 0);
          const nextLines = chunks.length > 0 ? chunks : [line];
          for (const nextLine of nextLines) {
            logs.push(nextLine);
            options?.onLogLine?.(nextLine);
          }
          setDeploymentLogs(logs.slice(-40));
        },
      });
      setDeploymentLogs(logs.slice(-40));
      if (result.exitCode === 0) {
        setDeploymentNotice(successNotice);
      } else {
        setDeploymentError(toUiDeploymentError(logs));
      }
      setDeploymentRefreshKey((v) => v + 1);
      return { exitCode: result.exitCode, logs, planChanges: result.planChanges };
    } finally {
      // Guard against Enter key repeat / duplicate onChange pulses right after completion.
      deploymentActionCooldownUntilRef.current = Date.now() + 800;
      setDeploymentInProgress(false);
    }
  };

  const runApplyForEnvironment = async (
    environmentId: string,
    options: {
      includesPlanStep: boolean;
      confirmDrift: boolean;
      setStepStatus: (id: DeploymentStepId, status: DeploymentStepStatus) => void;
      getStepStatus: (id: DeploymentStepId) => DeploymentStepStatus | undefined;
    }
  ): Promise<void> => {
    const selectedRelease = projectStateConfig?.releaseState?.environments?.[environmentId];
    const successNotice = selectedRelease?.selectedDeployPresetId
      ? `Deploy completed for '${environmentId}' with preset '${selectedRelease.selectedDeployPresetId}'.`
      : `Deploy completed for '${environmentId}'.`;
    options.setStepStatus("drift-check", "running");
    let applyStarted = false;
    const args = ["deployments", "apply", "--env", environmentId];
    if (options.confirmDrift) {
      args.push(environmentId === "prod" ? "--confirm-drift-prod" : "--confirm-drift");
    }
    const result = await runDeploymentAction(args, successNotice, {
      resetLogs: options.includesPlanStep ? false : true,
      bypassCooldown: options.includesPlanStep,
      onLogLine: (line) => {
        if (line.startsWith("Pre-apply drift check passed")) {
          options.setStepStatus("drift-check", "success");
          options.setStepStatus("apply", "running");
          applyStarted = true;
          return;
        }
        if (line.startsWith("Starting apply")) {
          options.setStepStatus("apply", "running");
          applyStarted = true;
          return;
        }
        if (line.startsWith("Pre-apply drift check failed")) {
          options.setStepStatus("drift-check", "failed");
          options.setStepStatus("apply", "skipped");
        }
      },
    });
    if (result.exitCode !== 0) {
      const driftCheckState = options.getStepStatus("drift-check");
      if (!applyStarted) {
        if (driftCheckState === "running" || driftCheckState === "pending") {
          options.setStepStatus("drift-check", "failed");
        }
        options.setStepStatus("apply", "skipped");
      } else {
        if (driftCheckState === "running" || driftCheckState === "pending") {
          options.setStepStatus("drift-check", "success");
        }
        options.setStepStatus("apply", "failed");
      }
      const requiresDriftConfirmation = result.logs.some((line) =>
        line.includes("Pre-apply drift check failed")
      );
      if (requiresDriftConfirmation) {
        setConfirmDriftEnvironmentId(environmentId);
        setDeploymentError(
          `Drift detected for '${environmentId}'. Confirm to continue deployment with explicit drift acknowledgement.`
        );
      }
      return;
    }
    if (
      options.getStepStatus("drift-check") === "running" ||
      options.getStepStatus("drift-check") === "pending"
    ) {
      options.setStepStatus("drift-check", "success");
    }
    options.setStepStatus("apply", "success");
  };

  const handleDeployEnvironment = async (
    environmentId: string,
    confirmDrift = false
  ): Promise<void> => {
    const selectedRelease = projectStateConfig?.releaseState?.environments?.[environmentId];
    const templateMeta = listProjectConfigs().find((entry) => entry.id === currentProject.type);
    const deployConfig =
      templateMeta ? loadDeployTemplateConfigWithError(templateMeta.path).config : null;
    const usesDeployTemplate =
      !!deployConfig?.environments.find((entry) => entry.id === environmentId);
    if (usesDeployTemplate && !selectedRelease?.selectedDeployPresetId) {
      setDeploymentError(
        `Deploy preset is required for '${environmentId}'. Select a preset before deploying.`
      );
      return;
    }
    if (selectedRelease?.selectedReleaseTag && !selectedRelease.selectedImageRef) {
      setDeploymentError(
        `Release '${selectedRelease.selectedReleaseTag}' is missing a validated release reference. Re-select the release to validate CI and continue.`
      );
      return;
    }

    const releaseTagResult = await ensureReleaseTagForProject(currentProject.path);
    if (!releaseTagResult.ok) {
      setDeploymentError(releaseTagResult.message);
      setDeploymentLogs((prev) => [...prev.slice(-39), releaseTagResult.message]);
      return;
    }
    if (releaseTagResult.created) {
      const msg = `Created release '${releaseTagResult.tag}' from .tz/release.yaml for this deployment.`;
      setDeploymentNotice(msg);
      setDeploymentLogs((prev) => [...prev.slice(-39), msg]);
    } else {
      const msg = `Using release '${releaseTagResult.tag}'.`;
      setDeploymentLogs((prev) => [...prev.slice(-39), msg]);
    }

    setPendingApplyEnvironmentId(null);
    const includesPlanStep = environmentId === "prod";
    const initialSteps: DeploymentStep[] = [];
    if (includesPlanStep) {
      initialSteps.push({ id: "plan", label: "Plan", status: "pending" });
    }
    initialSteps.push(
      { id: "drift-check", label: "Drift check", status: "pending" },
      { id: "apply", label: "Apply", status: "pending" }
    );
    const stepStatusById: Partial<Record<DeploymentStepId, DeploymentStepStatus>> = Object.fromEntries(
      initialSteps.map((step) => [step.id, step.status])
    );
    const setStepStatus = (id: DeploymentStepId, status: DeploymentStepStatus) => {
      stepStatusById[id] = status;
      setDeploymentSteps((prev) =>
        prev.map((step) => (step.id === id ? { ...step, status } : step))
      );
    };
    setDeploymentSteps(initialSteps);
    setDeploymentStartedAt(Date.now());
    setDeploymentPlannedChanges([]);

    if (environmentId === "prod") {
      setStepStatus("plan", "running");
      const planResult = await runDeploymentAction(
        ["deployments", "plan", "--env", environmentId],
        `Plan completed for '${environmentId}'.`,
        { resetLogs: true }
      );
      if (planResult.exitCode !== 0) {
        setStepStatus("plan", "failed");
        setStepStatus("drift-check", "skipped");
        setStepStatus("apply", "skipped");
        setDeploymentError(
          "Production deploy requires a fresh plan. Resolve plan issues, then retry deploy."
        );
        return;
      }
      setDeploymentPlannedChanges(planResult.planChanges ?? []);
      setStepStatus("plan", "success");
      if (!confirmDrift) {
        setPendingApplyEnvironmentId(environmentId);
        setDeploymentNotice(
          `Plan is ready for '${environmentId}'. Review planned provider changes, then confirm apply.`
        );
        return;
      }
    }

    await runApplyForEnvironment(environmentId, {
      includesPlanStep,
      confirmDrift,
      setStepStatus,
      getStepStatus: (id) => stepStatusById[id],
    });
  };

  const handleDestroyEnvironmentConfirm = async () => {
    if (!confirmDestroyEnvironmentId) return;
    const args = [
      "deployments",
      "destroy",
      "--env",
      confirmDestroyEnvironmentId,
      "--confirm-env",
      confirmDestroyEnvironmentId,
      "--confirm",
      `destroy ${confirmDestroyEnvironmentId}`,
    ];
    if (confirmDestroyEnvironmentId === "prod") {
      args.push("--confirm-prod", "destroy prod permanently");
    }
    await runDeploymentAction(args, `Destroyed environment '${confirmDestroyEnvironmentId}'.`);
    setConfirmDestroyEnvironmentId(null);
  };

  const setEnvironmentReleaseSelection = (
    environmentId: string,
    selection: {
      imageRef?: string;
      imageDigest?: string;
      releaseTag?: string;
      deployPresetId?: string;
    },
    options?: {
      replace?: boolean;
    }
  ) => {
    if (!projectStateConfig) return;
    const nowIso = new Date().toISOString();
    const currentSelection = projectStateConfig.releaseState?.environments?.[environmentId];
    const nextSelection = resolveNextReleaseSelection({
      currentSelection,
      patch: selection,
      selectedAt: nowIso,
      replace: options?.replace === true,
    });
    const isUnchanged =
      (currentSelection?.selectedImageRef ?? undefined) ===
        (nextSelection.selectedImageRef ?? undefined) &&
      (currentSelection?.selectedImageDigest ?? undefined) ===
        (nextSelection.selectedImageDigest ?? undefined) &&
      (currentSelection?.selectedReleaseTag ?? undefined) ===
        (nextSelection.selectedReleaseTag ?? undefined) &&
      (currentSelection?.selectedDeployPresetId ?? undefined) ===
        (nextSelection.selectedDeployPresetId ?? undefined);
    if (isUnchanged) {
      return;
    }
    saveProjectConfig(currentProject.path, {
      ...projectStateConfig,
      releaseState: {
        environments: {
          ...(projectStateConfig.releaseState?.environments ?? {}),
          [environmentId]: {
            ...nextSelection,
          },
        },
      },
    });
    setDeploymentRefreshKey((v) => v + 1);
    setDeploymentNotice(
      !nextSelection.selectedReleaseTag &&
        !nextSelection.selectedImageRef &&
        !nextSelection.selectedImageDigest &&
        !nextSelection.selectedDeployPresetId
        ? `Cleared release selection for '${environmentId}'.`
        : nextSelection.selectedReleaseTag
        ? `Selected release '${nextSelection.selectedReleaseTag}' for '${environmentId}'.`
        : nextSelection.selectedDeployPresetId
        ? `Selected deploy preset '${nextSelection.selectedDeployPresetId}' for '${environmentId}'.`
        : `Selected release for '${environmentId}'.`
    );
  };

  const closeReleaseSelector = () => {
    setEditReleaseEnvironmentId(null);
    setCreateReleaseEntry(false);
    setAvailableReleaseTags([]);
    setAvailableDeployPresets([]);
    setSelectedEnvironmentProvider(null);
    setSuggestedReleaseTag("");
  };

  const handleCreateReleaseTagSubmit = async (
    targetEnvironmentId: string,
    requestedTag: string
  ) => {
    let preflightSummary: string | undefined;
    setReleaseBuildMonitor({
      tag: requestedTag,
      stage: "waiting",
      message: "Preparing release dependencies (ECR repository)...",
    });
    const dependencyResult = await ensureReleaseEcrRepository({
      projectPath: currentProject.path,
      projectName: currentProject.name,
      awsRegionHint: config.integrations?.aws?.backend?.region,
    });
    if (!dependencyResult.ok) {
      setReleaseBuildMonitor({
        tag: requestedTag,
        stage: "failed",
        message: dependencyResult.message,
      });
      return;
    }
    preflightSummary =
      dependencyResult.ecrStatus === "created"
        ? "ECR repo: created"
        : "ECR repo: already exists";
    let ensuredOidcRoleArn = config.integrations?.aws?.oidcRoleArn;
    const backendProfile = config.integrations?.aws?.backend?.profile?.trim();
    const backendRegion = config.integrations?.aws?.backend?.region?.trim();
    if (backendProfile && backendRegion) {
      const oidcEnsure = await ensureGithubOidcRoleForDeployments({
        profile: backendProfile,
        region: backendRegion,
      });
      if (!oidcEnsure.ok) {
        setReleaseBuildMonitor({
          tag: requestedTag,
          stage: "failed",
          message: oidcEnsure.message,
          preflightSummary,
        });
        return;
      }
      ensuredOidcRoleArn = oidcEnsure.roleArn;
      const nextConfig = syncProjects({
        ...config,
        integrations: {
          ...(config.integrations ?? {}),
          aws: {
            ...(config.integrations?.aws ?? { connected: true }),
            oidcRoleArn: ensuredOidcRoleArn,
            backend: config.integrations?.aws?.backend,
            backendChecks: config.integrations?.aws?.backendChecks,
          },
        },
      });
      saveConfig(nextConfig);
      onConfigUpdate?.(nextConfig);
    }
    const bootstrapResult = await bootstrapGithubRepoVariables({
      projectPath: currentProject.path,
      projectName: currentProject.name,
      awsRegion: config.integrations?.aws?.backend?.region,
      oidcRoleArn: ensuredOidcRoleArn,
    });
    const varsValidation = await validateGithubRepoVariablesForRelease({
      projectPath: currentProject.path,
    });
    if (!varsValidation.ok) {
      setReleaseBuildMonitor({
        tag: requestedTag,
        stage: "failed",
        message: `${varsValidation.message}${bootstrapResult.configured ? "" : ` ${bootstrapResult.message ?? ""}`}`.trim(),
        preflightSummary,
      });
      return;
    }

    const result = await createReleaseTagForProject(currentProject.path, requestedTag);
    if (!result.ok) {
      setReleaseBuildMonitor(null);
      setDeploymentError(result.message);
      return;
    }

    setReleaseBuildMonitor({
      tag: result.tag,
      stage: "pushing",
      message: `Publishing release '${result.tag}' to origin...`,
      preflightSummary,
    });
    const pushResult = await pushReleaseTagToOrigin(currentProject.path, result.tag);
    if (!pushResult.ok) {
      setReleaseBuildMonitor({
        tag: result.tag,
        stage: "failed",
        message: pushResult.message,
        preflightSummary,
      });
      return;
    }

    const monitorResult = await waitForReleaseWorkflowCompletion({
      projectPath: currentProject.path,
      tag: result.tag,
      onUpdate: (update) => {
        setReleaseBuildMonitor({
          tag: result.tag,
          stage: update.stage === "completed" ? "completed" : update.stage,
          message: update.message,
          runUrl: update.runUrl,
          preflightSummary,
        });
      },
    });
    if (!monitorResult.ok) {
      setReleaseBuildMonitor({
        tag: result.tag,
        stage: "failed",
        message: monitorResult.message,
        runUrl: monitorResult.runUrl,
        preflightSummary,
      });
      return;
    }

    let resolvedImage = await resolveReleaseImageForTag({
      projectPath: currentProject.path,
      tag: result.tag,
      preferredRunUrl: monitorResult.runUrl,
    });
    if (
      !resolvedImage.ok &&
      resolvedImage.message.includes(
        "Missing AWS_REGION or ECR_REPOSITORY repo variables for release image resolution."
      )
    ) {
      resolvedImage = await resolveReleaseImageForTag({
        projectPath: currentProject.path,
        tag: result.tag,
        preferredRunUrl: monitorResult.runUrl,
      });
    }
    if (!resolvedImage.ok) {
      setReleaseBuildMonitor({
        tag: result.tag,
        stage: "failed",
        message: resolvedImage.message,
        runUrl: resolvedImage.runUrl,
        preflightSummary,
      });
      return;
    }

    setEnvironmentReleaseSelection(targetEnvironmentId, {
      releaseTag: result.tag,
      imageRef: resolvedImage.imageRef,
      imageDigest: resolvedImage.imageDigest,
    });
    setReleaseBuildMonitor({
      tag: result.tag,
      stage: "completed",
      message: "Release build is ready. Release reference validated for deployment.",
      runUrl: resolvedImage.runUrl ?? monitorResult.runUrl,
      preflightSummary,
    });
    setDeploymentLogs((prev) => [...prev.slice(-39), `Created release '${result.tag}'.`]);
    closeReleaseSelector();
  };

  const openReleaseSelector = async (environmentId: string) => {
    setDeploymentError(null);
    setLoadingReleaseTags(true);
    setCreateReleaseEntry(false);
    setEditReleaseEnvironmentId(environmentId);

    const suggestion = await suggestNextReleaseTag(currentProject.path);
    if (suggestion.ok) {
      setSuggestedReleaseTag(suggestion.tag);
    } else {
      setSuggestedReleaseTag("");
    }

    const releaseConfigResult = loadProjectReleaseConfigWithError(currentProject.path);
    if (releaseConfigResult.error) {
      setDeploymentError(releaseConfigResult.error);
      setAvailableReleaseTags([]);
      setLoadingReleaseTags(false);
      return;
    }
    if (!releaseConfigResult.config) {
      setDeploymentError(
        "Release config not found. Expected .tz/release.yaml with release version settings."
      );
      setAvailableReleaseTags([]);
      setLoadingReleaseTags(false);
      return;
    }

    const tagsResult = await callShell(
      "git",
      ["tag", "--list", `${releaseConfigResult.config.tagPrefix}*`, "--sort=-v:refname"],
      {
        cwd: currentProject.path,
        collect: true,
        quiet: true,
        throwOnNonZero: false,
        stdin: "ignore",
      }
    );
    if (tagsResult.exitCode !== 0) {
      setDeploymentError(
        (tagsResult.stderr || tagsResult.stdout || "Failed to list releases.").trim()
      );
      setAvailableReleaseTags([]);
      setLoadingReleaseTags(false);
      return;
    }

    const tags = (tagsResult.stdout ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    setAvailableReleaseTags(tags);

    const templateMeta = listProjectConfigs().find((entry) => entry.id === currentProject.type);
    if (templateMeta) {
      const deployConfigResult = loadDeployTemplateConfigWithError(templateMeta.path);
      if (deployConfigResult.exists && !deployConfigResult.config) {
        setDeploymentError(
          `Template deploy config is invalid for '${currentProject.type}'. ${deployConfigResult.error ?? ""}`.trim()
        );
        setSelectedEnvironmentProvider(null);
        setAvailableDeployPresets([]);
      } else if (deployConfigResult.config) {
        const deployEnv = deployConfigResult.config.environments.find(
          (entry) => entry.id === environmentId
        );
        if (deployEnv) {
          setSelectedEnvironmentProvider(deployEnv.provider);
          const presets = deployConfigResult.config.presets
            .filter(
              (preset) =>
                preset.environments.includes(environmentId) &&
                (!preset.provider || preset.provider === deployEnv.provider)
            )
            .map((preset) => ({
              id: preset.id,
              label: preset.label,
              description: preset.description,
            }));
          setAvailableDeployPresets(presets);
        } else {
          setSelectedEnvironmentProvider(null);
          setAvailableDeployPresets([]);
        }
      } else {
        setSelectedEnvironmentProvider(null);
        setAvailableDeployPresets([]);
      }
    } else {
      setSelectedEnvironmentProvider(null);
      setAvailableDeployPresets([]);
    }
    setLoadingReleaseTags(false);
  };

  const handleConfirmDriftApply = async () => {
    if (!confirmDriftEnvironmentId) return;
    await handleDeployEnvironment(confirmDriftEnvironmentId, true);
    setConfirmDriftEnvironmentId(null);
  };

  const handleConfirmPlannedApply = async () => {
    if (!pendingApplyEnvironmentId) return;
    const environmentId = pendingApplyEnvironmentId;
    setPendingApplyEnvironmentId(null);
    const stepStatusById: Partial<Record<DeploymentStepId, DeploymentStepStatus>> = {};
    for (const step of deploymentSteps) {
      stepStatusById[step.id] = step.status;
    }
    const setStepStatus = (id: DeploymentStepId, status: DeploymentStepStatus) => {
      stepStatusById[id] = status;
      setDeploymentSteps((prev) =>
        prev.map((step) => (step.id === id ? { ...step, status } : step))
      );
    };
    await runApplyForEnvironment(environmentId, {
      includesPlanStep: true,
      confirmDrift: false,
      setStepStatus,
      getStepStatus: (id) => stepStatusById[id],
    });
  };

  if (choice === "delete") {
    return (
      <DeleteProjectView
        projectName={currentProject.name}
        deleteRemoteRepoOnDelete={deleteRemoteRepoOnDelete}
        deleteError={deleteError}
        onSelectDeleteRemote={setDeleteRemoteRepoOnDelete}
        onCancel={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
      />
    );
  }

  const answers = currentProject.builderAnswers ?? {};

  if (confirmDestroyEnvironmentId) {
    return (
      <ConfirmDestroyView
        environmentId={confirmDestroyEnvironmentId}
        error={deploymentError}
        onConfirm={handleDestroyEnvironmentConfirm}
        onCancel={() => setConfirmDestroyEnvironmentId(null)}
      />
    );
  }

  if (confirmDriftEnvironmentId) {
    return (
      <ConfirmDriftView
        environmentId={confirmDriftEnvironmentId}
        error={deploymentError}
        onConfirm={handleConfirmDriftApply}
        onCancel={() => setConfirmDriftEnvironmentId(null)}
      />
    );
  }

  if (releaseBuildMonitor) {
    return (
      <ReleaseBuildMonitorView
        monitor={releaseBuildMonitor}
        onClose={() => setReleaseBuildMonitor(null)}
      />
    );
  }

  if (pendingApplyEnvironmentId) {
    return (
      <PendingApplyView
        environmentId={pendingApplyEnvironmentId}
        deploymentPlannedChanges={deploymentPlannedChanges}
        onProceed={() => {
          void handleConfirmPlannedApply();
        }}
        onCancel={() => {
          setPendingApplyEnvironmentId(null);
          setDeploymentNotice("Apply cancelled. Plan remains available for review.");
          setDeploymentSteps((prev) =>
            prev.map((step) =>
              step.status === "pending" ? { ...step, status: "skipped" } : step
            )
          );
        }}
      />
    );
  }

  if (editReleaseEnvironmentId) {
    const currentSelection =
      projectStateConfig?.releaseState?.environments?.[editReleaseEnvironmentId];
    return (
      <ReleaseSelectorView
        environmentId={editReleaseEnvironmentId}
        environmentProvider={selectedEnvironmentProvider ?? undefined}
        loadingReleaseTags={loadingReleaseTags}
        createReleaseEntry={createReleaseEntry}
        currentSelection={currentSelection}
        availableDeployPresets={availableDeployPresets}
        availableReleaseTags={availableReleaseTags}
        suggestedReleaseTag={suggestedReleaseTag}
        error={deploymentError}
        onCreateReleaseSubmit={(value) => {
          const requestedTag = value.trim() || suggestedReleaseTag.trim();
          if (!requestedTag) {
            setDeploymentError("Release value cannot be blank.");
            return;
          }
          void (async () => {
            const targetEnvironmentId = editReleaseEnvironmentId;
            if (!targetEnvironmentId) {
              setDeploymentError("No target environment selected for release.");
              return;
            }
            await handleCreateReleaseTagSubmit(targetEnvironmentId, requestedTag);
          })();
        }}
        onStartCreate={() => {
          setDeploymentError(null);
          setCreateReleaseEntry(true);
        }}
        onClear={() => {
          setEnvironmentReleaseSelection(editReleaseEnvironmentId, {}, { replace: true });
          closeReleaseSelector();
        }}
        onBack={closeReleaseSelector}
        onSelectPreset={(presetId) => {
          setEnvironmentReleaseSelection(editReleaseEnvironmentId, {
            deployPresetId: presetId,
          });
        }}
        onSelectTag={(tag) => {
          void (async () => {
            setDeploymentError(null);
            const resolvedImage = await resolveReleaseImageForTag({
              projectPath: currentProject.path,
              tag,
            });
            if (!resolvedImage.ok) {
              setDeploymentError(
                `Release '${tag}' is not build-ready: ${resolvedImage.message}`
              );
              return;
            }
            setEnvironmentReleaseSelection(editReleaseEnvironmentId, {
              releaseTag: tag,
              imageRef: resolvedImage.imageRef,
              imageDigest: resolvedImage.imageDigest,
            });
            setDeploymentNotice(
              `Selected release '${tag}' and validated its release reference.`
            );
            closeReleaseSelector();
          })();
        }}
      />
    );
  }

  if (menuView === "actions") {
    if (selectedEnvironmentId) {
      const status = getEnvironmentStatus(selectedEnvironmentId);
      const canDestroy = isEnvironmentDeployed(selectedEnvironmentId);
      const hasDeployWorkspace = deployWorkspaceReadiness?.ready === true;
      const firstTfPath = deployWorkspaceReadiness?.tfFiles[0];
      const releaseSelection =
        projectStateConfig?.releaseState?.environments?.[selectedEnvironmentId];
      const templateMeta = listProjectConfigs().find((entry) => entry.id === currentProject.type);
      const deployConfig = templateMeta
        ? loadDeployTemplateConfigWithError(templateMeta.path).config
        : null;
      const environmentProvider = deployConfig?.environments.find(
        (entry) => entry.id === selectedEnvironmentId
      )?.provider;
      const envState = projectStateConfig?.deploymentState?.environments?.[selectedEnvironmentId];
      const envOutputs = projectStateConfig?.environmentOutputs?.[selectedEnvironmentId] ?? {};
      const lastSuccessfulApply = (projectStateConfig?.deploymentRunHistory ?? [])
        .filter(
          (run) =>
            run.environmentId === selectedEnvironmentId &&
            run.action === "apply" &&
            run.status === "success"
        )
        .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0];
      const appBaseUrlRecord = envOutputs.APP_BASE_URL;
      const providerLiveUrl =
        typeof appBaseUrlRecord?.value === "string" && appBaseUrlRecord.value.trim().length > 0
          ? appBaseUrlRecord.value.trim()
          : undefined;
      const liveUrl = providerLiveUrl;
      const resolvedOutputs = Object.values(envOutputs)
        .filter((record) => record.source === "providerOutput" || record.key === "APP_BASE_URL")
        .slice(0, 8)
        .map((record) => {
          if (record.secretRef && record.secretRef.length > 0) {
            return { key: record.key, value: `secret ref: ${record.secretRef}` };
          }
          if (record.sensitive === true && record.key !== "APP_BASE_URL") {
            return { key: record.key, value: "(sensitive)" };
          }
          if (typeof record.value === "string") return { key: record.key, value: record.value };
          if (typeof record.value === "number" || typeof record.value === "boolean") {
            return { key: record.key, value: String(record.value) };
          }
          if (typeof record.value === "undefined") return { key: record.key, value: "(empty)" };
          return { key: record.key, value: JSON.stringify(record.value) };
        });
      return (
        <EnvironmentActionsView
          selectedEnvironmentId={selectedEnvironmentId}
          status={status}
          liveUrl={liveUrl}
          environmentProvider={environmentProvider}
          canDestroy={canDestroy}
          hasDeployWorkspace={hasDeployWorkspace}
          deployTfCount={deployWorkspaceReadiness?.tfFiles.length ?? 0}
          firstTfPath={firstTfPath}
          releaseTag={releaseSelection?.selectedReleaseTag}
          releasePresetId={releaseSelection?.selectedDeployPresetId}
          imageOverride={releaseSelection?.selectedImageRef}
          imageDigest={releaseSelection?.selectedImageDigest}
          lastApplySummary={lastSuccessfulApply?.summary}
          lastApplyAt={lastSuccessfulApply?.finishedAt}
          lastReportedAt={envState?.lastReportedAt}
          lastStatusUpdatedAt={envState?.lastStatusUpdatedAt}
          resolvedOutputs={resolvedOutputs}
          deploymentNotice={deploymentNotice}
          deploymentInProgress={deploymentInProgress}
          deploymentSteps={deploymentSteps}
          deploymentStartedAt={deploymentStartedAt}
          deploymentPlannedChanges={deploymentPlannedChanges}
          deploymentError={deploymentError}
          deploymentLogs={deploymentLogs}
          actionLocked={deploymentInProgress || Date.now() < deploymentActionCooldownUntilRef.current}
          onBack={() => setSelectedEnvironmentId(null)}
          onDeploy={() => {
            void handleDeployEnvironment(selectedEnvironmentId);
          }}
          onSelectRelease={() => {
            void openReleaseSelector(selectedEnvironmentId);
          }}
          onReport={() => {
            void runDeploymentAction(
              ["deployments", "report", "--env", selectedEnvironmentId],
              `Report completed for '${selectedEnvironmentId}'.`
            );
          }}
          onDestroy={() => setConfirmDestroyEnvironmentId(selectedEnvironmentId)}
        />
      );
    }

    return (
      <DeploymentEnvironmentsListView
        environments={deployEnvironments}
        getEnvironmentStatus={getEnvironmentStatus}
        onDeleteApp={() => {
          setDeleteRemoteRepoOnDelete(null);
          setDeleteError(null);
          setChoice("delete");
        }}
        onSelectEnvironment={(environmentId) => setSelectedEnvironmentId(environmentId)}
      />
    );
  }

  if (menuView === "make" && makeTargets.length > 0) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow" bold>
          Make
        </Text>
        <Select
          options={makeTargets.map((t) => ({ label: t, value: t }))}
          onChange={(target) => void handleMakeSelect(target)}
        />
      </Box>
    );
  }

  const mainMenuOptions: Array<{ label: string; value: string }> =
    makeTargets.length > 0
      ? [
          { label: "Actions", value: "actions" },
          { label: "Make commands", value: "make" },
        ]
      : [{ label: "Actions", value: "actions" }];

  return (
    <DashboardHomeView
      projectName={currentProject.name}
      projectPath={currentProject.path}
      projectType={currentProject.type}
      answers={answers}
      mainMenuOptions={mainMenuOptions}
      onMenuChange={(value) => setMenuView(value)}
    />
  );
}
