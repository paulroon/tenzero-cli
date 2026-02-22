# Deployment Workflow v1

## Purpose

Define the end-to-end deployment workflow behavior for v1.

## Preconditions

Deployments mode is enabled only when:

1. AWS integration is connected.
2. BYO backend config is valid.
3. State read/write and lock checks pass.

## Core flow

## 1) Plan

- Input: `appInstallId`, `environmentId`.
- Acquire lock for environment scope.
- Build desired state from template `infra` + app/env config.
- Produce plan summary (`add/change/destroy`) and drift indication.
- Release lock.

Plan must be non-mutating.

## 2) Apply

- Requires a fresh plan for `prod` (15-minute freshness window).
- Acquire lock.
- Re-check drift status.
- If unresolved drift for `prod`, require explicit re-plan/confirm path.
- Execute apply.
- Resolve and persist typed outputs to app-env scope.
- Persist run metadata/logs.
- Release lock.

Partial apply is not supported in v1.

## 3) Destroy

- Acquire lock.
- Require explicit confirmation for all environments.
- `prod` requires typed env id plus extra confirmation phrase.
- Execute destroy.
- Clear managed output records for destroyed environment.
- Persist run metadata/logs.
- Release lock.

## 4) Report

- Read-only operation.
- Returns normalized status:
  - `healthy | drifted | deploying | failed | unknown`
- Includes drift summary and last checked timestamp.

## 5) Resolve outputs

- Validate required outputs and type conformance.
- Apply precedence:
  - `manualOverride > providerOutput > templateDefault`
- Reject manual override for generated credentials.
- Persist resolved outputs atomically.

## Locking and stale lock policy

- Lock wait timeout: 10 minutes.
- Stale lock threshold: 30 minutes inactivity.
- Force-unlock:
  - guarded for all envs
  - stricter confirmation for `prod`
- Mandatory refresh/plan after force-unlock before next apply.

## Failure policy

- Fail-closed on backend/lock/provider uncertainty.
- No automatic rollback in v1.
- Persist failed run metadata/logs and actionable error summary.
- Map uncertain backend/provider failures to `unknown` status.

## App deletion guardrail

Local app deletion is blocked unless all provider-backed environments are destroyed and reconciliation passes.

## Audit/log retention

- Store deployment run history and logs for 30 days.
- Store operational metadata/logs only.
- Never persist raw secrets or credentials in logs.
