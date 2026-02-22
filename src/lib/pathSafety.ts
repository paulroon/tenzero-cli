import { existsSync, lstatSync, readdirSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

type PathField = "source" | "dest" | "file";

function stepFieldError(step: string, field: PathField, reason: string): Error {
  return new Error(`${step}.config.${field} rejected: ${reason}`);
}

export function resolveConfinedPath(opts: {
  step: string;
  field: PathField;
  baseDir: string;
  userPath: string;
}): string {
  const { step, field, baseDir, userPath } = opts;

  if (isAbsolute(userPath)) {
    throw stepFieldError(step, field, `absolute path not allowed: ${userPath}`);
  }

  const base = resolve(baseDir);
  const candidate = resolve(base, userPath);
  const rel = relative(base, candidate);

  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw stepFieldError(step, field, `path escapes allowed root: ${userPath}`);
  }

  return candidate;
}

export function assertNoSymlinkAtPath(opts: {
  step: string;
  field: PathField;
  path: string;
}): void {
  const { step, field, path } = opts;
  if (!existsSync(path)) return;
  if (lstatSync(path).isSymbolicLink()) {
    throw stepFieldError(step, field, `symlink not allowed: ${path}`);
  }
}

export function assertNoSymlinkInExistingPath(opts: {
  step: string;
  field: PathField;
  baseDir: string;
  targetPath: string;
}): void {
  const { step, field, baseDir, targetPath } = opts;
  const base = resolve(baseDir);
  const target = resolve(targetPath);
  const rel = relative(base, target);

  if (!rel) return;
  const parts = rel.split(sep).filter(Boolean);
  let current = base;
  for (const part of parts) {
    current = resolve(current, part);
    if (!existsSync(current)) continue;
    if (lstatSync(current).isSymbolicLink()) {
      throw stepFieldError(step, field, `symlink not allowed: ${current}`);
    }
  }
}

export function assertNoSymlinksRecursive(opts: {
  step: string;
  field: PathField;
  rootPath: string;
}): void {
  const { step, field, rootPath } = opts;
  assertNoSymlinkAtPath({ step, field, path: rootPath });
  if (!existsSync(rootPath)) return;
  if (!lstatSync(rootPath).isDirectory()) return;

  const entries = readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = resolve(rootPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw stepFieldError(step, field, `symlink not allowed: ${nextPath}`);
    }
    if (entry.isDirectory()) {
      assertNoSymlinksRecursive({ step, field, rootPath: nextPath });
    }
  }
}
