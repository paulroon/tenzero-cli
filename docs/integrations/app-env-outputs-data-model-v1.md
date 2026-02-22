# App-Environment Outputs Data Model v1

## Purpose

Define how deployment outputs are stored for an app install + environment in v1.

This model implements ADR-003 and D-009 decisions.

## Scope

- Applies to deployment outputs and environment-scoped variables/secrets.
- Does not apply to user-global secrets.

## Identity and ownership

- Owner scope: `appInstallId + environmentId`.
- Environment identity uses immutable machine `environmentId` (not label).
- Output records are namespaced per environment.

## Entity model

## `EnvironmentOutputRecord`

- `appInstallId` (string, required)
- `environmentId` (string, required)
- `key` (string, required)
- `type` (`string | number | boolean | json | secret_ref`, required)
- `value` (optional, any JSON-safe value; omitted for pure references)
- `secretRef` (optional string; required when `type=secret_ref`)
- `sensitive` (boolean, default `false`)
- `rotatable` (boolean, default `false`)
- `source` (`manualOverride | providerOutput | templateDefault`, required)
- `isGeneratedCredential` (boolean, default `false`)
- `version` (integer, monotonically increasing)
- `createdAt` (ISO timestamp)
- `updatedAt` (ISO timestamp)

## `EnvironmentOutputHistoryRecord`

- `appInstallId`
- `environmentId`
- `key`
- `version`
- `changeType` (`create | update | rotate`)
- `previousValueHash` (optional)
- `newValueHash` (optional)
- `changedBy` (actor id)
- `changedAt` (ISO timestamp)

Notes:

- Store hashes for sensitive values, not raw value snapshots.
- History is operational metadata, not secret archival.

## Merge precedence

Resolved output value precedence:

1. `manualOverride`
2. `providerOutput`
3. `templateDefault`

Rules:

- Generated credentials (`isGeneratedCredential=true`) cannot be manually overridden in v1.
- If required output cannot be resolved, deployment is invalid.

## Validation rules

1. `key` must be unique per `appInstallId + environmentId`.
2. `type` must match schema-declared output type.
3. For `secret_ref`, `secretRef` is required and `value` is optional.
4. For non-`secret_ref`, `value` is required unless unresolved during planning.
5. `source` must be one of allowed enum values.
6. `version` increments on each effective change.

## Rotation behavior

- Only `rotatable=true` outputs can rotate.
- Rotation creates a new version atomically.
- For `prod`, rotation requires explicit confirmation.
- After rotation, environment is marked as requiring reconfigure/redeploy.

## Storage and security

- Sensitive values must be redacted from logs and run history.
- Raw secrets should be stored via secure storage path compatible with `secret_ref` patterns.
- Deployment run history retains metadata/logs for 30 days (no raw secrets).

## Read models

Minimum query views:

- Current outputs by `appInstallId + environmentId`
- Single output by key
- Output history by key (metadata only)

## Out of scope (v1)

- Cross-environment inherited outputs
- Global secret sharing across apps
- Rich secret lineage visualization
