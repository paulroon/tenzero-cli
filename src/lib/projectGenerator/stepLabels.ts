import type { PipelineStep, StepContext } from "@/lib/steps/types";
import { resolveVariables } from "@/lib/steps/types";

/**
 * Produces a short human-readable label for a pipeline step.
 */
export function getStepLabel(
  step: PipelineStep,
  ctx: StepContext
): string {
  if (typeof step.label === "string" && step.label.trim().length > 0) {
    return step.label;
  }
  const config = step.config ?? {};
  const resolved = resolveVariables(
    config,
    ctx.answers,
    ctx.profile,
    ctx.secrets
  ) as Record<
    string,
    unknown
  >;

  switch (step.type) {
    case "createProjectDirectory":
      return "Create project directory";
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
    case "waitForHttp": {
      const url = (resolved.url ?? config.url ?? "?") as string;
      return `Wait for ${url}`;
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
