# ADR-003: Outputs and Secrets Model (App-Environment Scoped)

- Status: Accepted
- Date: 2026-02-22
- Owners: Paul
- Related decisions: `D-006`, `D-007`, `D-009`, `D-012`

## Context

Deployment outputs (connection strings, endpoints, generated credentials, references) must be stored and consumed safely. `tz` requires provider-agnostic output semantics while keeping secrets scoped to app installs and environments, not shared globally at user level.

## Decision

### Scope and identity

1. Outputs are stored at app-install + environment scope.
2. Environment identity uses stable `id` (machine) and editable `label` (human).
3. All output/state bindings reference environment `id`, never `label`.

### Typed output model

1. Supported output types in v1:
   - `string`
   - `number`
   - `boolean`
   - `json`
   - `secret_ref`
2. Outputs support explicit flags:
   - `sensitive`
   - `rotatable`

### Merge precedence

1. Precedence rule: `manual override > provider output > template default`.
2. Manual overrides are disallowed for generated credentials in v1.

### Rotation behavior

1. Only outputs flagged `rotatable` may rotate.
2. Rotation updates app-install environment values atomically.
3. Previous version metadata is retained for traceability.
4. `prod` rotations require explicit confirmation.
5. Post-rotation, environment is marked as requiring reconfigure/redeploy action.

### Data handling and retention

1. Deployment run history retention is 30 days in v1.
2. Deployment history includes operational deployment metadata/logs only.
3. Raw secrets/credential material must not be persisted in logs/history.
4. Sensitive values must be redacted before persistence.

## Rationale

- App+env scoping matches deployment lifecycle and limits secret sprawl.
- Typed outputs improve validation, portability, and adapter consistency.
- Precedence rule gives controlled flexibility while protecting generated credentials.
- Rotation guardrails reduce accidental production impact.

## Consequences

### Positive

- Clear and portable output contract for templates and adapters.
- Safer secret handling model aligned with environment boundaries.
- Predictable override/rotation behavior for users and tooling.

### Negative

- Additional validation logic needed for typed outputs and rotation rules.
- Some advanced override scenarios are intentionally blocked in v1.

## Non-Goals

- Global user-level secret sharing for environment outputs.
- Unrestricted manual overrides of generated credentials.
- Advanced secret lineage/version governance beyond v1 needs.

## Revisit Triggers

- Need for richer output types or secret providers.
- Frequent valid use-cases blocked by v1 override constraints.
- Team workflows requiring broader audit/history policy controls.
