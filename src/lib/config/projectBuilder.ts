import { basename, dirname, join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { parseJsonFile } from "@/lib/json";
import {
  getProjectsConfigDirs,
  PROJECT_BUILDER_CONFIG_FILENAME,
} from "@/lib/paths";
import type { PipelineStep } from "@/lib/steps/types";
import { ensureProjectType, type ProjectType } from "./project";

export type BuilderStep =
  | { id: string; prompt: string; type: "text"; validate?: string }
  | {
      id: string;
      prompt: string;
      type: "select";
      options: Array<{ label: string; value: string }>;
      when?: Record<string, string>;
    };

export type ProjectBuilderConfig = {
  id: string;
  label: string;
  type: ProjectType;
  version?: string;
  steps: BuilderStep[];
  pipeline: PipelineStep[];
  defaultAnswers: Record<string, string>;
  _configDir: string;
};

export type ProjectConfigMeta = {
  id: string;
  label: string;
  path: string;
};

type OptionDef =
  | { label: string; type: "text"; default?: string }
  | {
      label: string;
      type: "select";
      options: Array<{ label: string; value: string }>;
      when?: Record<string, string>;
      default?: string;
    };

export function listProjectConfigs(): ProjectConfigMeta[] {
  const results: ProjectConfigMeta[] = [];
  for (const baseDir of getProjectsConfigDirs()) {
    if (!existsSync(baseDir)) continue;
    const entries = readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const configPath = join(baseDir, entry.name, PROJECT_BUILDER_CONFIG_FILENAME);
      if (!existsSync(configPath)) continue;
      const parsed = parseJsonFile<{ label?: string }>(configPath);
      results.push({
        id: entry.name,
        label: (parsed?.label as string) ?? entry.name,
        path: configPath,
      });
    }
  }
  return results;
}

function parsePipeline(raw: unknown): PipelineStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is PipelineStep =>
      p !== null &&
      typeof p === "object" &&
      typeof (p as PipelineStep).type === "string"
  );
}

function optionsToSteps(options: Record<string, OptionDef>): BuilderStep[] {
  const steps: BuilderStep[] = [];
  for (const [id, def] of Object.entries(options)) {
    if (!def || typeof def !== "object" || typeof def.label !== "string") continue;
    if (def.type === "text") {
      steps.push({
        id,
        prompt: def.label,
        type: "text",
        validate: id === "projectName" ? "required" : undefined,
      });
    } else if (def.type === "select" && Array.isArray(def.options)) {
      const step: BuilderStep = {
        id,
        prompt: def.label,
        type: "select",
        options: def.options.filter(
          (o): o is { label: string; value: string } =>
            o != null && typeof o.label === "string" && typeof o.value === "string"
        ),
      };
      if (def.when && typeof def.when === "object") {
        step.when = def.when as Record<string, string>;
      }
      steps.push(step);
    }
  }
  return steps;
}

export function loadProjectBuilderConfig(
  idOrPath?: string
): ProjectBuilderConfig | null {
  let configPath: string | null = null;
  if (idOrPath) {
    if (existsSync(idOrPath) && idOrPath.endsWith(".json")) {
      configPath = idOrPath;
    } else {
      const dirs = getProjectsConfigDirs();
      for (const base of dirs) {
        const candidate = join(base, idOrPath, PROJECT_BUILDER_CONFIG_FILENAME);
        if (existsSync(candidate)) {
          configPath = candidate;
          break;
        }
      }
    }
  } else {
    const configs = listProjectConfigs();
    if (configs.length === 0) return null;
    configPath = configs[0].path;
  }
  if (!configPath) return null;

  const configDir = dirname(configPath);
  const parsed = parseJsonFile<{
    label?: string;
    type?: string;
    version?: string;
    options?: Record<string, unknown>;
    pipeline?: unknown[];
  }>(configPath);

  if (!parsed) return null;

  const options =
    parsed.options && typeof parsed.options === "object"
      ? (parsed.options as Record<string, OptionDef>)
      : {};
  const steps = optionsToSteps(options);
  const pipeline = parsePipeline(parsed.pipeline);

  const id = basename(dirname(configPath));

  return {
    id,
    label: typeof parsed.label === "string" ? parsed.label : id,
    type: ensureProjectType(parsed.type),
    version: typeof parsed.version === "string" ? parsed.version : undefined,
    steps,
    pipeline,
    defaultAnswers: getDefaultAnswers(options),
    _configDir: configDir,
  };
}

function getDefaultAnswers(
  options: Record<string, OptionDef>
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const [id, def] of Object.entries(options)) {
    if (def && "default" in def && typeof def.default === "string") {
      answers[id] = def.default;
    }
  }
  return answers;
}

function matchesWhen(when: Record<string, string>, answers: Record<string, string>): boolean {
  return Object.entries(when).every(
    ([key, value]) => answers[key] === value
  );
}

export function getApplicableSteps(
  config: ProjectBuilderConfig,
  answers: Record<string, string>
): BuilderStep[] {
  return config.steps.filter((step) => {
    if ("when" in step && step.when) {
      return matchesWhen(step.when, answers);
    }
    return true;
  });
}

export function getApplicablePipelineSteps(
  pipeline: PipelineStep[],
  answers: Record<string, string>
): PipelineStep[] {
  return pipeline.filter((step) => {
    const when = step.when ?? step.config?.when;
    if (when && typeof when === "object") {
      return matchesWhen(when as Record<string, string>, answers);
    }
    return true;
  });
}
