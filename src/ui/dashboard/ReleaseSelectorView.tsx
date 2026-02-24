import React from "react";
import { Box, Text } from "ink";
import { Alert, Select, Spinner, TextInput } from "@inkjs/ui";
import type { ReleaseSelection } from "@/ui/dashboard/types";
import { buildReleaseSelectorOptions } from "@/ui/dashboard/releaseSelectorOptions";

type Props = {
  environmentId: string;
  environmentProvider?: string;
  loadingReleaseTags: boolean;
  createReleaseEntry: boolean;
  currentSelection?: ReleaseSelection;
  availableDeployPresets: Array<{ id: string; label: string; description: string }>;
  availableReleaseTags: string[];
  suggestedReleaseTag: string;
  error?: string | null;
  onCreateReleaseSubmit: (value: string) => void;
  onStartCreate: () => void;
  onClear: () => void;
  onBack: () => void;
  onSelectPreset: (presetId: string) => void;
  onSelectTag: (tag: string) => void;
};

export function ReleaseSelectorView({
  environmentId,
  environmentProvider,
  loadingReleaseTags,
  createReleaseEntry,
  currentSelection,
  availableDeployPresets,
  availableReleaseTags,
  suggestedReleaseTag,
  error,
  onCreateReleaseSubmit,
  onStartCreate,
  onClear,
  onBack,
  onSelectPreset,
  onSelectTag,
}: Props) {
  if (loadingReleaseTags) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow" bold>
          Select release ({environmentId})
        </Text>
        <Spinner label="Loading releases" />
      </Box>
    );
  }

  if (createReleaseEntry) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow" bold>
          Create release ({environmentId})
        </Text>
        <Text>Suggestion uses semver patch bump with rollover every 10 patches.</Text>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <TextInput
          key={suggestedReleaseTag}
          defaultValue={suggestedReleaseTag}
          placeholder="v1.2.3"
          onSubmit={onCreateReleaseSubmit}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow" bold>
        Select release ({environmentId})
      </Text>
      <Text dimColor>Provider: {environmentProvider ?? "(template default)"}</Text>
      <Text>Choose a release to deploy for this environment.</Text>
      <Text dimColor>
        Current preset: {currentSelection?.selectedDeployPresetId ?? "(not selected)"}
      </Text>
      {!currentSelection?.selectedDeployPresetId && availableDeployPresets.length > 0 ? (
        <Alert variant="warning">Select a deploy preset before running deployment.</Alert>
      ) : null}
      <Text dimColor>Current release: {currentSelection?.selectedReleaseTag ?? "(not selected)"}</Text>
      <Text dimColor>Resolved release reference: {currentSelection?.selectedImageRef ?? "(not selected)"}</Text>
      {availableDeployPresets.length === 0 && <Text dimColor>No deploy presets available for this environment.</Text>}
      {availableReleaseTags.length === 0 && <Text dimColor>No existing releases found.</Text>}
      <Select
        options={buildReleaseSelectorOptions({
          availableDeployPresets,
          availableReleaseTags,
          currentSelection,
          suggestedReleaseTag,
        })}
        onChange={(value) => {
          if (value === "__create__") {
            onStartCreate();
            return;
          }
          if (value === "__clear__") {
            onClear();
            return;
          }
          if (value === "__back__") {
            onBack();
            return;
          }
          if (value.startsWith("preset:")) {
            onSelectPreset(value.slice(7));
            return;
          }
          if (value.startsWith("tag:")) {
            onSelectTag(value.slice(4));
          }
        }}
      />
    </Box>
  );
}
