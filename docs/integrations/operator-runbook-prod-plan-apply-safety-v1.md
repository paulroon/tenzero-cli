# Operator Runbook: Prod Plan/Apply Safety (v1)

## Scope

This runbook covers mandatory safety checks for `prod` plan/apply.

In interactive mode, use: App Dashboard -> Infra Environments -> `prod`.

## Mandatory policies

- `prod` apply requires a **fresh plan** (15-minute freshness window).
- Drift must be explicitly acknowledged before risky apply path.
- Lock uncertainty fails closed.

## Standard prod flow

1. Generate plan:
   - `tz deployments plan --env prod`
2. Review summary and drift status.
3. If drift is present:
   - Interactive app: confirm drift in the in-screen confirmation prompt.
   - Shell mode: explicitly acknowledge when applying:
   - `tz deployments apply --env prod --confirm-drift-prod`
4. If no drift is present:
   - `tz deployments apply --env prod`

## Freshness guardrail

If apply is attempted with stale/no plan, expect:

- `PROD_PLAN_REQUIRED`
- `PROD_PLAN_STALE`

Remediation:

1. Re-run plan:
   - `tz deployments plan --env prod`
2. Re-run apply within the freshness window.

## Drift guardrail

If `prod` drift requires explicit acknowledgment, expect:

- `PROD_DRIFT_CONFIRM_REQUIRED`

Remediation:

1. Re-run plan and verify intended changes.
2. Apply with explicit confirmation:
   - `tz deployments apply --env prod --confirm-drift-prod`

## Related runbooks

- Lock handling:
  - `integrations/operator-runbook-lock-timeout-stale-lock-v1.md`
- Force-unlock recovery:
  - `integrations/operator-runbook-force-unlock-replan-v1.md`
