import { callShell } from "./shell";
import { DEPENDENCY_CATALOG } from "./dependencyCatalog";
import type { DependencyRef } from "./config/projectBuilder";

/** Check if a command exists by running it with optional args (exit code 0 = exists) */
export async function isCommandInstalled(
  cmd: string,
  args: string[] = ["version"]
): Promise<boolean> {
  try {
    const { exitCode } = await callShell(cmd, args, {
      stdin: "ignore",
      quiet: true,
      throwOnNonZero: false,
    });
    return exitCode === 0;
  } catch {
    return false;
  }
}

const DEFAULT_DEPENDENCY_IDS = ["symfony-cli", "node", "npm", "yarn", "pnpm", "bun"];

type DependencyStatus = {
  id: string;
  name: string;
  installed: boolean;
  instructions: readonly string[];
};

function matchesWhen(
  when: Record<string, string> | undefined,
  answers: Record<string, string>
): boolean {
  if (!when) return true;
  return Object.entries(when).every(([key, value]) => answers[key] === value);
}

export const getDependencyStatus = async () => {
  const dependencies = DEFAULT_DEPENDENCY_IDS
    .map((id) => DEPENDENCY_CATALOG[id])
    .filter(Boolean);
  return Promise.all(
    dependencies.map(async ({ name, command, checkArgs, instructions }) => ({
      name,
      installed: await isCommandInstalled(command, [...checkArgs]),
      instructions,
    }))
  );
};

export const getProjectDependencyStatus = async (
  deps: DependencyRef[],
  answers: Record<string, string>
): Promise<DependencyStatus[]> => {
  const applicable = deps.filter((dep) => matchesWhen(dep.when, answers));
  return Promise.all(
    applicable.map(async ({ id }) => {
      const catalog = DEPENDENCY_CATALOG[id];
      if (!catalog) {
        return {
          id,
          name: id,
          installed: false,
          instructions: [`Dependency '${id}' is not defined in dependencyCatalog.`],
        };
      }
      return {
        id: catalog.id,
        name: catalog.name,
        installed: await isCommandInstalled(catalog.command, [...catalog.checkArgs]),
        instructions: catalog.instructions,
      };
    })
  );
};
