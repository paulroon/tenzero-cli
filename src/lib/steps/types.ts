import type { ProjectBuilderAnswers } from "@/lib/generators/types";

export type StepContext = {
  projectDirectory: string;
  projectPath: string;
  projectName: string;
  answers: ProjectBuilderAnswers;
  /** Directory of the config file (for resolving relative paths in copyFiles, etc.) */
  configDir?: string;
};

export type StepExecutor = (
  ctx: StepContext,
  config: Record<string, unknown>
) => Promise<void>;

export type PipelineStep = {
  type: string;
  config?: Record<string, unknown>;
};

/**
 * Resolves {{key}} and %key% placeholders in strings using answers.
 * Works on strings, arrays of strings, and recursively on objects.
 */
export function resolveVariables(
  value: unknown,
  answers: ProjectBuilderAnswers
): unknown {
  if (typeof value === "string") {
    return value
      .replace(/\{\{(\w+)\}\}/g, (_, key) => answers[key] ?? "")
      .replace(/%(\w+)%/g, (_, key) => answers[key] ?? "");
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveVariables(v, answers));
  }
  if (value !== null && typeof value === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveVariables(v, answers);
    }
    return resolved;
  }
  return value;
}
