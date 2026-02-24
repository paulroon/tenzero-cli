import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseConfigFileResult } from "@/lib/config/parseConfigFile";

const SUPPORTED_DEPLOY_SCHEMA_VERSION = "2";
const ENV_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const ALLOWED_DEPLOY_DRIVER_TYPES = ["opentofu"] as const;
const ALLOWED_CAPABILITIES = ["appRuntime", "postgres", "envConfig", "dns"] as const;
const ALLOWED_OUTPUT_TYPES = [
  "string",
  "number",
  "boolean",
  "json",
  "secret_ref",
] as const;

type DeployDriverType = (typeof ALLOWED_DEPLOY_DRIVER_TYPES)[number];
type DeployCapability = (typeof ALLOWED_CAPABILITIES)[number];
type DeployOutputType = (typeof ALLOWED_OUTPUT_TYPES)[number];

type RawDeployDriver = {
  type?: unknown;
  entry?: unknown;
};

type RawDeployProvider = {
  id?: unknown;
  driver?: unknown;
};

type RawDeployOutput = {
  key?: unknown;
  type?: unknown;
  sensitive?: unknown;
  rotatable?: unknown;
  required?: unknown;
  description?: unknown;
  default?: unknown;
};

type RawDeployEnvironment = {
  id?: unknown;
  label?: unknown;
  provider?: unknown;
  capabilities?: unknown;
  constraints?: unknown;
  outputs?: unknown;
};

type RawDeployPreset = {
  id?: unknown;
  label?: unknown;
  description?: unknown;
  environments?: unknown;
  provider?: unknown;
  constraints?: unknown;
};

type RawDeployTemplateConfig = {
  version?: unknown;
  providers?: unknown;
  environments?: unknown;
  presets?: unknown;
};

export type DeployTemplateProvider = {
  id: string;
  driver: {
    type: DeployDriverType;
    entry: string;
  };
};

export type DeployTemplateOutputSpec = {
  key: string;
  type: DeployOutputType;
  sensitive: boolean;
  rotatable: boolean;
  required: boolean;
  description?: string;
  default?: unknown;
};

export type DeployTemplateEnvironmentSpec = {
  id: string;
  label: string;
  provider: string;
  capabilities: DeployCapability[];
  constraints: Record<string, unknown>;
  outputs: DeployTemplateOutputSpec[];
};

export type DeployTemplatePresetSpec = {
  id: string;
  label: string;
  description: string;
  environments: string[];
  provider?: string;
  constraints: Record<string, unknown>;
};

export type DeployTemplateConfig = {
  version: string;
  providers: DeployTemplateProvider[];
  environments: DeployTemplateEnvironmentSpec[];
  presets: DeployTemplatePresetSpec[];
};

