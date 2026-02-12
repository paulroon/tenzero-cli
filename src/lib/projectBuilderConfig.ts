import { basename, dirname, join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseJsonFile } from "./json";
import type { PipelineStep } from "@/lib/steps/types";

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
  type: "symfony" | "nextjs" | "other";
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
      default?: string;
    };

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_CONFIG_DIR = join(__dirname, "..", "..", "config", "projects");
const CONFIG_FILENAME = "config.json";

/**
 * Returns directories to search for project configs, in order.
 * Add ~/.tz/configs/ when supporting user configs.
 */
export function getProjectsConfigDirs(): string[] {
  return [PROJECTS_CONFIG_DIR];
}

/**
 * Lists available project configurations (one per subdirectory with config.json).
 */
export function listProjectConfigs(): ProjectConfigMeta[] {
  const results: ProjectConfigMeta[] = [];
  for (const baseDir of getProjectsConfigDirs()) {
    if (!existsSync(baseDir)) continue;
    const entries = readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const configPath = join(baseDir, entry.name, CONFIG_FILENAME);
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
      steps.push({
        id,
        prompt: def.label,
        type: "select",
        options: def.options.filter(
          (o): o is { label: string; value: string } =>
            o != null && typeof o.label === "string" && typeof o.value === "string"
        ),
      });
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
        const candidate = join(base, idOrPath, CONFIG_FILENAME);
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

  const options = parsed.options && typeof parsed.options === "object"
    ? (parsed.options as Record<string, OptionDef>)
    : {};
  const steps = optionsToSteps(options);
  const pipeline = parsePipeline(parsed.pipeline);

  const id = basename(dirname(configPath));

  const defaultAnswers = getDefaultAnswers(options);
  const validTypes = ["symfony", "nextjs", "other"] as const;
  const configType = parsed.type && validTypes.includes(parsed.type as (typeof validTypes)[number])
    ? (parsed.type as (typeof validTypes)[number])
    : "other";

  return {
    id,
    label: typeof parsed.label === "string" ? parsed.label : id,
    type: configType,
    version: typeof parsed.version === "string" ? parsed.version : undefined,
    steps,
    pipeline,
    defaultAnswers,
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

export function getApplicableSteps(
  config: ProjectBuilderConfig,
  _answers: Record<string, string>
): BuilderStep[] {
  return config.steps;
}
