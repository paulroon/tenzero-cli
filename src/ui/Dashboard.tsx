import React, { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { render } from "ink";
import { Alert, ConfirmInput, Select } from "@inkjs/ui";
import { useBackKey } from "@/hooks/useBackKey";
import { useCurrentProject } from "@/contexts/CurrentProjectContext";
import {
  syncProjects,
  saveConfig,
  DEFAULT_EDITOR,
  type TzProjectConfig,
  type TzConfig,
} from "@/lib/config";
import { getMakefileTargets } from "@/lib/makefile";
import { callShell } from "@/lib/shell";
import { setResumeProjectPath } from "@/lib/resumeState";
import { getInkInstance, setInkInstance } from "@/lib/inkInstance";
import { getErrorMessage } from "@/lib/errors";
import { evaluateProjectDeleteGuard } from "@/lib/deployments/deleteGuard";
import App from "@/ui/App";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const RED = "\x1b[31m";
const RESET = "\x1b[0m";

const PROJECT_ACTIONS = [
  { label: `${RED}Delete project${RESET}`, value: "delete" },
] as const;

type ActionChoice = (typeof PROJECT_ACTIONS)[number]["value"];

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
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [menuView, setMenuView] = useState<"main" | "actions" | "make">("main");

  useBackKey(() => {
    if (choice !== null) {
      setChoice(null);
      setDeleteError(null);
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
      const deleteGuard = evaluateProjectDeleteGuard(currentProject.path);
      if (!deleteGuard.allowed) {
        const details = deleteGuard.blocks
          .map(
            (block) =>
              `${block.environmentId}: ${block.reason}. Run '${block.remediationCommand}'.`
          )
          .join("\n");
        throw new Error(
          `Cannot delete local app while provider-backed environments still exist.\n${details}`
        );
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
    setDeleteError(null);
  };

  if (choice === "delete") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="red" bold>
          Delete project
        </Text>
        <Text>
          Permanently delete "{currentProject.name}" and all its files?
        </Text>
        {deleteError && (
          <Box marginTop={1}>
            <Alert variant="error" title="Delete failed">
              {deleteError}
            </Alert>
          </Box>
        )}
        <Box marginTop={1}>
          <ConfirmInput
            defaultChoice="cancel"
            onConfirm={handleDeleteConfirm}
            onCancel={handleDeleteCancel}
          />
        </Box>
      </Box>
    );
  }

  const answers = currentProject.builderAnswers ?? {};

  if (menuView === "actions") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow" bold>
          Actions
        </Text>
        <Select
          options={PROJECT_ACTIONS.map((o) => ({
            label: o.label,
            value: o.value,
          }))}
          onChange={(value) => setChoice(value as ActionChoice)}
        />
      </Box>
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
    <Box flexDirection="column" gap={1}>
      <Text color="yellow" bold>
        {currentProject.name}
      </Text>
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text>
          <Text dimColor>Path: </Text>
          {currentProject.path}
        </Text>
        <Text>
          <Text dimColor>Type: </Text>
          {currentProject.type}
        </Text>
        {Object.keys(answers).length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>Options:</Text>
            {Object.entries(answers).map(([key, value]) => (
              <Text key={key}>
                {"  "}
                {key}: {value}
              </Text>
            ))}
          </Box>
        )}
      </Box>
      <Box marginTop={1} flexDirection="column" gap={0}>
        <Text dimColor>Commands:</Text>
        <Select
          options={mainMenuOptions}
          onChange={(value) => setMenuView(value as "actions" | "make")}
        />
      </Box>
    </Box>
  );
}
