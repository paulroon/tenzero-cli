import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { callShell } from "./shell";
import { TZ_PROJECT_CONFIG_FILENAME } from "./paths";
import {
  saveProjectConfig,
  type ProjectOpenWith,
  type ProjectType,
} from "./config/project";
import type { ProjectBuilderAnswers } from "./steps/types";

const INITIAL_COMMIT_MESSAGE = "Initial Tz Project setup";

function isDockerizedValue(value: unknown): boolean {
  return value === "yes" || value === "true";
}

function resolveOpenWith(config: {
  type: ProjectType;
  builderAnswers?: ProjectBuilderAnswers;
}): ProjectOpenWith | undefined {
  if (config.type !== "nextjs") return undefined;

  const dockerized = isDockerizedValue(config.builderAnswers?.dockerize);
  return {
    type: "browser",
    url: dockerized ? "http://localhost:9000" : "http://localhost:3000",
  };
}

/**
 * Finalizes a newly generated project: removes .git, updates .gitignore,
 * writes .tzconfig.json, inits git, and makes initial commit.
 */
export async function finalizeTzProjectSetup(
  projectPath: string,
  config: {
    name: string;
    type: ProjectType;
    builderAnswers?: ProjectBuilderAnswers;
  }
): Promise<void> {
  const gitDir = join(projectPath, ".git");
  if (existsSync(gitDir)) {
    rmSync(gitDir, { recursive: true });
  }

  const gitignorePath = join(projectPath, ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    if (!content.includes(TZ_PROJECT_CONFIG_FILENAME)) {
      const ignoreEntry = `\n###> TenZero ###\n${TZ_PROJECT_CONFIG_FILENAME}\n###< TenZero ###\n`;
      const entry = content.endsWith("\n")
        ? `${ignoreEntry}\n`
        : `\n${ignoreEntry}\n`;
      writeFileSync(gitignorePath, content + entry, "utf-8");
    }
  } else {
    writeFileSync(gitignorePath, `${TZ_PROJECT_CONFIG_FILENAME}\n`, "utf-8");
  }

  saveProjectConfig(projectPath, {
    ...config,
    openWith: resolveOpenWith(config),
  });

  await runGit(projectPath, ["init"]);
  await runGit(projectPath, ["add", "."]);
  await runGit(projectPath, ["commit", "-m", INITIAL_COMMIT_MESSAGE]);
}

async function runGit(cwd: string, args: string[]): Promise<void> {
  await callShell("git", args, {
    cwd,
    stdin: "inherit",
    throwOnNonZero: true,
  });
}
