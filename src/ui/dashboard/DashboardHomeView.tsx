import React from "react";
import { Box, Text } from "ink";
import { Select } from "@inkjs/ui";

type Props = {
  projectName: string;
  projectPath: string;
  projectType: string;
  answers: Record<string, unknown>;
  mainMenuOptions: Array<{ label: string; value: string }>;
  onMenuChange: (value: "actions" | "make") => void;
};

export function DashboardHomeView({
  projectName,
  projectPath,
  projectType,
  answers,
  mainMenuOptions,
  onMenuChange,
}: Props) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow" bold>
        {projectName}
      </Text>
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text>
          <Text dimColor>Path: </Text>
          {projectPath}
        </Text>
        <Text>
          <Text dimColor>Type: </Text>
          {projectType}
        </Text>
        {Object.keys(answers).length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>Options:</Text>
            {Object.entries(answers).map(([key, value]) => (
              <Text key={key}>
                {"  "}
                {key}: {String(value)}
              </Text>
            ))}
          </Box>
        )}
      </Box>
      <Box marginTop={1} flexDirection="column" gap={0}>
        <Text dimColor>Commands:</Text>
        <Select options={mainMenuOptions} onChange={(value) => onMenuChange(value as "actions" | "make")} />
      </Box>
    </Box>
  );
}
