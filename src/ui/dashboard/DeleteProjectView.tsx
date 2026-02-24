import React from "react";
import { Box, Text } from "ink";
import { Alert, ConfirmInput, Select } from "@inkjs/ui";

type Props = {
  projectName: string;
  deleteRemoteRepoOnDelete: boolean | null;
  deleteError: string | null;
  onSelectDeleteRemote: (enabled: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteProjectView({
  projectName,
  deleteRemoteRepoOnDelete,
  deleteError,
  onSelectDeleteRemote,
  onCancel,
  onConfirm,
}: Props) {
  if (deleteRemoteRepoOnDelete === null) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow" bold>
          Delete options
        </Text>
        <Text>Also delete the remote GitHub repository (origin), if present?</Text>
        <Text dimColor>This is best-effort and requires a configured GITHUB_TOKEN.</Text>
        {deleteError && (
          <Box marginTop={1}>
            <Alert variant="error" title="Delete setup failed">
              {deleteError}
            </Alert>
          </Box>
        )}
        <Select
          options={[
            { label: "Yes - delete local app and remote GitHub repo", value: "yes" },
            { label: "No - delete local app only", value: "no" },
            { label: "Cancel", value: "cancel" },
          ]}
          onChange={(value) => {
            if (value === "cancel") {
              onCancel();
              return;
            }
            onSelectDeleteRemote(value === "yes");
          }}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="red" bold>
        Delete project
      </Text>
      <Text>Permanently delete "{projectName}" and all its files?</Text>
      <Text dimColor>
        Remote GitHub repo deletion: {deleteRemoteRepoOnDelete ? "enabled" : "disabled"}.
      </Text>
      {deleteRemoteRepoOnDelete && (
        <Alert variant="warning" title="Remote delete enabled">
          This will also permanently delete the remote GitHub repository configured as origin.
        </Alert>
      )}
      {deleteError && (
        <Box marginTop={1}>
          <Alert variant="error" title="Delete failed">
            {deleteError}
          </Alert>
        </Box>
      )}
      <Box marginTop={1}>
        <ConfirmInput defaultChoice="cancel" onConfirm={onConfirm} onCancel={onCancel} />
      </Box>
    </Box>
  );
}
