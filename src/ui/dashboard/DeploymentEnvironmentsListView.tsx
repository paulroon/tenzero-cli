import React from "react";
import { Box, Text } from "ink";
import { Select } from "@inkjs/ui";

const RED = "\x1b[31m";
const RESET = "\x1b[0m";

type DeployEnv = {
  id: string;
  label: string;
};

type Props = {
  environments: DeployEnv[];
  getEnvironmentStatus: (environmentId: string) => string;
  onDeleteApp: () => void;
  onSelectEnvironment: (environmentId: string) => void;
};

export function DeploymentEnvironmentsListView({
  environments,
  getEnvironmentStatus,
  onDeleteApp,
  onSelectEnvironment,
}: Props) {
  const environmentOptions = environments.map((env) => ({
    label: `${env.label} (${env.id}) - ${getEnvironmentStatus(env.id)}`,
    value: `env:${env.id}`,
  }));

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow" bold>
        Deployment Environments
      </Text>
      {environments.length === 0 && (
        <Text dimColor>No deployment environments defined for this template.</Text>
      )}
      <Select
        options={[...environmentOptions, { label: `${RED}Delete app${RESET}`, value: "delete" }]}
        onChange={(value) => {
          if (value === "delete") {
            onDeleteApp();
            return;
          }
          if (value.startsWith("env:")) {
            onSelectEnvironment(value.slice(4));
          }
        }}
      />
    </Box>
  );
}
