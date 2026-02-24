import { describe, expect, it } from "bun:test";
import { buildReleaseSelectorOptions } from "@/ui/dashboard/releaseSelectorOptions";

describe("release selector options", () => {
  it("includes preset options and marks current preset", () => {
    const options = buildReleaseSelectorOptions({
      availableDeployPresets: [
        { id: "cheap", label: "Cheap", description: "Lowest cost" },
        { id: "max", label: "Max", description: "High throughput" },
      ],
      availableReleaseTags: ["v1.0.0"],
      currentSelection: {
        selectedReleaseTag: "v1.0.0",
        selectedImageRef: "example/ref",
        selectedDeployPresetId: "cheap",
      },
      suggestedReleaseTag: "v1.0.1",
    });

    expect(options[0]).toEqual({
      label: "Preset: Cheap (current) - Lowest cost",
      value: "preset:cheap",
    });
    expect(options[1]).toEqual({
      label: "Preset: Max - High throughput",
      value: "preset:max",
    });
  });

  it("always includes create, clear and back actions", () => {
    const withSuggestion = buildReleaseSelectorOptions({
      availableDeployPresets: [],
      availableReleaseTags: [],
      currentSelection: undefined,
      suggestedReleaseTag: "v2.0.0",
    });
    const withoutSuggestion = buildReleaseSelectorOptions({
      availableDeployPresets: [],
      availableReleaseTags: [],
      currentSelection: undefined,
      suggestedReleaseTag: "",
    });

    expect(withSuggestion.map((entry) => entry.value)).toEqual([
      "__create__",
      "__clear__",
      "__back__",
    ]);
    expect(withSuggestion[0]?.label).toContain("v2.0.0");
    expect(withoutSuggestion[0]?.label).toBe("Create new release...");
  });
});
