# tz-cli Documentation Index

## ADRs

- `adr/ADR-001-engine-runtime.md`
- `adr/ADR-002-state-backend-locking-ownership.md`
- `adr/ADR-003-outputs-secrets-model.md`

## Integrations Specs

- `integrations/adapter-contract-v1.md`
- `integrations/app-env-outputs-data-model-v1.md`
- `integrations/deployment-workflow-v1.md`
- `integrations/iam-state-backend-policy-v1.md`
- `integrations/testing-strategy-v1.md`
- `integrations/ui-spec-integrations-and-infra-v1.md`

## Infra Compatibility Matrix

This matrix tracks which `infra.version` schema majors are supported by `tz-cli` releases.

| tz-cli release line | Supported `infra.version` majors | Notes |
| --- | --- | --- |
| current (main) | `1` | Initial Deployments schema |

## Release/docs workflow

For each `tz-cli` release that changes infra behavior:

1. Update the compatibility matrix in this file.
2. Update `tz-project-config/docs/integrations/infra-versioning-policy.md` if policy/compatibility changed.
3. Update relevant ADR/spec docs when schema or compatibility semantics change.
