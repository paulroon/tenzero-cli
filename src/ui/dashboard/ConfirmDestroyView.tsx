import React from "react";
import { Box, Text } from "ink";
import { Alert, ConfirmInput, Spinner } from "@inkjs/ui";

type Props = {
  environmentId: string;
  error: string | null;
  inProgress: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDestroyView({
  environmentId,
  error,
  inProgress,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text color="red" bold>
        Destroy environment
      </Text>
      <Text>Confirm destroy for environment "{environmentId}"?</Text>
      {inProgress && <Spinner label={`Destroying "${environmentId}"`} />}
      {error && (
        <Alert variant="error" title="Destroy failed">
          {error}
        </Alert>
      )}
      {!inProgress && (
        <Box marginTop={1}>
          <ConfirmInput defaultChoice="cancel" onConfirm={onConfirm} onCancel={onCancel} />
        </Box>
      )}
    </Box>
  );
}
