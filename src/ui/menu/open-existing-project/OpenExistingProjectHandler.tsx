import { useMemo } from "react";
import { join } from "node:path";
import { Box, Text } from "ink";
import { Select } from "@inkjs/ui";
import { loadProjectConfig, type TzConfig } from "@/lib/config";
import { useBackKey } from "@/hooks/useBackKey";

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
  useBackKey(onBack);
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
      <Box marginTop={1}>
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
