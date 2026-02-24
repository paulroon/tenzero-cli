# Adapter Contract v1

## Purpose

Define the provider adapter interface for deployment operations in v1:

- `plan`
- `apply`
- `destroy`
- `report`
- `resolveOutputs`

This contract provides a provider-agnostic execution surface for `tz` orchestration.

## Scope

This document defines:

- adapter method signatures and response contracts
- normalized status mapping
- normalized error model

This document does not define provider-specific implementation details.

## Core Status Model

All adapters must map provider/runtime state to one of:

- `healthy`
- `drifted`
- `deploying`
- `failed`
- `unknown`

Notes:

- `drifted` means confirmed desired-vs-live mismatch.
- `unknown` means backend/provider uncertainty (not treated as drift).
- `failed` means last operation failed and requires user action.

## Type Definitions (TypeScript-style)

```ts
export type EnvironmentStatus =
  | "healthy"
  | "drifted"
  | "deploying"
  | "failed"
  | "unknown";

export type DeployAction = "plan" | "apply" | "destroy" | "report" | "resolveOutputs";

export type Severity = "info" | "warning" | "error";

export interface AdapterContext {
  runId: string;
  profile: string;           // e.g. "default"
  appInstallId: string;
  environmentId: string;     // immutable machine id
  region?: string;
  provider: string;          // e.g. "aws"
  dryRun?: boolean;
}

export interface DeployEnvironmentSpec {
  id: string;
  label: string;
  capabilities: string[];
  constraints: Record<string, unknown>;
  outputs: OutputSpec[];
}

export interface OutputSpec {
  key: string;
  type: "string" | "number" | "boolean" | "json" | "secret_ref";
  required?: boolean;
  sensitive?: boolean;
  rotatable?: boolean;
  default?: unknown;
}

export interface PlanSummary {
  add: number;
  change: number;
  destroy: number;
  driftDetected: boolean;
}

export interface PlanItem {
  resourceType: string;
  resourceName: string;
  action: "add" | "change" | "destroy" | "no-op";
  details?: string;
}

export interface AdapterWarning {
  code: string;
  message: string;
  severity: Severity; // warning or info recommended
}

export interface AdapterError {
  code: AdapterErrorCode;
  message: string;
  retryable: boolean;
  category: "validation" | "backend" | "lock" | "provider" | "auth" | "timeout" | "internal";
  details?: Record<string, unknown>;
}

export interface PlanResult {
  status: EnvironmentStatus;
  summary: PlanSummary;
  items: PlanItem[];
  warnings: AdapterWarning[];
  errors: AdapterError[];
}

export interface ApplyResult {
  status: EnvironmentStatus;
  summary: PlanSummary;
  warnings: AdapterWarning[];
  errors: AdapterError[];
  changedResources: Array<{ resourceType: string; resourceName: string }>;
}

export interface DestroyResult {
  status: EnvironmentStatus;
  warnings: AdapterWarning[];
  errors: AdapterError[];
  destroyedResources: Array<{ resourceType: string; resourceName: string }>;
}

export interface ReportResult {
  status: EnvironmentStatus;
  driftDetected: boolean;
  lastCheckedAt: string; // ISO timestamp
  summary: {
    managedResourceCount: number;
    unhealthyResourceCount: number;
    driftedResourceCount: number;
  };
  warnings: AdapterWarning[];
  errors: AdapterError[];
}

export interface ResolvedOutput {
  key: string;
  type: "string" | "number" | "boolean" | "json" | "secret_ref";
  value?: unknown;           // omitted for secret_ref if only reference is available
  secretRef?: string;        // required for secret_ref
  sensitive?: boolean;
  rotatable?: boolean;
  source: "provider" | "templateDefault" | "manualOverride";
}

export interface ResolveOutputsResult {
  status: EnvironmentStatus;
  outputs: ResolvedOutput[];
  warnings: AdapterWarning[];
  errors: AdapterError[];
}
```

## Adapter Interface

```ts
export interface ProviderAdapterV1 {
  readonly providerId: string;
  readonly supportedCapabilities: string[];

  plan(ctx: AdapterContext, env: DeployEnvironmentSpec): Promise<PlanResult>;
  apply(ctx: AdapterContext, env: DeployEnvironmentSpec): Promise<ApplyResult>;
  destroy(ctx: AdapterContext, env: DeployEnvironmentSpec): Promise<DestroyResult>;
  report(ctx: AdapterContext, env: DeployEnvironmentSpec): Promise<ReportResult>;
  resolveOutputs(ctx: AdapterContext, env: DeployEnvironmentSpec): Promise<ResolveOutputsResult>;
}
```

## Behavior Requirements

1. `plan` must never mutate remote infrastructure.
2. `apply` and `destroy` must be idempotent when rerun after partial failure where possible.
3. `report` must map unknown backend/provider errors to `status: "unknown"`.
4. `resolveOutputs` must enforce output typing and required output completeness.
5. Adapters must not return raw credential material in warnings/errors/log fields.

## Error Model

### Error Codes

```ts
export type AdapterErrorCode =
  | "VALIDATION_FAILED"
  | "CAPABILITY_UNSUPPORTED"
  | "BACKEND_UNAVAILABLE"
  | "BACKEND_STATE_CORRUPT"
  | "LOCK_ACQUIRE_FAILED"
  | "LOCK_TIMEOUT"
  | "LOCK_STALE"
  | "AUTH_FAILED"
  | "PERMISSION_DENIED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_API_ERROR"
  | "DRIFT_DETECTED"
  | "OUTPUT_RESOLUTION_FAILED"
  | "INTERNAL_ERROR";
```

### Mapping Guidance

- Backend or provider uncertainty -> `status: "unknown"`.
- Confirmed desired/live mismatch -> `status: "drifted"` with `DRIFT_DETECTED`.
- Active long-running operation -> `status: "deploying"`.
- Terminal operation failure -> `status: "failed"`.

## Output Merge and Rotation Rules

Adapters must preserve v1 precedence and rotation behavior:

1. Merge precedence: `manual override > provider output > template default`.
2. Generated credentials are not manually overrideable in v1.
3. Only `rotatable: true` outputs may be rotated.
4. `resolveOutputs` must include `source` for each returned output.

## Minimal v1 Capability Expectations

Adapter implementations must support the v1 capability baseline:

- `appRuntime`
- `postgres`
- `envConfig`
- `dns` only if trivial for provider #1

Unsupported capabilities must return `CAPABILITY_UNSUPPORTED`.
