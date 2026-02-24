# Deployments v1 E2E Smoke Checklist

Use this checklist before tagging a Deployments v1 release.

## Environment setup

- [ ] Docker installed and daemon running.
- [ ] AWS integration connected in `tz` settings.
- [ ] BYO backend configured (bucket, region, profile, state prefix, lock strategy).
- [ ] Backend validation checks pass (read/write + lock acquisition).
- [ ] Deployments mode enabled.

## Core command smoke

For interactive coverage, run the same lifecycle from App Dashboard -> Deployment Environments.

- [ ] `tz deployments plan --env test` succeeds and prints plan summary.
- [ ] `tz deployments report --env test` succeeds and prints status/drift.
- [ ] `tz deployments apply --env test` succeeds from clean/fresh plan path.
- [ ] `tz deployments destroy --env test --confirm-env test --confirm "destroy test"` succeeds.

## Guardrail smoke

- [ ] `apply` blocks when preflight report is `drifted` and no `--confirm-drift`.
- [ ] `prod` apply blocks on stale plan (>15m) and requires re-plan.
- [ ] `prod` destroy requires second phrase:
  - `--confirm-prod "destroy prod permanently"`
- [ ] Stale lock path emits lock guardrail error and blocks unsafe apply.
- [ ] Post-force-unlock apply blocks until re-plan.

## Lifecycle safety smoke

- [ ] Local app delete is blocked when provider-backed environments remain.
- [ ] Delete error lists exact environment IDs and in-app destroy guidance.
- [ ] Local app delete succeeds after all environments are destroyed.

## Audit and retention smoke

- [ ] Run history records `plan/apply/destroy/report`.
- [ ] Redaction removes sensitive credential-like values from stored logs.
- [ ] Retention behavior (30-day policy) remains test-covered and functional.

## Release docs checks

- [ ] `docs/README.md` compatibility matrix is current.
- [ ] Operator runbooks are present and indexed.
- [ ] Release/docs workflow section reflects current command/guardrail behavior.
