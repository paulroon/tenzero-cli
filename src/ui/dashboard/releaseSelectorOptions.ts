import type { ReleaseSelection } from "@/ui/dashboard/types";

type DeployPresetOption = { id: string; label: string; description: string };
type SelectorOption = { label: string; value: string };

type Params = {
  availableDeployPresets: DeployPresetOption[];
  availableReleaseTags: string[];
  currentSelection?: ReleaseSelection;
  suggestedReleaseTag: string;
};

export function buildReleaseSelectorOptions({
  availableDeployPresets,
  availableReleaseTags,
  currentSelection,
  suggestedReleaseTag,
}: Params): SelectorOption[] {
  const presetOptions = availableDeployPresets.map((preset) => ({
    label:
      currentSelection?.selectedDeployPresetId === preset.id
        ? `Preset: ${preset.label} (current) - ${preset.description}`
        : `Preset: ${preset.label} - ${preset.description}`,
    value: `preset:${preset.id}`,
  }));
  const releaseOptions = availableReleaseTags.map((tag) => ({
    label: currentSelection?.selectedReleaseTag === tag ? `${tag} (current)` : tag,
    value: `tag:${tag}`,
  }));
  const createOption = suggestedReleaseTag
    ? [{ label: `Create new release... (${suggestedReleaseTag})`, value: "__create__" }]
    : [{ label: "Create new release...", value: "__create__" }];

  return [
    ...presetOptions,
    ...releaseOptions,
    ...createOption,
    { label: "Clear release selection", value: "__clear__" },
    { label: "Back", value: "__back__" },
  ];
}
