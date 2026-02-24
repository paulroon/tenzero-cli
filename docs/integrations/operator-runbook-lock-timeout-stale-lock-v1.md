# Operator Runbook: Lock Timeout and Stale Lock (v1)

## Scope

This runbook covers lock-related deployment failures in `tz-cli` Deployments v1:

- lock timeout policy: **10 minutes**
- stale lock threshold: **30 minutes**
- fail-closed behavior for uncertain lock state

Interactive path: App Dashboard -> Infra Environments -> select environment.

## Symptoms

You may see errors like:

- `LOCK_TIMEOUT: Lock already held for '<env>'...`
- `LOCK_STALE: Existing lock for '<env>' is stale...`

## Why this happens

- Another deployment action is currently active for the same environment.
- A prior run exited unexpectedly and left a lock record.
- Backend lock state is uncertain and `tz` blocks rather than risking concurrent apply.

## First response checklist

1. Verify no active deploy command is still running for the same environment.
2. Run a non-destructive status check (or use the Dashboard Report action):
   - `tz deployments report --env <env>`
3. If lock timeout repeats and no active run exists, treat lock as potentially stale.

## Timeout handling (10m policy)

- If timeout occurs but another operator/run is active, wait for that run to finish.
- Do **not** run concurrent apply/destroy against the same environment.
- Re-run:
  - `tz deployments plan --env <env>`

## Stale lock handling (30m threshold)

- If stale lock is reported, do not immediately apply.
- Follow force-unlock runbook:
  - `integrations/operator-runbook-force-unlock-replan-v1.md`

## Guardrails

- Never bypass by editing state artifacts manually in v1 runbooks.
- After stale-lock recovery, always run a fresh plan before apply.
- For `prod`, follow prod safety runbook before any apply:
  - `integrations/operator-runbook-prod-plan-apply-safety-v1.md`
