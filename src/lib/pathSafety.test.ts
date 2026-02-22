import { afterEach, describe, expect, test } from "bun:test";
import {
  assertNoSymlinkAtPath,
  assertNoSymlinkInExistingPath,
  assertNoSymlinksRecursive,
  resolveConfinedPath,
} from "@/lib/pathSafety";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tmpRoots: string[] = [];

function createTmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-path-safety-"));
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

describe("resolveConfinedPath", () => {
  test("accepts normal relative paths inside base", () => {
    const root = createTmpRoot();
    const resolved = resolveConfinedPath({
      step: "copy",
      field: "dest",
      baseDir: root,
      userPath: "src/index.ts",
    });
    expect(resolved).toBe(join(root, "src/index.ts"));
  });

  test("rejects absolute paths", () => {
    const root = createTmpRoot();
    expect(() =>
      resolveConfinedPath({
        step: "copy",
        field: "dest",
        baseDir: root,
        userPath: "/etc/passwd",
      })
    ).toThrow("copy.config.dest rejected: absolute path not allowed");
  });

  test("rejects traversal paths", () => {
    const root = createTmpRoot();
    expect(() =>
      resolveConfinedPath({
        step: "modify",
        field: "file",
        baseDir: root,
        userPath: "../outside.txt",
      })
    ).toThrow("modify.config.file rejected: path escapes allowed root");
  });
});

describe("symlink guards", () => {
  test("assertNoSymlinkAtPath rejects direct symlink", () => {
    const root = createTmpRoot();
    const target = join(root, "target.txt");
    writeFileSync(target, "ok", "utf-8");
    const link = join(root, "link.txt");
    symlinkSync(target, link);

    expect(() =>
      assertNoSymlinkAtPath({
        step: "modify",
        field: "file",
        path: link,
      })
    ).toThrow("modify.config.file rejected: symlink not allowed");
  });

  test("assertNoSymlinkInExistingPath rejects symlink path components", () => {
    const root = createTmpRoot();
    const realDir = join(root, "real");
    mkdirSync(realDir, { recursive: true });
    const linkDir = join(root, "linked");
    symlinkSync(realDir, linkDir);

    expect(() =>
      assertNoSymlinkInExistingPath({
        step: "copy",
        field: "dest",
        baseDir: root,
        targetPath: join(linkDir, "file.txt"),
      })
    ).toThrow("copy.config.dest rejected: symlink not allowed");
  });

  test("assertNoSymlinksRecursive rejects nested source symlink", () => {
    const root = createTmpRoot();
    const source = join(root, "source");
    const nested = join(source, "nested");
    mkdirSync(nested, { recursive: true });
    const realFile = join(root, "real.txt");
    writeFileSync(realFile, "ok", "utf-8");
    symlinkSync(realFile, join(nested, "linked.txt"));

    expect(() =>
      assertNoSymlinksRecursive({
        step: "copy",
        field: "source",
        rootPath: source,
      })
    ).toThrow("copy.config.source rejected: symlink not allowed");
  });

  test("assertNoSymlinksRecursive passes for normal tree", () => {
    const root = createTmpRoot();
    const source = join(root, "source");
    mkdirSync(join(source, "nested"), { recursive: true });
    writeFileSync(join(source, "nested", "file.txt"), "ok", "utf-8");

    expect(() =>
      assertNoSymlinksRecursive({
        step: "copy",
        field: "source",
        rootPath: source,
      })
    ).not.toThrow();
  });
});
