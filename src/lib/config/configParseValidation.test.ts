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

  test("pipeline fragment reference expands into executable steps", () => {
    const root = createTmpRoot();
    const path = join(root, "config.yaml");
    writeFileSync(
      path,
      [
        "type: demo",
        "fragments:",
        "  hello:",
        "    - type: append",
        "      config:",
        "        file: out.txt",
        "        content: hello",
        "pipeline:",
        "  - useFragment: hello",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = loadProjectBuilderConfigWithError(path);
    expect(result.error).toBeUndefined();
    expect(result.config).not.toBeNull();
    expect(result.config?.pipeline.length).toBe(1);
    expect(result.config?.pipeline[0]?.type).toBe("append");
  });

  test("unknown pipeline fragment reference fails predictably", () => {
    const root = createTmpRoot();
    const path = join(root, "config.yaml");
    writeFileSync(
      path,
      ["type: demo", "pipeline:", "  - useFragment: missing", ""].join("\n"),
      "utf-8"
    );

    const result = loadProjectBuilderConfigWithError(path);
    expect(result.config).toBeNull();
    expect(result.error).toContain("Unknown pipeline fragment reference");
  });

  test("fragment when conflicts fail predictably", () => {
    const root = createTmpRoot();
    const path = join(root, "config.yaml");
    writeFileSync(
      path,
      [
        "type: demo",
        "fragments:",
        "  dockerBlock:",
        "    - type: copy",
        "      when:",
        "        dockerize: \"true\"",
        "      config:",
        "        source: a.txt",
        "        dest: a.txt",
        "pipeline:",
        "  - useFragment: dockerBlock",
        "    when:",
        "      dockerize: \"false\"",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = loadProjectBuilderConfigWithError(path);
    expect(result.config).toBeNull();
    expect(result.error).toContain("Conflicting 'when' clause");
  });

  test("valid infra block parses successfully", () => {
    const root = createTmpRoot();
    const path = join(root, "config.yaml");
    writeFileSync(
      path,
      [
        "type: demo",
        "pipeline:",
        "  - type: createProjectDirectory",
        "infra:",
        "  version: \"1\"",
        "  environments:",
        "    - id: test",
        "      label: Test",
        "      capabilities:",
        "        - appRuntime",
        "        - postgres",
        "      constraints: {}",
        "      outputs:",
        "        - key: DATABASE_URL",
        "          type: secret_ref",
        "          sensitive: true",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = loadProjectBuilderConfigWithError(path);
    expect(result.error).toBeUndefined();
    expect(result.config?.infra?.version).toBe("1");
    expect(result.config?.infra?.environments.length).toBe(1);
  });

  test("unsupported infra.version fails predictably", () => {
    const root = createTmpRoot();
    const path = join(root, "config.yaml");
    writeFileSync(
      path,
      [
        "type: demo",
        "pipeline:",
        "  - type: createProjectDirectory",
        "infra:",
        "  version: \"2\"",
        "  environments:",
        "    - id: test",
        "      label: Test",
        "      capabilities: [appRuntime]",
        "      constraints: {}",
        "      outputs: []",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = loadProjectBuilderConfigWithError(path);
    expect(result.config).toBeNull();
    expect(result.error).toContain("unsupported infra.version");
  });

  test("duplicate infra environment id fails predictably", () => {
    const root = createTmpRoot();
    const path = join(root, "config.yaml");
    writeFileSync(
      path,
      [
        "type: demo",
        "pipeline:",
        "  - type: createProjectDirectory",
        "infra:",
        "  version: \"1\"",
        "  environments:",
        "    - id: test",
        "      label: Test 1",
        "      capabilities: [appRuntime]",
        "      constraints: {}",
        "      outputs: []",
        "    - id: test",
        "      label: Test 2",
        "      capabilities: [appRuntime]",
        "      constraints: {}",
        "      outputs: []",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = loadProjectBuilderConfigWithError(path);
    expect(result.config).toBeNull();
    expect(result.error).toContain("duplicate infra environment id");
  });

  test("invalid infra environment id format fails predictably", () => {
    const root = createTmpRoot();
    const path = join(root, "config.yaml");
    writeFileSync(
      path,
      [
        "type: demo",
        "pipeline:",
        "  - type: createProjectDirectory",
        "infra:",
        "  version: \"1\"",
        "  environments:",
        "    - id: Prod",
        "      label: Production",
        "      capabilities: [appRuntime]",
        "      constraints: {}",
        "      outputs: []",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = loadProjectBuilderConfigWithError(path);
    expect(result.config).toBeNull();
    expect(result.error).toContain(".id must match");
  });

  test("invalid infra capability fails predictably", () => {
    const root = createTmpRoot();
    const path = join(root, "config.yaml");
    writeFileSync(
      path,
      [
        "type: demo",
        "pipeline:",
        "  - type: createProjectDirectory",
        "infra:",
        "  version: \"1\"",
        "  environments:",
        "    - id: test",
        "      label: Test",
        "      capabilities: [kubernetes]",
        "      constraints: {}",
        "      outputs: []",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = loadProjectBuilderConfigWithError(path);
    expect(result.config).toBeNull();
    expect(result.error).toContain("capabilities[0] must be one of");
  });

  test("invalid infra output type fails predictably", () => {
    const root = createTmpRoot();
    const path = join(root, "config.yaml");
    writeFileSync(
      path,
      [
        "type: demo",
        "pipeline:",
        "  - type: createProjectDirectory",
        "infra:",
        "  version: \"1\"",
        "  environments:",
        "    - id: test",
        "      label: Test",
        "      capabilities: [appRuntime]",
        "      constraints: {}",
        "      outputs:",
        "        - key: APP_BASE_URL",
        "          type: uri",
        "",
      ].join("\n"),
      "utf-8"
    );

    const result = loadProjectBuilderConfigWithError(path);
    expect(result.config).toBeNull();
    expect(result.error).toContain("outputs[0].type must be one of");
  });
});
