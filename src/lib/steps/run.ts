import { join } from "node:path";
import type { StepContext, StepExecutor } from "./types";
import { resolveStepConfig } from "./types";
import { callShell, ShellError } from "@/lib/shell";
import { GenerationError } from "@/lib/projectGenerator/GenerationError";

export const run: StepExecutor = async (ctx, config) => {
  const resolved = resolveStepConfig(config, ctx);
  const command = resolved.command;
  const cwdOption = resolved.cwd as string | undefined;

  if (typeof command !== "string") {
    throw new Error("run step requires 'command' string");
  }

  const cwd = cwdOption
    ? join(ctx.projectDirectory, String(cwdOption))
    : ctx.projectPath;

  try {
    await callShell(command, {
      cwd,
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
