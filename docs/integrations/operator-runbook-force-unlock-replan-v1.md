# Operator Runbook: Force-Unlock and Mandatory Re-Plan (v1)

## Scope

This runbook defines safe recovery when lock state is stale and you must force-unlock.

## Preconditions

- You have confirmed there is no active deployment run for the environment.
- You observed lock timeout/stale-lock errors.
- You have operator intent to recover deployment flow safely.

## Procedure

1. Gather current status:
   - `tz deployments report --env <env>`
2. Perform force-unlock using the operational path for your environment.
3. Immediately run a fresh plan:
   - `tz deployments plan --env <env>`
4. Review plan output carefully.
5. Only then run apply:
   - `tz deployments apply --env <env>`

## Critical guardrail

After force-unlock, `tz` requires a re-plan before apply:

- `REPLAN_REQUIRED_AFTER_FORCE_UNLOCK`

If this appears, run `plan` again and retry apply.

## Production notes

- For `prod`, use stricter human review before apply.
- Re-validate drift and lock stability before any destructive action.
- Follow:
  - `integrations/operator-runbook-prod-plan-apply-safety-v1.md`
