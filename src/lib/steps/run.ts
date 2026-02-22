import type { StepContext, StepExecutor } from "./types";
import { resolveStepConfig } from "./types";
import { callShell, ShellError } from "@/lib/shell";
import { GenerationError } from "@/lib/projectGenerator/GenerationError";
import { detectBlockedShellSyntax } from "@/lib/runSafety";

export const run: StepExecutor = async (ctx, config) => {
  const resolved = resolveStepConfig(config, ctx);
  const command = resolved.command;

  if (typeof command !== "string") {
    throw new Error("run step requires 'command' string");
  }
  const blockedReason = detectBlockedShellSyntax(command);
  if (blockedReason && ctx.allowShellSyntaxCommands !== true) {
    throw new Error(
      `run.config.command rejected: ${blockedReason}. Confirm shell-syntax execution in the UI, or set config.allowShellSyntax=true to always allow.`
    );
  }

  try {
    await callShell(command, {
      cwd: ctx.projectPath,
      stdin: "inherit",
      collect: true,
      throwOnNonZero: true,
    });
  } catch (err) {
    if (err instanceof ShellError) {
      throw new GenerationError(
        `Command exited with code ${err.exitCode}: ${command}`,
        err.stdout,
        err.stderr
      );
    }
    throw err;
  }
};
