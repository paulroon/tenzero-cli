import React from "react";
import { Box, Text } from "ink";
import { Select } from "@inkjs/ui";

const RED = "\x1b[31m";
const RESET = "\x1b[0m";

type InfraEnv = {
  id: string;
  label: string;
};

type Props = {
  environments: InfraEnv[];
  getEnvironmentStatus: (environmentId: string) => string;
  onDeleteApp: () => void;
  onSelectEnvironment: (environmentId: string) => void;
};

export function InfraEnvironmentsListView({
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
        Infra Environments
      </Text>
      {environments.length === 0 && (
        <Text dimColor>No infra environments defined for this template.</Text>
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
