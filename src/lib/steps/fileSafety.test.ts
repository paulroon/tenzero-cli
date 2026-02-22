import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copy } from "@/lib/steps/copy";
import { modify } from "@/lib/steps/modify";
import { deleteStep } from "@/lib/steps/delete";
import type { StepContext } from "@/lib/steps/types";

const tmpRoots: string[] = [];

function createTmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-step-safety-"));
  tmpRoots.push(root);
  return root;
}

function createContext(projectRoot: string, configDir?: string): StepContext {
  return {
    projectDirectory: projectRoot,
    projectPath: projectRoot,
    projectName: "demo",
    answers: {},
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

describe("copy step file safety", () => {
  test("rejects source traversal", async () => {
    const root = createTmpRoot();
    const configDir = join(root, "template");
    mkdirSync(configDir, { recursive: true });
    const outside = join(root, "outside.txt");
    writeFileSync(outside, "x", "utf-8");

    const ctx = createContext(join(root, "project"), configDir);
    await expect(
      copy(ctx, { source: "../outside.txt", dest: "inside.txt" })
    ).rejects.toThrow("copy.config.source rejected: path escapes allowed root");
  });

  test("rejects destination traversal", async () => {
    const root = createTmpRoot();
    const configDir = join(root, "template");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "source.txt"), "content", "utf-8");

    const projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    const ctx = createContext(projectRoot, configDir);

    await expect(
      copy(ctx, { source: "source.txt", dest: "../outside.txt" })
    ).rejects.toThrow("copy.config.dest rejected: path escapes allowed root");
  });
});

describe("modify step file safety", () => {
  test("rejects traversal path", async () => {
    const root = createTmpRoot();
    const projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    const ctx = createContext(projectRoot);

    await expect(
      modify(ctx, {
        file: "../outside.txt",
        replacements: [{ search: "a", replace: "b" }],
      })
    ).rejects.toThrow("modify.config.file rejected: path escapes allowed root");
  });

  test("rejects symlink target", async () => {
    const root = createTmpRoot();
    const projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    const realFile = join(projectRoot, "real.txt");
    writeFileSync(realFile, "abc", "utf-8");
    const linkFile = join(projectRoot, "link.txt");
    symlinkSync(realFile, linkFile);

    const ctx = createContext(projectRoot);
    await expect(
      modify(ctx, {
        file: "link.txt",
        replacements: [{ search: "a", replace: "b" }],
      })
    ).rejects.toThrow("modify.config.file rejected: symlink not allowed");
  });
});

describe("delete step file safety", () => {
  test("rejects traversal path", async () => {
    const root = createTmpRoot();
    const projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    const ctx = createContext(projectRoot);

    await expect(
      deleteStep(ctx, { file: "../outside.txt" })
    ).rejects.toThrow("delete.config.file rejected: path escapes allowed root");
  });

  test("rejects symlink target", async () => {
    const root = createTmpRoot();
    const projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    const realFile = join(projectRoot, "real.txt");
    writeFileSync(realFile, "abc", "utf-8");
    const linkFile = join(projectRoot, "link.txt");
    symlinkSync(realFile, linkFile);

    const ctx = createContext(projectRoot);
    await expect(deleteStep(ctx, { file: "link.txt" })).rejects.toThrow(
      "delete.config.file rejected: symlink not allowed"
    );
  });

  test("required missing file throws, optional missing file returns", async () => {
    const root = createTmpRoot();
    const projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    const ctx = createContext(projectRoot);

    await expect(
      deleteStep(ctx, { file: "missing.txt", required: true })
    ).rejects.toThrow("delete.config.file rejected: file not found: missing.txt");

    await expect(
      deleteStep(ctx, { file: "missing.txt", required: false })
    ).resolves.toBeUndefined();
  });

  test("deletes existing directory recursively", async () => {
    const root = createTmpRoot();
    const projectRoot = join(root, "project");
    const nestedDir = join(projectRoot, "dir", "nested");
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(join(nestedDir, "file.txt"), "ok", "utf-8");
    const ctx = createContext(projectRoot);

    await expect(deleteStep(ctx, { file: "dir" })).resolves.toBeUndefined();
    expect(existsSync(join(projectRoot, "dir"))).toBe(false);
  });

  test("deletes existing file", async () => {
    const root = createTmpRoot();
    const projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    const targetFile = join(projectRoot, "remove-me.txt");
    writeFileSync(targetFile, "content", "utf-8");
    const ctx = createContext(projectRoot);

    await expect(deleteStep(ctx, { file: "remove-me.txt" })).resolves.toBeUndefined();
    expect(existsSync(targetFile)).toBe(false);
  });

  test("optional missing directory returns without error", async () => {
    const root = createTmpRoot();
    const projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    const sentinel = join(projectRoot, "sentinel.txt");
    writeFileSync(sentinel, "keep", "utf-8");
    const ctx = createContext(projectRoot);

    await expect(
      deleteStep(ctx, { file: "missing-dir", required: false })
    ).resolves.toBeUndefined();
    expect(readFileSync(sentinel, "utf-8")).toBe("keep");
  });
});
