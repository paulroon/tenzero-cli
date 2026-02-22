# ADR-001: Deployment Engine and Runtime Model

- Status: Accepted
- Date: 2026-02-22
- Owners: Paul
- Related decisions: `D-001`, `D-002`

## Context

`tz` needs a reliable deployment engine that supports plan/apply workflows, stateful infrastructure management, and predictable behavior across local and CI environments. The project prioritizes KISS, low operational overhead, and strong safety defaults for paid infrastructure operations.

## Decision

1. Use an OpenTofu-compatible workflow as the deployment engine baseline.
2. Execute deployment operations in a containerized runner.
3. Require Docker as a system-wide prerequisite for deployment mode.
4. Pin deployment runner image and OpenTofu version for reproducibility.
5. Inject provider credentials at runtime only; do not bake credentials into images.
6. Deployments mode is gated behind validated BYO backend configuration.

## Rationale

- OpenTofu-compatible workflows are standard, well-understood, and align with plan/apply semantics.
- Container execution reduces host drift and support complexity.
- Docker requirement keeps execution deterministic across user machines and CI.
- Version pinning reduces unexpected behavior from tool/plugin upgrades.
- Runtime-only credential injection reduces credential exposure risk.

## Consequences

### Positive

- Predictable execution environment across machines.
- Lower support burden for local dependency drift.
- Strong baseline for future provider expansion.

### Negative

- Docker becomes a hard dependency for deployment mode.
- Runner image lifecycle and version upgrades must be maintained.

## Non-Goals

- Supporting non-containerized deployment engine execution in v1.
- Multi-engine support (e.g., Pulumi + OpenTofu) in v1.

## Revisit Triggers

- Docker requirement materially blocks adoption.
- OpenTofu compatibility gaps block provider roadmap.
- Operational cost of runner maintenance outweighs benefits.
