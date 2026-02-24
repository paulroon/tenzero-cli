import React from "react";
import { Box, Text } from "ink";
import { Alert, Select, Spinner, TextInput } from "@inkjs/ui";
import type { ReleaseSelection } from "@/ui/dashboard/types";

type Props = {
  environmentId: string;
  loadingReleaseTags: boolean;
  createReleaseEntry: boolean;
  currentSelection?: ReleaseSelection;
  availableReleaseTags: string[];
  suggestedReleaseTag: string;
  error?: string | null;
  onCreateReleaseSubmit: (value: string) => void;
  onStartCreate: () => void;
  onClear: () => void;
  onBack: () => void;
  onSelectTag: (tag: string) => void;
};

export function ReleaseSelectorView({
  environmentId,
  loadingReleaseTags,
  createReleaseEntry,
  currentSelection,
  availableReleaseTags,
  suggestedReleaseTag,
  error,
  onCreateReleaseSubmit,
  onStartCreate,
  onClear,
  onBack,
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
      <Text>Choose a release to deploy for this environment.</Text>
      <Text dimColor>Current release: {currentSelection?.selectedReleaseTag ?? "(not selected)"}</Text>
      <Text dimColor>Resolved release reference: {currentSelection?.selectedImageRef ?? "(not selected)"}</Text>
      {availableReleaseTags.length === 0 && <Text dimColor>No existing releases found.</Text>}
      <Select
        options={[
          ...availableReleaseTags.map((tag) => ({
            label: currentSelection?.selectedReleaseTag === tag ? `${tag} (current)` : tag,
            value: `tag:${tag}`,
          })),
          ...(suggestedReleaseTag
            ? [{ label: `Create new release... (${suggestedReleaseTag})`, value: "__create__" }]
            : [{ label: "Create new release...", value: "__create__" }]),
          { label: "Clear release selection", value: "__clear__" },
          { label: "Back", value: "__back__" },
        ]}
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
          if (value.startsWith("tag:")) {
            onSelectTag(value.slice(4));
          }
        }}
      />
    </Box>
  );
}
