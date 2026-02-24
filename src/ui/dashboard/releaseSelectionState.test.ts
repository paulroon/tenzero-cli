import { describe, expect, it } from "bun:test";
import { resolveNextReleaseSelection } from "@/ui/dashboard/releaseSelectionState";

describe("resolveNextReleaseSelection", () => {
  it("preserves release fields on preset-only updates", () => {
    const next = resolveNextReleaseSelection({
      currentSelection: {
        selectedReleaseTag: "v1.0.0",
        selectedImageRef: "repo/image:v1.0.0",
        selectedImageDigest: "sha256:abc",
        selectedDeployPresetId: "cheap",
      },
      patch: { deployPresetId: "max" },
      selectedAt: "2026-02-23T00:00:00.000Z",
      replace: false,
    });

    expect(next).toEqual({
      selectedReleaseTag: "v1.0.0",
      selectedImageRef: "repo/image:v1.0.0",
      selectedImageDigest: "sha256:abc",
      selectedDeployPresetId: "max",
      selectedAt: "2026-02-23T00:00:00.000Z",
    });
  });

  it("keeps current preset when release changes", () => {
    const next = resolveNextReleaseSelection({
      currentSelection: {
        selectedDeployPresetId: "cheap",
      },
      patch: {
        releaseTag: "v1.0.1",
        imageRef: "repo/image:v1.0.1",
        imageDigest: "sha256:def",
      },
      selectedAt: "2026-02-23T00:00:00.000Z",
      replace: false,
    });

    expect(next.selectedDeployPresetId).toBe("cheap");
    expect(next.selectedReleaseTag).toBe("v1.0.1");
  });

  it("clears all fields when replace is true and patch is empty", () => {
    const next = resolveNextReleaseSelection({
      currentSelection: {
        selectedReleaseTag: "v1.0.0",
        selectedImageRef: "repo/image:v1.0.0",
        selectedImageDigest: "sha256:abc",
        selectedDeployPresetId: "cheap",
      },
      patch: {},
      selectedAt: "2026-02-23T00:00:00.000Z",
      replace: true,
    });

    expect(next).toEqual({
      selectedImageRef: undefined,
      selectedImageDigest: undefined,
      selectedReleaseTag: undefined,
      selectedDeployPresetId: undefined,
      selectedAt: "2026-02-23T00:00:00.000Z",
    });
  });
});
