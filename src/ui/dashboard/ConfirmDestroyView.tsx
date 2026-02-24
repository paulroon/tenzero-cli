import React from "react";
import { Box, Text } from "ink";
import { Alert, ConfirmInput } from "@inkjs/ui";

type Props = {
  environmentId: string;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDestroyView({ environmentId, error, onConfirm, onCancel }: Props) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text color="red" bold>
        Destroy environment
      </Text>
      <Text>Confirm destroy for environment "{environmentId}"?</Text>
      {error && (
        <Alert variant="error" title="Destroy failed">
          {error}
        </Alert>
      )}
      <Box marginTop={1}>
        <ConfirmInput defaultChoice="cancel" onConfirm={onConfirm} onCancel={onCancel} />
      </Box>
    </Box>
  );
}
