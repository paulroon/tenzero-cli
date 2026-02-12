import type { PipelineStep, StepContext } from "@/lib/steps/types";
import { resolveVariables } from "@/lib/steps/types";

/**
 * Produces a short human-readable label for a pipeline step.
 */
export function getStepLabel(
  step: PipelineStep,
  ctx: StepContext
): string {
  const config = step.config ?? {};
  const resolved = resolveVariables(config, ctx.answers, ctx.profile) as Record<
    string,
    unknown
  >;

  switch (step.type) {
    case "run": {
      const cmd = (resolved.command ?? config.command ?? "") as string;
      return truncate(cmd, 60);
    }
    case "copy": {
      const src = (resolved.source ?? config.source ?? "?") as string;
      const dest = (resolved.dest ?? config.dest ?? "?") as string;
      return `Copy ${src} → ${dest}`;
    }
    case "modify": {
      const file = (resolved.file ?? config.file ?? "?") as string;
      return config.appendIfMissing ? `Append to ${file}` : `Modify ${file}`;
    }
    case "append": {
      const file = (resolved.file ?? config.file ?? "?") as string;
      return `Append to ${file}`;
    }
    case "delete": {
      const file = (resolved.file ?? config.file ?? "?") as string;
      return `Delete ${file}`;
    }
    case "finalize":
      return "Finalize (git init, .tzconfig)";
    default:
      return step.type;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}