export type LoadDeployTemplateConfigResult = {
  config: DeployTemplateConfig | null;
  error?: string;
  exists: boolean;
  path: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function getDeployTemplateConfigPath(templateConfigPath: string): string {
  return join(dirname(templateConfigPath), "deploy.yaml");
}

function parseProviders(
  providersRaw: unknown,
  path: string
): { providers?: DeployTemplateProvider[]; error?: string } {
  if (!Array.isArray(providersRaw) || providersRaw.length === 0) {
    return {
      error: `Invalid deploy config '${path}': providers must be a non-empty array.`,
    };
  }
  const providers: DeployTemplateProvider[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < providersRaw.length; i++) {
    const item = providersRaw[i];
    if (!isRecord(item)) {
      return {
        error: `Invalid deploy config '${path}': providers[${i}] must be an object.`,
      };
    }
    const candidate = item as RawDeployProvider;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    if (!PROVIDER_ID_PATTERN.test(id)) {
      return {
        error: `Invalid deploy config '${path}': providers[${i}].id must match ${PROVIDER_ID_PATTERN.toString()}.`,
      };
    }
    if (seenIds.has(id)) {
      return {
        error: `Invalid deploy config '${path}': duplicate provider id '${id}'.`,
      };
    }
    seenIds.add(id);
    if (!isRecord(candidate.driver)) {
      return {
        error: `Invalid deploy config '${path}': providers[${i}].driver must be an object.`,
      };
    }
    const driver = candidate.driver as RawDeployDriver;
    const type = typeof driver.type === "string" ? driver.type.trim() : "";
    if (!ALLOWED_DEPLOY_DRIVER_TYPES.includes(type as DeployDriverType)) {
      return {
        error: `Invalid deploy config '${path}': providers[${i}].driver.type must be one of ${ALLOWED_DEPLOY_DRIVER_TYPES.join(", ")}.`,
      };
    }
    const entry = typeof driver.entry === "string" ? driver.entry.trim() : "";
    if (entry.length === 0) {
      return {
        error: `Invalid deploy config '${path}': providers[${i}].driver.entry must be a non-empty string.`,
      };
    }
    providers.push({
      id,
      driver: {
        type: type as DeployDriverType,
        entry,
      },
    });
  }
  return { providers };
}

function parseOutputs(
  outputsRaw: unknown,
  path: string,
  envIndex: number
): { outputs?: DeployTemplateOutputSpec[]; error?: string } {
  if (!Array.isArray(outputsRaw)) {
    return {
      error: `Invalid deploy config '${path}': environments[${envIndex}].outputs must be an array.`,
    };
  }
  const outputs: DeployTemplateOutputSpec[] = [];
  const seenKeys = new Set<string>();
  for (let o = 0; o < outputsRaw.length; o++) {
    const entry = outputsRaw[o];
    if (!isRecord(entry)) {
      return {
        error: `Invalid deploy config '${path}': environments[${envIndex}].outputs[${o}] must be an object.`,
      };
    }
    const candidate = entry as RawDeployOutput;
    const key = typeof candidate.key === "string" ? candidate.key.trim() : "";
    if (key.length === 0) {
      return {
        error: `Invalid deploy config '${path}': environments[${envIndex}].outputs[${o}].key must be a non-empty string.`,
      };
    }
    if (seenKeys.has(key)) {
      return {
        error: `Invalid deploy config '${path}': duplicate output key '${key}' in environments[${envIndex}].outputs.`,
      };
    }
    seenKeys.add(key);

    const type = typeof candidate.type === "string" ? candidate.type : "";
    if (!ALLOWED_OUTPUT_TYPES.includes(type as DeployOutputType)) {
      return {
        error: `Invalid deploy config '${path}': environments[${envIndex}].outputs[${o}].type must be one of ${ALLOWED_OUTPUT_TYPES.join(", ")}.`,
      };
    }
    if (typeof candidate.sensitive !== "undefined" && typeof candidate.sensitive !== "boolean") {
      return {
        error: `Invalid deploy config '${path}': environments[${envIndex}].outputs[${o}].sensitive must be boolean when provided.`,
      };
    }
    if (typeof candidate.rotatable !== "undefined" && typeof candidate.rotatable !== "boolean") {
      return {
        error: `Invalid deploy config '${path}': environments[${envIndex}].outputs[${o}].rotatable must be boolean when provided.`,
      };
    }
    if (typeof candidate.required !== "undefined" && typeof candidate.required !== "boolean") {
      return {
        error: `Invalid deploy config '${path}': environments[${envIndex}].outputs[${o}].required must be boolean when provided.`,
      };
    }
    if (
      typeof candidate.description !== "undefined" &&
      typeof candidate.description !== "string"
    ) {
      return {
        error: `Invalid deploy config '${path}': environments[${envIndex}].outputs[${o}].description must be string when provided.`,
      };
    }
    outputs.push({
      key,
      type: type as DeployOutputType,
      sensitive: candidate.sensitive === true,
      rotatable: candidate.rotatable === true,
      required: candidate.required !== false,
      description:
        typeof candidate.description === "string" ? candidate.description : undefined,
      default: candidate.default,
    });
  }
  return { outputs };
}

function parseEnvironments(
  environmentsRaw: unknown,
  path: string
): { environments?: DeployTemplateEnvironmentSpec[]; error?: string } {
  if (!Array.isArray(environmentsRaw) || environmentsRaw.length === 0) {
    return {
      error: `Invalid deploy config '${path}': environments must be a non-empty array.`,
    };
  }
  const environments: DeployTemplateEnvironmentSpec[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < environmentsRaw.length; i++) {
    const item = environmentsRaw[i];
    if (!isRecord(item)) {
      return {
        error: `Invalid deploy config '${path}': environments[${i}] must be an object.`,
      };
    }
    const candidate = item as RawDeployEnvironment;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    if (!ENV_ID_PATTERN.test(id)) {
      return {
        error: `Invalid deploy config '${path}': environments[${i}].id must match ${ENV_ID_PATTERN.toString()}.`,
      };
    }
    if (seenIds.has(id)) {
      return {
        error: `Invalid deploy config '${path}': duplicate environment id '${id}'.`,
      };
    }
    seenIds.add(id);
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    if (label.length === 0) {
      return {
        error: `Invalid deploy config '${path}': environments[${i}].label must be a non-empty string.`,
      };
    }
    const provider = typeof candidate.provider === "string" ? candidate.provider.trim() : "";
    if (provider.length === 0) {
      return {
        error: `Invalid deploy config '${path}': environments[${i}].provider must be a non-empty string.`,
      };
    }
    if (!Array.isArray(candidate.capabilities) || candidate.capabilities.length === 0) {
      return {
        error: `Invalid deploy config '${path}': environments[${i}].capabilities must be a non-empty array.`,
      };
    }
    const capabilities: DeployCapability[] = [];
    for (let c = 0; c < candidate.capabilities.length; c++) {
      const capability = candidate.capabilities[c];
      if (
        typeof capability !== "string" ||
        !ALLOWED_CAPABILITIES.includes(capability as DeployCapability)
      ) {
        return {
          error: `Invalid deploy config '${path}': environments[${i}].capabilities[${c}] must be one of ${ALLOWED_CAPABILITIES.join(", ")}.`,
        };
      }
      capabilities.push(capability as DeployCapability);
    }
    if (!isRecord(candidate.constraints)) {
      return {
        error: `Invalid deploy config '${path}': environments[${i}].constraints must be an object.`,
      };
    }
    const outputResult = parseOutputs(candidate.outputs, path, i);
    if (outputResult.error) return { error: outputResult.error };
    environments.push({
      id,
      label,
      provider,
      capabilities,
      constraints: candidate.constraints,
      outputs: outputResult.outputs ?? [],
    });
  }
  return { environments };
}

function parsePresets(
  presetsRaw: unknown,
  path: string
): { presets?: DeployTemplatePresetSpec[]; error?: string } {
  if (!Array.isArray(presetsRaw) || presetsRaw.length === 0) {
    return {
      error: `Invalid deploy config '${path}': presets must be a non-empty array.`,
    };
  }
  const presets: DeployTemplatePresetSpec[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < presetsRaw.length; i++) {
    const item = presetsRaw[i];
    if (!isRecord(item)) {
      return {
        error: `Invalid deploy config '${path}': presets[${i}] must be an object.`,
      };
    }
    const candidate = item as RawDeployPreset;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    if (id.length === 0) {
      return {
        error: `Invalid deploy config '${path}': presets[${i}].id must be a non-empty string.`,
      };
    }
    if (seenIds.has(id)) {
      return {
        error: `Invalid deploy config '${path}': duplicate preset id '${id}'.`,
      };
    }
    seenIds.add(id);
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    if (label.length === 0) {
      return {
        error: `Invalid deploy config '${path}': presets[${i}].label must be a non-empty string.`,
      };
    }
    const description =
      typeof candidate.description === "string" ? candidate.description.trim() : "";
    if (description.length === 0) {
      return {
        error: `Invalid deploy config '${path}': presets[${i}].description must be a non-empty string.`,
      };
    }
    if (!Array.isArray(candidate.environments) || candidate.environments.length === 0) {
      return {
        error: `Invalid deploy config '${path}': presets[${i}].environments must be a non-empty array.`,
      };
    }
    const environments: string[] = [];
    for (let e = 0; e < candidate.environments.length; e++) {
      const envId = candidate.environments[e];
      if (typeof envId !== "string" || envId.trim().length === 0) {
        return {
          error: `Invalid deploy config '${path}': presets[${i}].environments[${e}] must be a non-empty string.`,
        };
      }
      environments.push(envId.trim());
    }
    if (typeof candidate.provider !== "undefined" && typeof candidate.provider !== "string") {
      return {
        error: `Invalid deploy config '${path}': presets[${i}].provider must be string when provided.`,
      };
    }
    if (!isRecord(candidate.constraints)) {
      return {
        error: `Invalid deploy config '${path}': presets[${i}].constraints must be an object.`,
      };
    }
    presets.push({
      id,
      label,
      description,
      environments,
      provider:
        typeof candidate.provider === "string" && candidate.provider.trim().length > 0
          ? candidate.provider.trim()
          : undefined,
      constraints: candidate.constraints,
    });
  }
  return { presets };
}

function validateCrossReferences(
  config: DeployTemplateConfig,
  path: string
): string | undefined {
  const providerIds = new Set(config.providers.map((provider) => provider.id));
  for (const env of config.environments) {
    if (!providerIds.has(env.provider)) {
      return `Invalid deploy config '${path}': environments provider '${env.provider}' is not defined in providers.`;
    }
  }

  const environmentIds = new Set(config.environments.map((env) => env.id));
  for (const preset of config.presets) {
    if (preset.provider && !providerIds.has(preset.provider)) {
      return `Invalid deploy config '${path}': preset '${preset.id}' references unknown provider '${preset.provider}'.`;
    }
    for (const envId of preset.environments) {
      if (!environmentIds.has(envId)) {
        return `Invalid deploy config '${path}': preset '${preset.id}' references unknown environment '${envId}'.`;
      }
    }
  }

  for (const env of config.environments) {
    const hasCompatiblePreset = config.presets.some(
      (preset) =>
        preset.environments.includes(env.id) &&
        (!preset.provider || preset.provider === env.provider)
    );
    if (!hasCompatiblePreset) {
      return `Invalid deploy config '${path}': no compatible preset found for environment '${env.id}' and provider '${env.provider}'.`;
    }
  }

  return undefined;
}

export function loadDeployTemplateConfigWithError(
  templateConfigPath: string
): LoadDeployTemplateConfigResult {
  const path = getDeployTemplateConfigPath(templateConfigPath);
  const exists = existsSync(path);
  if (!exists) {
    return { config: null, exists, path };
  }
  const parsed = parseConfigFileResult<RawDeployTemplateConfig>(path);
  if (!parsed.data || !isRecord(parsed.data)) {
    return {
      config: null,
      exists,
      path,
      error: parsed.error ?? `Failed to load deploy config '${path}'.`,
    };
  }
  const version = typeof parsed.data.version === "string" ? parsed.data.version.trim() : "";
  if (version !== SUPPORTED_DEPLOY_SCHEMA_VERSION) {
    return {
      config: null,
      exists,
      path,
      error: `Invalid deploy config '${path}': version must be '${SUPPORTED_DEPLOY_SCHEMA_VERSION}'.`,
    };
  }
  const providerResult = parseProviders(parsed.data.providers, path);
  if (providerResult.error) {
    return { config: null, exists, path, error: providerResult.error };
  }
  const environmentResult = parseEnvironments(parsed.data.environments, path);
  if (environmentResult.error) {
    return { config: null, exists, path, error: environmentResult.error };
  }
  const presetsResult = parsePresets(parsed.data.presets, path);
  if (presetsResult.error) {
    return { config: null, exists, path, error: presetsResult.error };
  }
  const config: DeployTemplateConfig = {
    version,
    providers: providerResult.providers ?? [],
    environments: environmentResult.environments ?? [],
    presets: presetsResult.presets ?? [],
  };
  const crossRefError = validateCrossReferences(config, path);
  if (crossRefError) {
    return {
      config: null,
      exists,
      path,
      error: crossRefError,
    };
  }
  return { config, exists, path };
}

export function loadDeployTemplateConfig(templateConfigPath: string): DeployTemplateConfig | null {
  return loadDeployTemplateConfigWithError(templateConfigPath).config;
}
