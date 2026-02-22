import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { StepContext } from "@/lib/steps/types";
import { append } from "@/lib/steps/append";
import { copy } from "@/lib/steps/copy";
import { modify } from "@/lib/steps/modify";

const tmpRoots: string[] = [];

function createTmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-step-interpolate-"));
  tmpRoots.push(root);
  return root;
}

function createContext(projectRoot: string, configDir?: string): StepContext {
  return {
    projectDirectory: projectRoot,
    projectPath: projectRoot,
    projectName: "demo",
    answers: { projectName: "my-app" },
    profile: { name: "Tester", email: "tester@example.com" },
    configDir,
  };
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (!root) continue;
    rmSync(root, { recursive: true, force: true });
  }
});

describe("append interpolation behavior", () => {
  test("append uses raw content by default", async () => {
    const root = createTmpRoot();
    const projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    const ctx = createContext(projectRoot);

    await append(ctx, { file: "notes.txt", content: "Hello {{projectName}}" });
    expect(readFileSync(join(projectRoot, "notes.txt"), "utf-8")).toContain(
      "Hello {{projectName}}"
    );
  });

  test("append interpolates when interpolate=true", async () => {
    const root = createTmpRoot();
    const projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    const ctx = createContext(projectRoot);

    await append(ctx, {
      file: "notes.txt",
      content: "Hello {{projectName}}",
      interpolate: true,
    });
    expect(readFileSync(join(projectRoot, "notes.txt"), "utf-8")).toContain(
      "Hello my-app"
    );
  });
});

describe("modify appendIfMissing interpolation behavior", () => {
  test("modify appendIfMissing uses raw content by default", async () => {
    const root = createTmpRoot();
    const projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, ".env"), "BASE=1\n", "utf-8");
    const ctx = createContext(projectRoot);

    await modify(ctx, {
      file: ".env",
      appendIfMissing: {
        marker: "###> marker ###",
        content: "APP={{projectName}}",
      },
    });
    const result = readFileSync(join(projectRoot, ".env"), "utf-8");
    expect(result).toContain("APP={{projectName}}");
  });

  test("modify appendIfMissing interpolates when interpolate=true", async () => {
    const root = createTmpRoot();
    const projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(projectRoot, ".env"), "BASE=1\n", "utf-8");
    const ctx = createContext(projectRoot);

    await modify(ctx, {
      file: ".env",
      appendIfMissing: {
        marker: "###> marker ###",
        content: "APP={{projectName}}",
        interpolate: true,
      },
    });
    const result = readFileSync(join(projectRoot, ".env"), "utf-8");
    expect(result).toContain("APP=my-app");
  });
});

describe("copy interpolation behavior", () => {
  test("copy preserves source placeholders by default", async () => {
    const root = createTmpRoot();
    const templateDir = join(root, "template");
    const projectRoot = join(root, "project");
    mkdirSync(templateDir, { recursive: true });
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(templateDir, "source.txt"), "NAME={{projectName}}\n", "utf-8");
    const ctx = createContext(projectRoot, templateDir);

    await copy(ctx, { source: "source.txt", dest: "out.txt" });
    expect(readFileSync(join(projectRoot, "out.txt"), "utf-8")).toContain(
      "NAME={{projectName}}"
    );
  });

  test("copy interpolates file content when interpolate=true", async () => {
    const root = createTmpRoot();
    const templateDir = join(root, "template");
    const projectRoot = join(root, "project");
    mkdirSync(templateDir, { recursive: true });
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(join(templateDir, "source.txt"), "NAME={{projectName}}\n", "utf-8");
    const ctx = createContext(projectRoot, templateDir);

    await copy(ctx, { source: "source.txt", dest: "out.txt", interpolate: true });
    expect(readFileSync(join(projectRoot, "out.txt"), "utf-8")).toContain("NAME=my-app");
  });
});
