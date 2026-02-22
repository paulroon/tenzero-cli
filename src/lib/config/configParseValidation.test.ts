import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseConfigFileResult } from "@/lib/config/parseConfigFile";
import { loadProjectBuilderConfigWithError } from "@/lib/config/projectBuilder";

const tmpRoots: string[] = [];

function createTmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-config-validate-"));
  tmpRoots.push(root);
  return root;
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (!root) continue;
    rmSync(root, { recursive: true, force: true });
  }
});

describe("config parse result", () => {
  test("malformed YAML returns actionable error text", () => {
    const root = createTmpRoot();
    const path = join(root, "bad.yaml");
    writeFileSync(path, "type: demo\npipeline: [\n", "utf-8");

    const result = parseConfigFileResult(path);
    expect(result.data).toBeNull();
    expect(result.error).toContain("Failed to parse YAML config");
    expect(result.error).toContain(path);
  });

  test("malformed JSON returns actionable error text", () => {
    const root = createTmpRoot();
    const path = join(root, "bad.json");
    writeFileSync(path, '{"type":"demo","pipeline":[}', "utf-8");

    const result = parseConfigFileResult(path);
    expect(result.data).toBeNull();
    expect(result.error).toContain("Failed to parse JSON config");
    expect(result.error).toContain(path);
  });
});

describe("project config validation", () => {
  test("missing required field 'type' fails predictably", () => {
    const root = createTmpRoot();
    const path = join(root, "config.yaml");
    writeFileSync(path, "label: Demo\npipeline: []\n", "utf-8");

    const result = loadProjectBuilderConfigWithError(path);
    expect(result.config).toBeNull();
    expect(result.error).toContain("missing required field 'type'");
  });

  test("invalid required field 'pipeline' fails predictably", () => {
    const root = createTmpRoot();
    const path = join(root, "config.yaml");
    writeFileSync(path, "type: demo\npipeline: not-an-array\n", "utf-8");

    const result = loadProjectBuilderConfigWithError(path);
    expect(result.config).toBeNull();
    expect(result.error).toContain("missing required field 'pipeline' (array)");
  });

  test("invalid question type fails predictably", () => {
    const root = createTmpRoot();
    const path = join(root, "config.yaml");
    writeFileSync(
      path,
      [
        "type: demo",
        "pipeline:",
        "  - type: createProjectDirectory",
        "questions:",
        "  - id: projectName",
        "    label: Project name",
        "    type: number",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = loadProjectBuilderConfigWithError(path);
    expect(result.config).toBeNull();
    expect(result.error).toContain("questions[0].type must be one of");
  });
});
