import { useMemo } from "react";
import { join } from "node:path";
import { Box, Text, useInput } from "ink";
import { Select } from "@inkjs/ui";
import type { TzConfig } from "../../../lib/config";
import { loadProjectConfig } from "../../../lib/projectConfig";
import { useInputMode } from "../../../contexts/InputModeContext";

type Props = {
  config: TzConfig;
  onBack: () => void;
  projectDirectory: string;
  onProjectSelect?: (projectPath: string) => void;
};

export default function OpenExistingProjectHandler({
  config,
  onBack,
  projectDirectory,
  onProjectSelect,
}: Props) {
  const { inputMode } = useInputMode();
  const projects = config.projects ?? [];

  const options = useMemo(
    () =>
      projects.map((dirName) => {
        const fullPath = join(projectDirectory, dirName);
        const projectConfig = loadProjectConfig(fullPath);
        const label = projectConfig?.name ?? dirName;
        return { label, value: dirName };
      }),
    [projects, projectDirectory]
  );

  useInput(
    (input, key) => {
      const isBack = key.escape || (!inputMode && (input === "b" || input === "B"));
      if (isBack) onBack();
    },
    { isActive: true }
  );

  if (projects.length === 0) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Open Existing Project</Text>
        <Text dimColor>No projects found.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">Open Existing Project</Text>
      <Text>Choose a project:</Text>
      <Box marginTop={1} borderStyle="round" borderColor="cyan">
        <Select
          options={options}
          onChange={(value) => {
            const fullPath = join(projectDirectory, value);
            onProjectSelect?.(fullPath);
          }}
        />
      </Box>
    </Box>
  );
}
