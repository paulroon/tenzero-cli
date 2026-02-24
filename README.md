# TenZero CLI

A terminal UI for managing multiple projects and scaffolding new ones with configurable, framework-specific pipelines.

![React](https://img.shields.io/badge/React-19-61dafb?logo=react)
![Ink](https://img.shields.io/badge/Ink-6-8dd6f9?logo=node.js)
![Bun](https://img.shields.io/badge/Bun-1.x-fbf1df?logo=bun)

---

## Features

- **Interactive TUI** — Navigate with keyboard; choose options, create projects, manage config
- **Project scaffolding** — Select a template (Symfony, Vanilla PHP, etc.) and answer a few questions
- **Configurable pipelines** — Each project type defines its own creation steps (run commands, copy files, interpolate templates)
- **Profile interpolation** — Your name and email from `~/tz/config.json` are injected into project configs (e.g. Composer author)
- **Conditional steps** — Use `when` conditions so questions and pipeline steps only run when needed
- **User & custom configs** — Built-in templates in `config/projects/`, extensible via `~/tz/configs/`
- **Project tracking** — Projects are tagged with `.tzconfig.json` for quick open and status

---

## Installation

```bash
# Clone the repo
git clone https://github.com/tenzero/tz-cli.git
cd tz-cli

# Install dependencies (Bun)
bun install

# Link globally (optional)
bun link
```

**Requirements:** [Bun](https://bun.sh) v1.x (or Node.js with compatible package manager)

---

## Usage

```bash
bun run src/cli.tsx
# or, if linked:
tz
```

**First run:** You’ll be prompted for your name, email, and project directory (default: `~/Projects`). This is stored in `~/tz/config.json`.

### Deployments commands

Preferred flow: run deployments from the interactive app Dashboard under **Deployment Environments**.
Use commands below for automation, CI, or non-interactive usage.

You can run deployments actions directly from the shell:

```bash
tz deployments plan --env test
tz deployments apply --env test
tz deployments report --env test
tz deployments report --env test --watch --interval-seconds 5 --max-cycles 3
tz deployments destroy --env test --confirm-env test --confirm "destroy test"
```

For `prod` destroy, a second confirmation is required:

```bash
tz deployments destroy --env prod --confirm-env prod --confirm "destroy prod" --confirm-prod "destroy prod permanently"
```

Notes:
- Commands fail fast if Deployments mode gate checks are not satisfied.
- Commands run in the current working directory unless `--project <path>` is provided.
- In the interactive app, drift confirmation is handled in-screen (no manual flags required).
- In shell mode, `apply` runs a preflight drift check; if drift is detected, use `--confirm-drift` for non-prod and `--confirm-drift-prod` for prod.
- `report --watch` supports refresh polling with `--interval-seconds` and `--max-cycles`.

### Main menu

| Option         | Description                                |
|----------------|--------------------------------------------|
| **New Project**| Scaffold a new project from a template     |
| **Options…**   | View or edit your profile/config           |
| **Open…**      | Open an existing project                   |
| **Exit**       | Quit (clears screen and returns to shell)  |

**Keys:** `↑`/`↓` to select, `Enter` to confirm, `Esc` to go back (or exit at root)

---

## Configuration

### User profile (`~/tz/config.json`)

```json
{
  "name": "Your Name",
  "email": "you@example.com",
  "projectDirectory": "/path/to/Projects",
  "projects": []
}
```

`projects` is synced from the filesystem based on subdirectories that contain `.tzconfig.json`.

### Project configs

Project templates live under `config/projects/<id>/`. Builder config files can be:

- `config.yaml` (preferred)
- `config.yml`
- `config.json` (legacy)

Each config is declarative and defines:

- `questions` - what the user answers
- optional `ui.groups` - question grouping hints for the TUI
- optional `dependencies` - dependency references by id
- `pipeline` - ordered generation steps

```yaml
label: Symfony Web App
type: symfony
version: "2.0"

questions:
  - id: projectName
    label: Project name
    type: string
    required: true

  - id: symfonyAuth
    label: Auth type
    type: select
    default: no-auth
    options:
      - label: No auth
        value: no-auth
      - label: Simple auth
        value: simple-auth

  - id: dockerize
    label: Dockerize
    type: boolean
    default: false

ui:
  groups:
    - id: build-options
      label: Build options
      type: boolean-checklist
      questionIds:
        - dockerize
        - enableMetrics

dependencies:
  - symfony-cli
  - composer
  - id: make
    when:
      dockerize: "true"

pipeline:
  - type: createProjectDirectory
    label: Create project directory

  - type: run
    label: Create Symfony app
    config:
      command: symfony new --webapp .
```

**Interpolation:** Use `{{projectName}}`, `{{profile.name}}`, `{{profile.email}}` in commands/paths and template file content.

**Question types:** `string` (or `text`), `select`, and `boolean`.

**UI groups (optional):** If omitted, questions are asked one-by-one (existing behavior). When present, `boolean-checklist` groups 2+ boolean questions into a single screen.

**Pipeline steps:** `createProjectDirectory`, `run`, `copy`, `modify`, `append`, `delete`, plus an implied `finalize` (git init, `.tzconfig.json`, `.gitignore`, initial commit). Steps can include an optional `label` shown in generation output.

**Path semantics:** After `createProjectDirectory`, all step paths are relative to the new project root. No `cwd` is needed in pipeline definitions.

**When conditions:** Use `when` at the step level (preferred). All keys must match current answers.

**Backward compatibility:** Existing `options`-based JSON configs still load.

---

## Extending

1. Add a directory under `config/projects/<template-id>/`
2. Add `config.yaml` with `questions` and `pipeline`
3. Optionally add supporting files (e.g. `composer.json`, `src/`) for the `copy` step

User configs in `~/tz/configs/` are also scanned and merged with built-in templates.

---

## Tech stack

- [Ink](https://github.com/vadimdemedes/ink) — React for CLIs
- [@inkjs/ui](https://github.com/vadimdemedes/ink-ui) — Select, TextInput, ConfirmInput, Spinner, Alert
- [Bun](https://bun.sh) — Runtime
- [React](https://react.dev) — UI

---

## License

MIT — Happycoder ©
