import { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { Alert, ConfirmInput, Select } from "@inkjs/ui";
import { useBackKey } from "@/hooks/useBackKey";
import { useCurrentProject } from "@/contexts/CurrentProjectContext";
import {
  syncProjects,
  saveConfig,
  DEFAULT_EDITOR,
  type TzConfig,
} from "@/lib/config";
import { getMakefileTargets } from "@/lib/makefile";
import { callShell } from "@/lib/shell";
import { rmSync } from "node:fs";

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

  const isDockerized = currentProject?.builderAnswers?.dockerize === "yes";

  useInput(
    (input, key) => {
      if (!currentProject) return;
      if (input.toLowerCase() === "o" && !key.ctrl && !key.meta) {
        const editor = config.editor?.trim() || DEFAULT_EDITOR;
        void callShell(
          `${editor} ${JSON.stringify(currentProject.path)}`,
          { loginShell: true, detached: true }
        );
      }
      if (
        input.toLowerCase() === "l" &&
        !key.ctrl &&
        !key.meta &&
        isDockerized
      ) {
        const url = "http://localhost:8000";
        const cmd =
          process.platform === "win32"
            ? ["cmd", "/c", "start", url]
            : process.platform === "darwin"
              ? ["open", url]
              : ["xdg-open", url];
        void callShell(cmd[0], cmd.slice(1), { detached: true });
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
      const isDockerized = currentProject.builderAnswers?.dockerize === "yes";
      if (isDockerized && makeTargets.includes("down")) {
        try {
          await callShell("make", ["down"], {
            cwd: currentProject.path,
            throwOnNonZero: false,
          });
        } catch {
          /* ignore: make down failed or target missing, proceed with delete */
        }
      }
      rmSync(currentProject.path, { recursive: true });
      const updatedConfig = syncProjects(config);
      saveConfig(updatedConfig);
      onConfigUpdate?.(updatedConfig);
      clearCurrentProject();
      onBack();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
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
