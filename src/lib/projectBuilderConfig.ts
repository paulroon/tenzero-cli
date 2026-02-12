import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseJsonFile } from "./json";

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
  steps: BuilderStep[];
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "..", "..", "config", "project-builder.json");

export function loadProjectBuilderConfig(): ProjectBuilderConfig | null {
  const parsed = parseJsonFile<{ steps?: unknown[] }>(CONFIG_PATH);
  if (!parsed || !Array.isArray(parsed.steps)) return null;

  const steps = parsed.steps.filter(
    (s): s is BuilderStep =>
      s !== null &&
      typeof s === "object" &&
      typeof (s as BuilderStep).id === "string" &&
      typeof (s as BuilderStep).prompt === "string" &&
      ((s as BuilderStep).type === "text" || (s as BuilderStep).type === "select")
  );

  return { steps };
}

export function getApplicableSteps(
  config: ProjectBuilderConfig,
  answers: Record<string, string>
): BuilderStep[] {
  return config.steps.filter((step) => {
    if ("when" in step && step.when) {
      return Object.entries(step.when).every(
        ([key, value]) => answers[key] === value
      );
    }
    return true;
  });
}
