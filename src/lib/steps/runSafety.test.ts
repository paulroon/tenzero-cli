import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectBlockedShellSyntax } from "@/lib/runSafety";
import { run } from "@/lib/steps/run";
import type { StepContext } from "@/lib/steps/types";

const tmpRoots: string[] = [];

function createTmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-run-safety-"));
  tmpRoots.push(root);
  return root;
}

function createContext(projectRoot: string, allowShellSyntaxCommands?: boolean): StepContext {
  return {
    projectDirectory: projectRoot,
    projectPath: projectRoot,
    projectName: "demo",
    answers: {},
    profile: { name: "Tester", email: "tester@example.com" },
    allowShellSyntaxCommands,
  };
}

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (!root) continue;
    rmSync(root, { recursive: true, force: true });
  }
});

describe("detectBlockedShellSyntax", () => {
  test("identifies blocked operators", () => {
    expect(detectBlockedShellSyntax("echo one | cat")).toBe("pipes '|' are not allowed");
    expect(detectBlockedShellSyntax("echo one && echo two")).toBe(
      "logical AND '&&' is not allowed"
    );
    expect(detectBlockedShellSyntax("echo one || echo two")).toBe(
      "logical OR '||' is not allowed"
    );
    expect(detectBlockedShellSyntax("echo one; echo two")).toBe(
      "command separators ';' are not allowed"
    );
    expect(detectBlockedShellSyntax("echo one > out.txt")).toBe(
      "redirection '<' or '>' is not allowed"
    );
    expect(detectBlockedShellSyntax("echo `whoami`")).toBe(
      "backtick command substitution is not allowed"
    );
    expect(detectBlockedShellSyntax("echo $(whoami)")).toBe(
      "command substitution '$()' is not allowed"
    );
  });

  test("returns null for safe command syntax", () => {
    expect(detectBlockedShellSyntax("echo hello")).toBeNull();
  });
});

describe("run step shell-syntax behavior", () => {
  test("shell-syntax command is rejected when not confirmed", async () => {
    const root = createTmpRoot();
    const ctx = createContext(root, false);
    await expect(
      run(ctx, { command: 'printf "alpha\\nbeta\\n" | head -n 1' })
    ).rejects.toThrow("run.config.command rejected: pipes '|' are not allowed");
  });

  test("confirmed/global-allow shell-syntax path succeeds", async () => {
    const root = createTmpRoot();
    const ctx = createContext(root, true);
    await expect(
      run(ctx, { command: 'printf "alpha\\nbeta\\n" | head -n 1' })
    ).resolves.toBeUndefined();
  });

  test("safe command runs without prompt/confirmation", async () => {
    const root = createTmpRoot();
    const ctx = createContext(root, false);
    await expect(run(ctx, { command: 'printf "safe\\n"' })).resolves.toBeUndefined();
  });
});
