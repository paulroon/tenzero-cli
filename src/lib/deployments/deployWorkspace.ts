import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { listProjectConfigs, loadDeployTemplateConfigWithError } from "@/lib/config";
import { loadProjectConfig, saveProjectConfig } from "@/lib/config/project";
import { planEnvironmentDeployment } from "@/lib/deployments/capabilityPlanner";

export type PrepareDeployWorkspaceResult = {
  directoryPath: string;
  filePaths: string[];
};

export type PrepareDeployWorkspaceOptions = {
  backendRegion?: string;
};

type InterpolationContext = {
  environmentId: string;
  providerId: string;
  releaseTag?: string;
  releaseImageRef?: string;
  constraints: Record<string, unknown>;
};

function getNested(record: Record<string, unknown>, dottedPath: string): unknown {
  const parts = dottedPath.split(".");
  let current: unknown = record;
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function resolveInterpolationToken(token: string, context: InterpolationContext): unknown {
  if (token === "tz.environment.id") return context.environmentId;
  if (token === "tz.provider.id") return context.providerId;
  if (token === "tz.release.tag") return context.releaseTag ?? "";
  if (token === "tz.release.imageRef") return context.releaseImageRef ?? "";
  if (token.startsWith("tz.constraints.")) {
    const constraintPath = token.slice("tz.constraints.".length);
    if (constraintPath.length === 0) return undefined;
    return getNested(context.constraints, constraintPath);
  }
  return undefined;
}

function interpolateTemplate(
  content: string,
  context: InterpolationContext,
  filePath: string
): string {
  const unknownTokens = new Set<string>();
  const rendered = content.replace(/{{\s*([^{}]+?)\s*}}/g, (match, rawToken) => {
    const token = String(rawToken).trim();
    const value = resolveInterpolationToken(token, context);
    if (typeof value === "undefined") {
      unknownTokens.add(token);
      return match;
    }
    return String(value);
  });
  if (unknownTokens.size > 0) {
    throw new Error(
      `Unknown interpolation token(s) in '${filePath}': ${Array.from(unknownTokens).sort().join(", ")}`
    );
  }
  if (rendered.includes("{{") || rendered.includes("}}")) {
    throw new Error(`Unresolved interpolation token(s) remain in '${filePath}'.`);
  }
  return rendered;
}

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

export function prepareDeployWorkspaceForEnvironment(
  projectPath: string,
  environmentId: string,
  options?: PrepareDeployWorkspaceOptions
): PrepareDeployWorkspaceResult {
  const project = loadProjectConfig(projectPath);
  if (!project) {
    throw new Error(`Project config not found: ${projectPath}`);
  }
  const templateMeta = listProjectConfigs().find((entry) => entry.id === project.type);
  if (!templateMeta) {
    throw new Error(`Template '${project.type}' config not found.`);
  }
  const deployConfigResult = loadDeployTemplateConfigWithError(templateMeta.path);
  if (!deployConfigResult.exists) {
    throw new Error(
      `Template '${project.type}' has no deploy.yaml definition. Add deploy config before deployment.`
    );
  }
  if (!deployConfigResult.config) {
    throw new Error(
      `Template '${project.type}' deploy config is invalid. ${deployConfigResult.error ?? "Fix deploy.yaml and retry."}`
    );
  }

  const deployConfig = deployConfigResult.config;
  const environment = deployConfig.environments.find((entry) => entry.id === environmentId);
  if (!environment) {
    throw new Error(
      `Environment '${environmentId}' is not defined in deploy.yaml for '${project.type}'.`
    );
  }
  const provider = deployConfig.providers.find((entry) => entry.id === environment.provider);
  if (!provider) {
    throw new Error(
      `Provider '${environment.provider}' is not defined in deploy.yaml for '${project.type}'.`
    );
  }

  const templateDir = dirname(templateMeta.path);
  const driverEntryPath = resolve(templateDir, provider.driver.entry);
  if (!existsSync(driverEntryPath) || !statSync(driverEntryPath).isFile()) {
    throw new Error(
      `Provider '${provider.id}' driver entry not found for template '${project.type}': ${provider.driver.entry}`
    );
  }
  const driverRootDir = dirname(driverEntryPath);

  const plan = planEnvironmentDeployment(deployConfig.environments, environmentId);
  const effectiveConstraints: Record<string, unknown> = {
    ...environment.constraints,
  };
  const backendRegion = options?.backendRegion?.trim();
  if (backendRegion) {
    effectiveConstraints.region = backendRegion;
  }
  const releaseSelection = project.releaseState?.environments?.[environmentId];
  const selectedImageRef = releaseSelection?.selectedImageRef;
  const selectedReleaseTag = releaseSelection?.selectedReleaseTag;
  if (typeof selectedImageRef === "string" && selectedImageRef.trim().length > 0) {
    effectiveConstraints.appImageIdentifier = selectedImageRef.trim();
  }
  if (typeof selectedReleaseTag === "string" && selectedReleaseTag.trim().length > 0) {
    effectiveConstraints.appImageTag = selectedReleaseTag.trim();
  }

  const compatiblePresets = deployConfig.presets.filter(
    (preset) =>
      preset.environments.includes(environmentId) &&
      (!preset.provider || preset.provider === environment.provider)
  );
  if (compatiblePresets.length === 0) {
    throw new Error(
      `No compatible deploy preset found for '${environmentId}' in template '${project.type}'.`
    );
  }
  const selectedPresetId = releaseSelection?.selectedDeployPresetId?.trim();
  const selectedPreset =
    (selectedPresetId
      ? compatiblePresets.find((preset) => preset.id === selectedPresetId)
      : undefined) ?? compatiblePresets[0];
  if (!selectedPreset) {
    throw new Error(
      `No deploy preset could be resolved for '${environmentId}' in template '${project.type}'.`
    );
  }
  Object.assign(effectiveConstraints, selectedPreset.constraints);

  const releaseTag =
    typeof selectedReleaseTag === "string" && selectedReleaseTag.trim().length > 0
      ? selectedReleaseTag.trim()
      : undefined;
  const releaseImageRef =
    typeof selectedImageRef === "string" && selectedImageRef.trim().length > 0
      ? selectedImageRef.trim()
      : undefined;

  if (!selectedPresetId || selectedPresetId !== selectedPreset.id) {
    const nowIso = new Date().toISOString();
    saveProjectConfig(projectPath, {
      ...project,
      releaseState: {
        environments: {
          ...(project.releaseState?.environments ?? {}),
          [environmentId]: {
            ...(project.releaseState?.environments?.[environmentId] ?? {}),
            selectedDeployPresetId: selectedPreset.id,
            selectedAt: nowIso,
          },
        },
      },
    });
  }

  const resolvedModules = plan.modules.map((module) => ({
    ...module,
    constraints: effectiveConstraints,
  }));
  const dirPath = join(projectPath, ".tz", "deploy", environmentId);
  rmSync(dirPath, { recursive: true, force: true });
  mkdirSync(dirPath, { recursive: true });

  cpSync(driverRootDir, dirPath, { recursive: true });
  const copiedFiles = listFilesRecursively(dirPath);
  const interpolationContext: InterpolationContext = {
    environmentId,
    providerId: provider.id,
    releaseTag,
    releaseImageRef,
    constraints: effectiveConstraints,
  };
  for (const filePath of copiedFiles) {
    if (!filePath.endsWith(".tf")) continue;
    const source = readFileSync(filePath, "utf-8");
    const rendered = interpolateTemplate(
      source,
      interpolationContext,
      relative(dirPath, filePath) || filePath
    );
    writeFileSync(filePath, rendered, "utf-8");
  }

  const metadataPath = join(dirPath, "tz-deploy-workspace.json");
  writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        providerId: provider.id,
        providerDriverType: provider.driver.type,
        providerDriverEntry: provider.driver.entry,
        environmentId,
        selectedPresetId: selectedPreset.id,
        selectedReleaseTag: releaseTag,
        selectedImageRef: releaseImageRef,
        constraints: effectiveConstraints,
        modules: resolvedModules,
      },
      null,
      2
    ),
    "utf-8"
  );

  return {
    directoryPath: dirPath,
    filePaths: [...copiedFiles, metadataPath],
  };
}
