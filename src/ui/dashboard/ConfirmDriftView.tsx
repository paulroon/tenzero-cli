import React from "react";
import { Box, Text } from "ink";
import { Alert, ConfirmInput } from "@inkjs/ui";

type Props = {
  environmentId: string;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDriftView({ environmentId, error, onConfirm, onCancel }: Props) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow" bold>
        Confirm drift deployment
      </Text>
      <Text>Drift was detected for environment "{environmentId}". Continue with deploy?</Text>
      {error && (
        <Alert variant="error" title="Drift confirmation required">
          {error}
        </Alert>
      )}
      <Box marginTop={1}>
        <ConfirmInput defaultChoice="cancel" onConfirm={onConfirm} onCancel={onCancel} />
      </Box>
    </Box>
  );
}
