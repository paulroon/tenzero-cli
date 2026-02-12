import { join } from "node:path";
import type { StepContext, StepExecutor } from "./types";
import { resolveStepConfig } from "./types";
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

  const proc = Bun.spawn(["sh", "-c", command], {
    cwd,
    stdin: "inherit",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new GenerationError(
      `Command exited with code ${exitCode}: ${command}`,
      stdout,
      stderr
    );
  }
};
