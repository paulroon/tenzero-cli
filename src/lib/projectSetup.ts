import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { TZCONFIG_FILENAME } from "./config";
import { saveProjectConfig } from "./projectConfig";
import type { TzProjectConfig } from "./projectConfig";
import type { ProjectBuilderAnswers } from "@/lib/generators/types";

const INITIAL_COMMIT_MESSAGE = "Initial Tz Project setup";

/**
 * Finalizes a newly generated project: removes .git, updates .gitignore,
 * writes .tzconfig.json, inits git, and makes initial commit.
 */
export async function finalizeTzProjectSetup(
  projectPath: string,
  config: {
    name: string;
    type: TzProjectConfig["type"];
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
    if (!content.includes(TZCONFIG_FILENAME)) {
      const ignoreEntry = `\n###> TenZero ###\n${TZCONFIG_FILENAME}\n###< TenZero ###\n`;
      const entry = content.endsWith("\n")
        ? `${ignoreEntry}\n`
        : `\n${ignoreEntry}\n`;
      writeFileSync(gitignorePath, content + entry, "utf-8");
    }
  } else {
    writeFileSync(gitignorePath, `${TZCONFIG_FILENAME}\n`, "utf-8");
  }

  saveProjectConfig(projectPath, config);

  await runGit(projectPath, ["init"]);
  await runGit(projectPath, ["add", "."]);
  await runGit(projectPath, ["commit", "-m", INITIAL_COMMIT_MESSAGE]);
}

async function runGit(cwd: string, args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} exited with code ${exitCode}`);
  }
}
