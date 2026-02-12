import { useState } from "react";
import { Box, Text } from "ink";
import { Alert, ConfirmInput, Select } from "@inkjs/ui";
import { useBackKey } from "@/hooks/useBackKey";
import { useCurrentProject } from "@/contexts/CurrentProjectContext";
import { syncProjects, saveConfig, type TzConfig } from "@/lib/config";
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

export default function ProjectScreen({
  onBack,
  config,
  onConfigUpdate,
}: Props) {
  const { currentProject, clearCurrentProject } = useCurrentProject();
  const [choice, setChoice] = useState<ActionChoice | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useBackKey(() => {
    if (choice === null) {
      clearCurrentProject();
      onBack();
    } else {
      setChoice(null);
      setDeleteError(null);
    }
  });

  if (!currentProject) return null;

  const handleDeleteConfirm = () => {
    try {
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
        <Text dimColor>Actions:</Text>
        <Select
          options={PROJECT_ACTIONS.map((o) => ({
            label: o.label,
            value: o.value,
          }))}
          onChange={(value) => setChoice(value as ActionChoice)}
        />
      </Box>
    </Box>
  );
}
