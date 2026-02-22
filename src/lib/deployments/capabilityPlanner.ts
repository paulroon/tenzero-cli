import type { InfraConfig, InfraEnvironmentSpec, InfraOutputSpec } from "@/lib/config";
import {
  getProjectEnvironmentOutputs,
  upsertProjectEnvironmentOutputs,
  type ProjectEnvironmentOutputWrite,
} from "@/lib/config/project";

type InfraCapability = InfraEnvironmentSpec["capabilities"][number];

export type PlannedEnvironmentModule = {
  capability: InfraCapability;
  moduleId: string;
  constraints: Record<string, unknown>;
};

export type PlannedEnvironmentDeployment = {
  environmentId: string;
  label: string;
  modules: PlannedEnvironmentModule[];
};

const CAPABILITY_ORDER: InfraCapability[] = ["appRuntime", "envConfig", "postgres", "dns"];

const CAPABILITY_MODULE_MAP: Record<InfraCapability, string> = {
  appRuntime: "module.appRuntime.v1",
  envConfig: "module.envConfig.v1",
  postgres: "module.postgres.v1",
  dns: "module.dns.v1",
};

function uniqueCapabilities(capabilities: InfraCapability[]): InfraCapability[] {
  return Array.from(new Set(capabilities));
}

function assertEnvironmentCapabilityCombination(env: InfraEnvironmentSpec): void {
  const capabilities = uniqueCapabilities(env.capabilities);
  const has = (capability: InfraCapability) => capabilities.includes(capability);

  if (has("postgres") && !has("appRuntime")) {
    throw new Error(
      `Unsupported capability combination for '${env.id}': postgres requires appRuntime. Add appRuntime or remove postgres.`
    );
  }

  if (has("dns")) {
    if (!has("appRuntime")) {
      throw new Error(
        `Unsupported capability combination for '${env.id}': dns requires appRuntime. Add appRuntime or remove dns.`
      );
    }
    const domain = env.constraints["domain"];
    if (typeof domain !== "string" || domain.trim().length === 0) {
      throw new Error(
        `Invalid constraints for '${env.id}': dns capability requires constraints.domain (non-empty string).`
      );
    }
  }
}

export function planEnvironmentDeployment(
  infra: InfraConfig,
  environmentId: string
): PlannedEnvironmentDeployment {
  const env = infra.environments.find((item) => item.id === environmentId);
  if (!env) {
    throw new Error(
      `Environment '${environmentId}' not defined in infra config. Add it under infra.environments.`
    );
  }
  assertEnvironmentCapabilityCombination(env);

  const capabilities = uniqueCapabilities(env.capabilities).sort(
    (a, b) => CAPABILITY_ORDER.indexOf(a) - CAPABILITY_ORDER.indexOf(b)
  );
  const modules: PlannedEnvironmentModule[] = capabilities.map((capability) => ({
    capability,
    moduleId: CAPABILITY_MODULE_MAP[capability],
    constraints: env.constraints,
  }));

  return {
    environmentId: env.id,
    label: env.label,
    modules,
  };
}

function parseOutputValue(
  spec: InfraOutputSpec,
  raw: unknown,
  source: "providerOutput" | "templateDefault",
  generatedCredentialKeys: Set<string>
): ProjectEnvironmentOutputWrite | undefined {
  if (typeof raw === "undefined") return undefined;

  if (spec.type === "secret_ref") {
    const secretRef =
      typeof raw === "string"
        ? raw
        : raw && typeof raw === "object" && typeof (raw as { secretRef?: unknown }).secretRef === "string"
          ? (raw as { secretRef: string }).secretRef
          : undefined;
    if (!secretRef) {
      throw new Error(
        `Output '${spec.key}' must resolve to a secret reference string for type secret_ref.`
      );
    }
    return {
      key: spec.key,
      type: spec.type,
      secretRef,
      source,
      sensitive: spec.sensitive ?? true,
      rotatable: spec.rotatable,
      isGeneratedCredential: generatedCredentialKeys.has(spec.key),
    };
  }

  if (spec.type === "string" && typeof raw !== "string") {
    throw new Error(`Output '${spec.key}' must be string.`);
  }
  if (spec.type === "number" && typeof raw !== "number") {
    throw new Error(`Output '${spec.key}' must be number.`);
  }
  if (spec.type === "boolean" && typeof raw !== "boolean") {
    throw new Error(`Output '${spec.key}' must be boolean.`);
  }

  return {
    key: spec.key,
    type: spec.type,
    value: raw,
    source,
    sensitive: spec.sensitive,
    rotatable: spec.rotatable,
    isGeneratedCredential: generatedCredentialKeys.has(spec.key),
  };
}

export function persistResolvedEnvironmentOutputs(args: {
  projectPath: string;
  environment: InfraEnvironmentSpec;
  providerOutputs: Record<string, unknown>;
  generatedCredentialKeys?: string[];
}): ReturnType<typeof getProjectEnvironmentOutputs> {
  const knownKeys = new Set(args.environment.outputs.map((output) => output.key));
  for (const key of Object.keys(args.providerOutputs)) {
    if (!knownKeys.has(key)) {
      throw new Error(
        `Unknown provider output '${key}' for environment '${args.environment.id}'. Add it to infra.outputs or remove it from provider mapping.`
      );
    }
  }

  const generatedCredentialKeys = new Set(args.generatedCredentialKeys ?? []);
  const templateDefaultWrites: ProjectEnvironmentOutputWrite[] = [];
  const providerWrites: ProjectEnvironmentOutputWrite[] = [];

  for (const spec of args.environment.outputs) {
    const hasProviderValue = Object.prototype.hasOwnProperty.call(args.providerOutputs, spec.key);
    const providerRaw = hasProviderValue ? args.providerOutputs[spec.key] : undefined;
    const defaultRaw = spec.default;

    const defaultWrite = parseOutputValue(
      spec,
      defaultRaw,
      "templateDefault",
      generatedCredentialKeys
    );
    if (defaultWrite) {
      templateDefaultWrites.push(defaultWrite);
    }

    const providerWrite = parseOutputValue(
      spec,
      providerRaw,
      "providerOutput",
      generatedCredentialKeys
    );
    if (providerWrite) {
      providerWrites.push(providerWrite);
    }

    if (spec.required === true && !defaultWrite && !providerWrite) {
      throw new Error(
        `Missing required output '${spec.key}' for environment '${args.environment.id}'. Provide it from provider output or template default.`
      );
    }
  }

  if (templateDefaultWrites.length > 0) {
    upsertProjectEnvironmentOutputs(args.projectPath, args.environment.id, templateDefaultWrites);
  }
  if (providerWrites.length > 0) {
    upsertProjectEnvironmentOutputs(args.projectPath, args.environment.id, providerWrites);
  }

  return getProjectEnvironmentOutputs(args.projectPath, args.environment.id);
}
