import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type DeployWorkspaceReadiness = {
  ready: boolean;
  tfFiles: string[];
  searchedPaths: string[];
};

const DEFAULT_SEARCH_DIRS = [".", ".tz/deploy"] as const;

function collectTfFilesInDir(dirPath: string, maxDepth: number): string[] {
  if (!existsSync(dirPath)) return [];
  const results: string[] = [];

  function walk(currentPath: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const nextPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(nextPath, depth + 1);
        continue;
      }
      if (entry.isFile() && (entry.name.endsWith(".tf") || entry.name.endsWith(".tf.json"))) {
        results.push(nextPath);
      }
    }
  }

  walk(dirPath, 0);
  return results;
}

export function evaluateDeployWorkspaceReadiness(projectPath: string): DeployWorkspaceReadiness {
  const searchedPaths = DEFAULT_SEARCH_DIRS.map((relative) => join(projectPath, relative));
  const tfFiles = searchedPaths.flatMap((path) => collectTfFilesInDir(path, 4));
  return {
    ready: tfFiles.length > 0,
    tfFiles,
    searchedPaths,
  };
}
