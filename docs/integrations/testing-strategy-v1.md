# Testing Strategy v1 (Deployments)

## Purpose

Define the v1 test strategy for deployment features with emphasis on:

1. Deploy template schema validation
2. Lock/timeout/stale-lock behavior
3. Redaction and 30-day retention
4. Deployments-mode enablement gate

This strategy aligns with ADR-001/002/003 and decisions `D-003`, `D-004`, `D-008`, `D-010`, `D-012`, `D-013`, and `D-014`.

## Test layers

- **Unit tests**
  - Fast checks for schema parsing/validation, status mapping, precedence rules, and error mapping.
- **Integration tests**
  - Multi-component checks for backend checks, lock handling, run-history persistence, and gate evaluation.
- **E2E tests (happy path + critical failures)**
  - End-to-end flows through CLI/UI orchestration with mocked/stubbed provider/backend edges where needed.

## Tooling expectations

- Use deterministic fixtures for template `deploy.yaml` configs.
- Use fake clock/time travel utilities for retention expiry tests.
- Use backend/provider stubs for lock timeout/stale lock and permission errors.
- Ensure test logs are captured and assert redaction behavior.

## 1) Validation tests for deploy template schema

## Unit tests

- Accept valid `deploy.yaml.version: "2"` with valid environments.
- Reject missing/invalid `deploy.yaml.version`.
- Reject duplicate environment `id`.
- Reject environment `id` violating `^[a-z][a-z0-9-]{1,31}$`.
- Reject unknown capabilities outside v1 allowlist.
- Validate outputs typing (`string|number|boolean|json|secret_ref`).
- Reject missing required output fields (`key`, `type`).
- Reject invalid defaults that do not match declared output type.

## Integration tests

- Parse real template config with `deploy.yaml` and ensure normalized internal model is produced.
- Verify immutability rule:
  - allow env `id` change before first successful deploy
  - reject env `id` change after first successful deploy

## 2) Lock/timeout/stale-lock behavior tests

## Unit tests

- Map lock acquisition timeout to expected normalized error/status.
- Map stale lock conditions to expected error code.
- Enforce post-force-unlock requirement for refresh/plan before apply.

## Integration tests

- Simulate competing operations on same env:
  - second operation waits then fails at 10-minute policy boundary.
- Simulate stale lock at 30-minute threshold:
  - force-unlock path available with guardrails.
- Verify `prod` force-unlock requires stronger confirmation.
- Verify lock release occurs on success and handled failure paths.

## E2E tests

- Concurrent apply attempts to same environment demonstrate single-writer behavior.
- Failed operation with lock present can be recovered only via policy-compliant unlock flow.

## 3) Redaction + 30-day retention tests

## Unit tests

- Redaction removes known secret patterns from persisted logs.
- Sensitive output values are never persisted as raw values in run-history records.

## Integration tests

- Persist run history for `plan/apply/destroy/report/rotate`.
- Verify persisted run records contain metadata only and no credential payload.
- Verify read API returns reverse-chronological run history.
- Use fake clock to verify records older than 30 days are removed by cleanup process.

## E2E tests

- Perform run sequence and confirm visible history window trims data past 30 days after cleanup.

## 4) Deployments-mode gate integration tests

## Unit tests

- Gate evaluator returns blocked when AWS integration missing.
- Gate evaluator returns blocked for invalid backend config.
- Gate evaluator returns blocked when read/write or lock test fails.
- Gate evaluator returns enabled only when all checks pass.

## Integration tests

- AWS connected + backend valid + lock/read-write checks pass -> enable succeeds.
- Each failing precondition returns actionable remediation message.
- Enablement action records timestamp/profile context.

## E2E tests

- User flow from disabled state to enabled state after fixing reported setup issue.
- Ensure deployments commands fail-fast when gate not satisfied.

## Pass criteria (v1 release gate)

- All unit and integration tests above pass in CI.
- Critical E2E scenarios pass:
  - successful gate enablement
  - lock contention behavior
  - stale lock recovery flow
  - retention cleanup behavior
- No test artifacts include raw secret values.

## Recommended CI grouping

- `test:deploy-template-schema`
- `test:deploy-locking`
- `test:run-history`
- `test:deploy-gate`
- `test:deploy-e2e-critical`
