import type { ProjectEnvironmentReleaseSelection } from "@/lib/config/project";

type ReleaseSelectionPatch = {
  imageRef?: string;
  imageDigest?: string;
  releaseTag?: string;
  deployPresetId?: string;
};

type Params = {
  currentSelection?: ProjectEnvironmentReleaseSelection;
  patch: ReleaseSelectionPatch;
  selectedAt: string;
  replace: boolean;
};

export function resolveNextReleaseSelection({
  currentSelection,
  patch,
  selectedAt,
  replace,
}: Params): ProjectEnvironmentReleaseSelection {
  const normalize = (value: string | undefined): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const nextImageRef = normalize(patch.imageRef);
  const nextImageDigest = normalize(patch.imageDigest);
  const nextReleaseTag = normalize(patch.releaseTag);
  const nextPresetId = normalize(patch.deployPresetId);

  if (replace) {
    return {
      selectedImageRef: nextImageRef,
      selectedImageDigest: nextImageDigest,
      selectedReleaseTag: nextReleaseTag,
      selectedDeployPresetId: nextPresetId,
      selectedAt,
    };
  }

  return {
    selectedImageRef: nextImageRef ?? currentSelection?.selectedImageRef,
    selectedImageDigest: nextImageDigest ?? currentSelection?.selectedImageDigest,
    selectedReleaseTag: nextReleaseTag ?? currentSelection?.selectedReleaseTag,
    selectedDeployPresetId: nextPresetId ?? currentSelection?.selectedDeployPresetId,
    selectedAt,
  };
}
