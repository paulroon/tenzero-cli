import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { DeployTemplateConfig } from "@/lib/config/deployTemplate";

function listFilesRecursively(directoryPath: string): string[] {
  const entries = readdirSync(directoryPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(entryPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function collectTerraformOutputKeys(tfFilePaths: string[]): Set<string> {
  const outputKeys = new Set<string>();
  const outputRegex = /output\s+"([^"]+)"/g;
  for (const tfPath of tfFilePaths) {
    const source = readFileSync(tfPath, "utf-8");
    for (const match of source.matchAll(outputRegex)) {
      const outputKey = (match[1] ?? "").trim();
      if (outputKey.length > 0) {
        outputKeys.add(outputKey);
      }
    }
  }
  return outputKeys;
}

export function validateDeployTemplateContract(args: {
  templateType: string;
  templateConfigPath: string;
  deployConfig: DeployTemplateConfig;
}): void {
  const templateDir = dirname(args.templateConfigPath);
  for (const provider of args.deployConfig.providers) {
    const driverEntryPath = resolve(templateDir, provider.driver.entry);
    if (!existsSync(driverEntryPath) || !statSync(driverEntryPath).isFile()) {
      throw new Error(
        `Deployment blocked: provider '${provider.id}' driver entry not found for template '${args.templateType}': ${provider.driver.entry}.`
      );
    }
    const driverRootDir = dirname(driverEntryPath);
    const tfFilePaths = listFilesRecursively(driverRootDir).filter((path) =>
      path.endsWith(".tf")
    );
    if (tfFilePaths.length === 0) {
      throw new Error(
        `Deployment blocked: provider '${provider.id}' driver for template '${args.templateType}' must include at least one Terraform file.`
      );
    }
    const providerOutputKeys = collectTerraformOutputKeys(tfFilePaths);
    for (const environment of args.deployConfig.environments) {
      if (environment.provider !== provider.id) continue;
      const missingOutputKeys = environment.outputs
        .filter(
          (output) =>
            typeof output.default === "undefined" && !providerOutputKeys.has(output.key)
        )
        .map((output) => output.key)
        .sort();
      if (missingOutputKeys.length > 0) {
        throw new Error(
          `Deployment blocked: template '${args.templateType}' environment '${environment.id}' expects provider outputs with no default, but driver '${provider.id}' does not define Terraform outputs for: ${missingOutputKeys.join(", ")}.`
        );
      }
    }
  }
}
