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
- `integrations/operator-runbook-lock-timeout-stale-lock-v1.md`
- `integrations/operator-runbook-force-unlock-replan-v1.md`
- `integrations/operator-runbook-prod-plan-apply-safety-v1.md`
- `integrations/deployments-v1-e2e-smoke-checklist.md`

## Infra Compatibility Matrix

This matrix tracks which `infra.version` schema majors are supported by `tz-cli` releases.

| tz-cli release line | Supported `infra.version` majors | Notes |
| --- | --- | --- |
| current (main) | `1` | Deployments v1 shipped through PR-11 behavior set |

## Release/docs workflow

For each `tz-cli` release that changes infra behavior:

1. Update the compatibility matrix in this file.
2. Update `tz-project-config/docs/integrations/infra-versioning-policy.md` if policy/compatibility changed.
3. Update relevant ADR/spec docs when schema or compatibility semantics change.
4. Verify runbooks reflect current guardrails:
   - lock timeout/stale lock
   - force-unlock + mandatory re-plan
   - prod plan/apply safety
5. Run the launch checklist:
   - `integrations/deployments-v1-e2e-smoke-checklist.md`
6. Confirm command surface and docs remain aligned:
   - `tz deployments plan|apply|destroy|report`
   - `report --watch` flags
   - drift confirmation flags and prod destroy confirmation phrases
   - interactive app flow (`Dashboard -> Infra Environments`) and remediation wording
