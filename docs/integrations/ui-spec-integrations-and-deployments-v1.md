# UI Spec v1: Integrations and App Deployment Environments

## Purpose

Define v1 UI behavior for:

- User-level Integrations setup
- App-level Deployment Environments operations

## 1) User Settings > Integrations

## AWS integration card

Sections:

1. Connection
   - status: connected/disconnected
   - actions: connect, validate, revoke
2. Backend config
   - bucket
   - region
   - profile
   - state key preview (`tz/v1/<profile>/<appInstallId>/<env>/tofu.tfstate`)
   - lock strategy summary
3. Validation panel
   - state read/write check
   - lock acquisition check
   - error remediation hints

## Deployments mode gate

- If integration/backend invalid:
  - disable "Enable Deployments"
  - show exact failing check and next action
- If valid:
  - allow enablement
  - record enabled timestamp/profile context

## 2) App Dashboard > Deployment Environments

## Environment list

Each environment row/card shows:

- `label` and immutable `id`
- status badge (`healthy`, `drifted`, `deploying`, `failed`, `unknown`)
- last run time
- quick summary counts (optional)

Actions:

- Plan
- Deploy/Apply
- Redeploy
- Destroy
- Report

## Environment detail view

Sections:

1. Status and drift
2. Last plan summary
3. Outputs (masked where sensitive)
4. Recent runs/logs (30-day window)
5. Actions with guardrails

## 3) Confirmation and guardrail UX

## Apply guardrails

- `prod` requires fresh plan (15 minutes).
- If stale, force re-plan.
- If drift unresolved, require explicit user confirm path.

## Destroy guardrails

- all envs: explicit confirmation
- `prod`: typed env id + second confirmation phrase

## App delete guardrail

- app delete action disabled while any remote env exists
- show blocking env/provider references
- require reconciliation check before final delete confirm

## 4) Error message conventions

- Show actionable, user-level guidance first.
- Include technical detail in expandable section.
- Include remediation hints for:
  - backend unavailable
  - lock timeout/stale lock
  - permission denied
  - unsupported capability

## 5) Non-goals (v1)

- Complex team role management UX
- Advanced diff visualizations
- Import/adopt unmanaged infrastructure workflows
