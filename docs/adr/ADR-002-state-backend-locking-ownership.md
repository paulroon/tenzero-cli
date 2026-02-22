# ADR-002: State Backend, Locking, and Ownership Scope

- Status: Accepted
- Date: 2026-02-22
- Owners: Paul
- Related decisions: `D-002`, `D-003`, `D-004`, `D-005`, `D-008`, `D-010`
- Related docs: `docs/integrations/iam-state-backend-policy-v1.md`

## Context

Deployment mode manages paid cloud resources and must prevent concurrent mutations, state corruption, and accidental destructive operations. `tz` is currently single-developer oriented, but should remain forward-compatible with future profile expansion.

## Decision

### Backend and naming

1. Deployments mode requires BYO AWS backend configuration before enablement.
2. v1 backend support is AWS-only.
3. State bucket naming convention: `tz-state-<aws-account-id>-<region>`.
4. State key convention: `tz/v1/<user-profile>/<app-install-id>/<env>/tofu.tfstate`.

### Locking and stale lock policy

1. Primary lock strategy: OpenTofu S3 lockfile.
2. Fallback lock strategy: DynamoDB lock table only if required.
3. Lock wait timeout: 10 minutes.
4. Stale lock threshold: 30 minutes inactivity.
5. Force-unlock is guarded, with stronger confirmation for `prod`.
6. After force-unlock, refresh/plan is mandatory before next apply.

### Least privilege and access model

1. Runtime IAM is least-privilege and restricted to state prefix operations.
2. Bootstrap permissions are separated from runtime permissions.
3. Policy baseline is defined in `docs/integrations/iam-state-backend-policy-v1.md`.

### Ownership scope and precedence

1. Primary config scope is per-user profile defaults.
2. Optional per-app backend override is supported.
3. Workspace-level defaults are deferred.
4. Precedence: `app override > profile default > not configured (deployments mode blocked)`.
5. Current single-profile behavior is treated as implicit `default` profile for future multi-profile support.

### Safety controls

1. `prod` apply requires a fresh plan review (15 minute freshness window).
2. Destroy requires explicit confirmation for all envs; `prod` requires stronger typed confirmation.
3. Failure policy is fail-closed on backend/lock/provider uncertainty.
4. Automatic rollback is not performed in v1.
5. App deletion is blocked while remote environments still exist.

## Rationale

- BYO backend avoids hosted-state cost/complexity in v1.
- Deterministic naming and strict lock rules reduce operational ambiguity.
- Least-privilege IAM and fail-closed behavior reduce blast radius.
- Per-profile defaults optimize UX while preserving a path to profile isolation.

## Consequences

### Positive

- Strong concurrency and state-safety model for paid resources.
- Clear operational model for single-developer v1.
- Compatible path toward later multi-profile and team-oriented features.

### Negative

- AWS-only backend limits initial flexibility.
- Users must complete backend setup before deployments are enabled.
- Force-unlock procedures require operational discipline.

## Non-Goals

- Multi-backend support in v1.
- Shared hosted backend managed by `tz` in v1.
- Team-level workspace state governance in v1.

## Revisit Triggers

- Significant demand for non-AWS backend support.
- Locking limitations in real-world usage.
- Multi-profile rollout requiring precedence or schema changes.
