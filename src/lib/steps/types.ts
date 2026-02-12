import type { ProjectBuilderAnswers } from "@/lib/generators/types";

export type Profile = {
  name: string;
  email: string;
};

export type StepContext = {
  projectDirectory: string;
  projectPath: string;
  projectName: string;
  answers: ProjectBuilderAnswers;
  profile: Profile;
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
  /** When true (copy step), interpolate file contents with variables. Default false. */
  interpolate?: boolean;
};

function getNested(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Resolves {{key}} and %key% placeholders in strings.
 * Keys can be dotted (e.g. profile.name, profile.email).
 * Uses answers and profile for lookup.
 */
export function resolveVariables(
  value: unknown,
  answers: ProjectBuilderAnswers,
  profile?: Profile
): unknown {
  const vars: Record<string, unknown> = { ...answers };
  if (profile) {
    vars.profile = { name: profile.name, email: profile.email };
  }

  const resolve = (key: string): string => {
    const val = key.includes(".") ? getNested(vars, key) : vars[key];
    return val != null ? String(val) : "";
  };

  if (typeof value === "string") {
    return value
      .replace(/\{\{([\w.]+)\}\}/g, (_, key) => resolve(key))
      .replace(/%([\w.]+)%/g, (_, key) => resolve(key));
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveVariables(v, answers, profile));
  }
  if (value !== null && typeof value === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveVariables(v, answers, profile);
    }
    return resolved;
  }
  return value;
}
