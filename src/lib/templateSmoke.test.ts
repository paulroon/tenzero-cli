import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadProjectBuilderConfig, getApplicablePipelineSteps } from "@/lib/config/projectBuilder";
import type { PipelineStep, StepContext } from "@/lib/steps/types";
import { append } from "@/lib/steps/append";
import { copy } from "@/lib/steps/copy";
import { createProjectDirectory } from "@/lib/steps/createProjectDirectory";
import { deleteStep } from "@/lib/steps/delete";
import { modify } from "@/lib/steps/modify";
import { resolveStepConfig } from "@/lib/steps/types";

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "tz-template-smoke-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (!root) continue;
    rmSync(root, { recursive: true, force: true });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..");
const templateRepoRoot =
  process.env.TZ_TEMPLATE_REPO_PATH?.trim() || join(repoRoot, "tz-project-config");

function listTemplateConfigPaths(): string[] {
  return readdirSync(templateRepoRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => join(templateRepoRoot, entry.name, "config.yaml"))
    .filter((path) => existsSync(path))
    .sort((a, b) => a.localeCompare(b));
}

function makeDefaultAnswers(configId: string, defaults: Record<string, string>): Record<string, string> {
  return {
    ...defaults,
    projectName: `${configId}-smoke`,
  };
}

function ensureModifyTargetExists(ctx: StepContext, step: PipelineStep): void {
  const resolved = resolveStepConfig(step.config ?? {}, ctx);
  const file = resolved.file;
  if (typeof file !== "string") return;
  const filePath = join(ctx.projectPath, file);
  if (existsSync(filePath)) return;

  mkdirSync(dirname(filePath), { recursive: true });
  let seed = "";
  const replacements = resolved.replacements;
  if (Array.isArray(replacements)) {
    for (const candidate of replacements) {
      if (!candidate || typeof candidate !== "object") continue;
      const search = (candidate as { search?: unknown }).search;
      if (typeof search === "string" && search.length > 0) {
        seed += `${search}\n`;
      }
    }
  }
  writeFileSync(filePath, seed, "utf-8");
}

async function executeSmokePipeline(ctx: StepContext, steps: PipelineStep[]): Promise<void> {
  for (const step of steps) {
    if (step.type === "run" || step.type === "waitForHttp" || step.type === "finalize") {
      // External/dependency-heavy steps are intentionally skipped in smoke tests.
      continue;
    }
    if (step.type === "createProjectDirectory") {
      await createProjectDirectory(ctx, step.config ?? {});
      continue;
    }
    if (step.type === "copy") {
      await copy(ctx, step.config ?? {});
      continue;
    }
    if (step.type === "modify") {
      ensureModifyTargetExists(ctx, step);
      await modify(ctx, step.config ?? {});
      continue;
    }
    if (step.type === "append") {
      await append(ctx, step.config ?? {});
      continue;
    }
    if (step.type === "delete") {
      await deleteStep(ctx, step.config ?? {});
      continue;
    }
    throw new Error(`Unknown or unhandled step type in smoke test: ${step.type}`);
  }
}

function assertKeyOutputsExist(ctx: StepContext, steps: PipelineStep[]): void {
  expect(existsSync(ctx.projectPath)).toBe(true);
  expect(statSync(ctx.projectPath).isDirectory()).toBe(true);

  const copySteps = steps.filter((step) => step.type === "copy");
  if (copySteps.length === 0) return;

  const firstCopy = copySteps[0];
  const resolved = resolveStepConfig(firstCopy.config ?? {}, ctx);
  const dest = resolved.dest;
  if (typeof dest !== "string") return;
  const keyPath = join(ctx.projectPath, dest);
  expect(existsSync(keyPath)).toBe(true);
}

describe("template end-to-end smoke", () => {
  const templateRepoAvailable = existsSync(templateRepoRoot);
  const templatePaths = templateRepoAvailable ? listTemplateConfigPaths() : [];

  test("generate each template with defaults (happy path smoke)", async () => {
    if (!templateRepoAvailable) {
      // Standalone tz-cli CI does not always include tz-project-config checkout.
      return;
    }
    for (const configPath of templatePaths) {
      const loaded = loadProjectBuilderConfig(configPath);
      expect(loaded).not.toBeNull();
      if (!loaded) continue;

      const projectRoot = createTempRoot();
      const answers = makeDefaultAnswers(loaded.id, loaded.defaultAnswers);
      const ctx: StepContext = {
        projectDirectory: projectRoot,
        projectPath: join(projectRoot, answers.projectName),
        projectName: answers.projectName,
        answers,
        profile: { name: "Smoke Test", email: "smoke@example.com" },
        configDir: loaded._configDir,
        allowShellSyntaxCommands: true,
      };

      const steps = getApplicablePipelineSteps(loaded.pipeline, answers);
      await executeSmokePipeline(ctx, steps);
      assertKeyOutputsExist(ctx, steps);
    }
  });
});
