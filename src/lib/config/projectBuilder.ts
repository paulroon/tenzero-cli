import { basename, dirname, extname, join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import {
  getProjectsConfigDirs,
  PROJECT_BUILDER_CONFIG_FILENAMES,
} from "@/lib/paths";
import type { PipelineStep } from "@/lib/steps/types";
import { ensureProjectType, type ProjectType } from "./project";
import { parseConfigFile, parseConfigFileResult } from "./parseConfigFile";

type WhenClause = Record<string, string>;

type BuilderStepBase = {
  id: string;
  prompt: string;
  when?: WhenClause;
  defaultValue?: string;
};

export type BuilderTextStep = BuilderStepBase & {
  type: "text";
  validate?: string;
};

export type BuilderSelectStep = BuilderStepBase & {
  type: "select";
  options: Array<{ label: string; value: string }>;
};

export type BuilderBooleanStep = BuilderStepBase & {
  type: "boolean";
  trueLabel?: string;
  falseLabel?: string;
};

export type BuilderStep = BuilderTextStep | BuilderSelectStep | BuilderBooleanStep;

export type QuestionGroup = {
  id: string;
  label: string;
  type: "boolean-checklist";
  questionIds: string[];
  when?: WhenClause;
};

export type DependencyRef = {
  id: string;
  when?: WhenClause;
};

export type SecretRef = {
  id: string;
  when?: WhenClause;
};

export type BuilderQuestionNode =
  | { kind: "step"; step: BuilderStep }
  | { kind: "boolean-group"; id: string; label: string; steps: BuilderBooleanStep[] };

export type ProjectBuilderConfig = {
  id: string;
  label: string;
  type: ProjectType;
  version?: string;
  steps: BuilderStep[];
  questionGroups: QuestionGroup[];
  dependencies: DependencyRef[];
  secretDependencies: SecretRef[];
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
      when?: WhenClause;
      default?: string;
    };

type QuestionDef = {
  id: string;
  label: string;
  type: "string" | "text" | "select" | "boolean";
  default?: string | boolean;
  options?: Array<{ label: string; value: string } | string>;
  choices?: Array<{ label: string; value: string } | string>;
  when?: WhenClause;
  required?: boolean;
  trueLabel?: string;
  falseLabel?: string;
};

type ParsedProjectBuilderConfig = {
  label?: string;
  type?: string;
  version?: string;
  questions?: QuestionDef[];
  options?: Record<string, unknown>;
  ui?: { groups?: unknown[] };
  dependencies?: unknown[];
  secretDependencies?: unknown[];
  pipeline?: unknown[];
};

export type LoadProjectBuilderConfigResult = {
  config: ProjectBuilderConfig | null;
  error?: string;
};

function isSupportedConfigFile(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return ext === ".json" || ext === ".yaml" || ext === ".yml";
}

function resolveConfigPathInDir(baseDir: string, id: string): string | null {
  for (const name of PROJECT_BUILDER_CONFIG_FILENAMES) {
    const candidate = join(baseDir, id, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function listProjectConfigs(): ProjectConfigMeta[] {
  const results: ProjectConfigMeta[] = [];
  for (const baseDir of getProjectsConfigDirs()) {
    if (!existsSync(baseDir)) continue;
    const entries = readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const configPath = resolveConfigPathInDir(baseDir, entry.name);
      if (!configPath) continue;
      const parsed = parseConfigFile<{ label?: string }>(configPath);
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
        defaultValue: typeof def.default === "string" ? def.default : undefined,
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
        defaultValue: typeof def.default === "string" ? def.default : undefined,
      };
      if (def.when && typeof def.when === "object") {
        step.when = def.when as WhenClause;
      }
      steps.push(step);
    }
  }
  return steps;
}

function parseSelectOptions(
  values: Array<{ label: string; value: string } | string>
): Array<{ label: string; value: string }> {
  const options: Array<{ label: string; value: string }> = [];
  for (const option of values) {
    if (typeof option === "string") {
      options.push({ label: option, value: option });
      continue;
    }
    if (
      option &&
      typeof option === "object" &&
      typeof option.label === "string" &&
      typeof option.value === "string"
    ) {
      options.push({ label: option.label, value: option.value });
    }
  }
  return options;
}

function questionsToSteps(questions: QuestionDef[]): BuilderStep[] {
  const steps: BuilderStep[] = [];
  for (const q of questions) {
    if (!q || typeof q !== "object" || typeof q.id !== "string") continue;
    if (typeof q.label !== "string") continue;

    const when =
      q.when && typeof q.when === "object" ? (q.when as WhenClause) : undefined;

    if (q.type === "string" || q.type === "text") {
      steps.push({
        id: q.id,
        prompt: q.label,
        type: "text",
        validate: q.required === true || q.id === "projectName" ? "required" : undefined,
        when,
        defaultValue: typeof q.default === "string" ? q.default : undefined,
      });
      continue;
    }

    if (q.type === "boolean") {
      let defaultValue: string | undefined;
      if (typeof q.default === "boolean") {
        defaultValue = q.default ? "true" : "false";
      } else if (typeof q.default === "string") {
        defaultValue = q.default;
      }
      steps.push({
        id: q.id,
        prompt: q.label,
        type: "boolean",
        when,
        trueLabel: typeof q.trueLabel === "string" ? q.trueLabel : undefined,
        falseLabel: typeof q.falseLabel === "string" ? q.falseLabel : undefined,
        defaultValue,
      });
      continue;
    }

    if (q.type === "select") {
      const rawOptions = Array.isArray(q.options)
        ? q.options
        : Array.isArray(q.choices)
          ? q.choices
          : [];
      const options = parseSelectOptions(rawOptions);
      if (options.length === 0) continue;
      steps.push({
        id: q.id,
        prompt: q.label,
        type: "select",
        options,
        when,
        defaultValue: typeof q.default === "string" ? q.default : undefined,
      });
    }
  }
  return steps;
}

function parseQuestionGroups(raw: unknown): QuestionGroup[] {
  if (!raw || typeof raw !== "object") return [];
  const groups = (raw as { groups?: unknown }).groups;
  if (!Array.isArray(groups)) return [];

  const parsed: QuestionGroup[] = [];
  for (const group of groups) {
    if (!group || typeof group !== "object") continue;
    const g = group as {
      id?: unknown;
      label?: unknown;
      type?: unknown;
      questionIds?: unknown;
      questions?: unknown;
      when?: unknown;
    };
    if (typeof g.id !== "string" || typeof g.label !== "string") continue;
    const rawIds = Array.isArray(g.questionIds)
      ? g.questionIds
      : Array.isArray(g.questions)
        ? g.questions
        : [];
    const questionIds = rawIds.filter((v): v is string => typeof v === "string");
    if (questionIds.length === 0) continue;
    const type =
      typeof g.type === "string" && g.type === "boolean-checklist"
        ? "boolean-checklist"
        : "boolean-checklist";
    parsed.push({
      id: g.id,
      label: g.label,
      type,
      questionIds,
      when:
        g.when && typeof g.when === "object" ? (g.when as WhenClause) : undefined,
    });
  }

  return parsed;
}

function parseDependencies(raw: unknown): DependencyRef[] {
  if (!Array.isArray(raw)) return [];
  const deps: DependencyRef[] = [];
  for (const dep of raw) {
    if (typeof dep === "string") {
      deps.push({ id: dep });
      continue;
    }
    if (!dep || typeof dep !== "object") continue;
    const candidate = dep as { id?: unknown; when?: unknown };
    if (typeof candidate.id !== "string") continue;
    deps.push({
      id: candidate.id,
      when:
        candidate.when && typeof candidate.when === "object"
          ? (candidate.when as WhenClause)
          : undefined,
    });
  }
  return deps;
}

function parseSecretDependencies(raw: unknown): SecretRef[] {
  if (!Array.isArray(raw)) return [];
  const deps: SecretRef[] = [];
  for (const dep of raw) {
    if (typeof dep === "string") {
      deps.push({ id: dep });
      continue;
    }
    if (!dep || typeof dep !== "object") continue;
    const candidate = dep as { id?: unknown; when?: unknown };
    if (typeof candidate.id !== "string") continue;
    deps.push({
      id: candidate.id,
      when:
        candidate.when && typeof candidate.when === "object"
          ? (candidate.when as WhenClause)
          : undefined,
    });
  }
  return deps;
}

export function loadProjectBuilderConfig(
  idOrPath?: string
): ProjectBuilderConfig | null {
  return loadProjectBuilderConfigWithError(idOrPath).config;
}

export function loadProjectBuilderConfigWithError(
  idOrPath?: string
): LoadProjectBuilderConfigResult {
  let configPath: string | null = null;
  if (idOrPath) {
    if (existsSync(idOrPath) && isSupportedConfigFile(idOrPath)) {
      configPath = idOrPath;
    } else {
      const dirs = getProjectsConfigDirs();
      for (const base of dirs) {
        const candidate = resolveConfigPathInDir(base, idOrPath);
        if (candidate) {
          configPath = candidate;
          break;
        }
      }
    }
  } else {
    const configs = listProjectConfigs();
    if (configs.length === 0) {
      return { config: null, error: "No project config files found." };
    }
    configPath = configs[0].path;
  }
  if (!configPath) {
    return {
      config: null,
      error: idOrPath
        ? `Project config '${idOrPath}' not found or unsupported extension.`
        : "Project config path could not be resolved.",
    };
  }

  const configDir = dirname(configPath);
  const parsedResult = parseConfigFileResult<ParsedProjectBuilderConfig>(configPath);
  const parsed = parsedResult.data;
  if (!parsed) {
    return {
      config: null,
      error: parsedResult.error ?? `Failed to parse config: ${configPath}`,
    };
  }

  const schemaError = validateParsedProjectBuilderConfig(parsed, configPath);
  if (schemaError) {
    return { config: null, error: schemaError };
  }

  const steps =
    Array.isArray(parsed.questions) && parsed.questions.length > 0
      ? questionsToSteps(parsed.questions)
      : optionsToSteps(
          parsed.options && typeof parsed.options === "object"
            ? (parsed.options as Record<string, OptionDef>)
            : {}
        );
  const questionGroups = parseQuestionGroups(parsed.ui);
  const dependencies = parseDependencies(parsed.dependencies);
  const secretDependencies = parseSecretDependencies(parsed.secretDependencies);
  const pipeline = parsePipeline(parsed.pipeline);

  const id = basename(dirname(configPath));

  return {
    config: {
      id,
      label: typeof parsed.label === "string" ? parsed.label : id,
      type: ensureProjectType(parsed.type),
      version: typeof parsed.version === "string" ? parsed.version : undefined,
      steps,
      questionGroups,
      dependencies,
      secretDependencies,
      pipeline,
      defaultAnswers: getDefaultAnswers(steps),
      _configDir: configDir,
    },
  };
}

function validateParsedProjectBuilderConfig(
  parsed: ParsedProjectBuilderConfig,
  configPath: string
): string | null {
  if (!parsed || typeof parsed !== "object") {
    return `Invalid config '${configPath}': top-level value must be an object.`;
  }
  if (typeof parsed.type !== "string" || parsed.type.trim().length === 0) {
    return `Invalid config '${configPath}': missing required field 'type' (string).`;
  }
  if (!Array.isArray(parsed.pipeline)) {
    return `Invalid config '${configPath}': missing required field 'pipeline' (array).`;
  }
  for (let i = 0; i < parsed.pipeline.length; i++) {
    const step = parsed.pipeline[i];
    if (!step || typeof step !== "object") {
      return `Invalid config '${configPath}': pipeline[${i}] must be an object.`;
    }
    if (typeof (step as { type?: unknown }).type !== "string") {
      return `Invalid config '${configPath}': pipeline[${i}].type must be a string.`;
    }
  }
  if (typeof parsed.questions !== "undefined") {
    if (!Array.isArray(parsed.questions)) {
      return `Invalid config '${configPath}': questions must be an array when provided.`;
    }
    for (let i = 0; i < parsed.questions.length; i++) {
      const q = parsed.questions[i];
      if (!q || typeof q !== "object") {
        return `Invalid config '${configPath}': questions[${i}] must be an object.`;
      }
      if (typeof q.id !== "string" || q.id.trim().length === 0) {
        return `Invalid config '${configPath}': questions[${i}].id must be a non-empty string.`;
      }
      if (typeof q.label !== "string" || q.label.trim().length === 0) {
        return `Invalid config '${configPath}': questions[${i}].label must be a non-empty string.`;
      }
      if (!["string", "text", "select", "boolean"].includes(q.type)) {
        return `Invalid config '${configPath}': questions[${i}].type must be one of string|text|select|boolean.`;
      }
    }
  }
  return null;
}

function getDefaultAnswers(steps: BuilderStep[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const step of steps) {
    if (typeof step.defaultValue === "string") {
      answers[step.id] = step.defaultValue;
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

export function getApplicableQuestionNodes(
  config: ProjectBuilderConfig,
  answers: Record<string, string>
): BuilderQuestionNode[] {
  const steps = getApplicableSteps(config, answers);
  const groups = config.questionGroups ?? [];
  if (groups.length === 0) {
    return steps.map((step) => ({ kind: "step", step }));
  }

  const stepIndexById = new Map<string, number>();
  steps.forEach((step, index) => stepIndexById.set(step.id, index));

  const usedStepIds = new Set<string>();
  const groupsByStartIndex = new Map<number, Array<BuilderQuestionNode>>();

  for (const group of groups) {
    if (group.when && !matchesWhen(group.when, answers)) continue;
    const booleanSteps: BuilderBooleanStep[] = [];
    let minIndex = Number.POSITIVE_INFINITY;
    for (const id of group.questionIds) {
      const index = stepIndexById.get(id);
      if (index == null) continue;
      const step = steps[index];
      if (step.type !== "boolean") continue;
      if (usedStepIds.has(step.id)) continue;
      booleanSteps.push(step);
      if (index < minIndex) minIndex = index;
    }
    if (booleanSteps.length < 2 || !Number.isFinite(minIndex)) continue;
    for (const step of booleanSteps) usedStepIds.add(step.id);
    const entries = groupsByStartIndex.get(minIndex) ?? [];
    entries.push({
      kind: "boolean-group",
      id: group.id,
      label: group.label,
      steps: booleanSteps,
    });
    groupsByStartIndex.set(minIndex, entries);
  }

  const nodes: BuilderQuestionNode[] = [];
  for (let i = 0; i < steps.length; i++) {
    const groupNodes = groupsByStartIndex.get(i);
    if (groupNodes) nodes.push(...groupNodes);
    const step = steps[i];
    if (!usedStepIds.has(step.id)) {
      nodes.push({ kind: "step", step });
    }
  }
  return nodes;
}
