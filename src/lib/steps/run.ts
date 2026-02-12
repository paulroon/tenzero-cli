import { join } from "node:path";
import type { StepContext, StepExecutor } from "./types";
import { resolveVariables } from "./types";

export const run: StepExecutor = async (ctx, config) => {
  const resolved = resolveVariables(config, ctx.answers, ctx.profile) as Record<string, unknown>;
  const command = resolved.command;
  const cwdOption = resolved.cwd as string | undefined;

  if (typeof command !== "string") {
    throw new Error("run step requires 'command' string");
  }

  const cwd = cwdOption
    ? join(ctx.projectDirectory, String(cwdOption))
    : ctx.projectPath;

  const proc = Bun.spawn(["sh", "-c", command], {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command exited with code ${exitCode}: ${command}`);
  }
};
