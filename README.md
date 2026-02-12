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
- **Profile interpolation** — Your name and email from `~/.tz.json` are injected into project configs (e.g. Composer author)
- **Conditional steps** — Use `when` conditions so questions and pipeline steps only run when needed
- **User & custom configs** — Built-in templates in `config/projects/`, extensible via `~/.tz/configs/`
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

**First run:** You’ll be prompted for your name, email, and project directory (default: `~/Projects`). This is stored in `~/.tz.json`.

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

### User profile (`~/.tz.json`)

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

Project templates live under `config/projects/<id>/`. Each has a `config.json`:

```json
{
  "label": "Symfony Web App",
  "type": "symfony",
  "options": {
    "projectName": { "label": "Project name", "type": "text", "default": "" },
    "symfonyAuth": {
      "label": "Auth type",
      "type": "select",
      "options": [
        { "label": "No auth", "value": "no-auth" },
        { "label": "Simple auth", "value": "simple-auth" }
      ],
      "default": "no-auth",
      "when": { "projectType": "symfony" }
    }
  },
  "pipeline": [
    { "type": "run", "config": { "command": "symfony new --webapp %projectName%", "cwd": "." } }
  ]
}
```

**Interpolation:** Use `%projectName%`, `%profile.name%`, `%profile.email%` (and `{{key}}`) in commands and copied files. Set `interpolate: true` on a `copy` step to process file contents.

**Pipeline steps:** `run`, `copy`, `modify`, plus an implied `finalize` (git init, `.tzconfig.json`, `.gitignore`, initial commit).

---

## Extending

1. Add a directory under `config/projects/<template-id>/`
2. Add `config.json` with `options` and `pipeline`
3. Optionally add supporting files (e.g. `composer.json`, `src/`) for the `copy` step

User configs in `~/.tz/configs/` are also scanned and merged with built-in templates.

---

## Tech stack

- [Ink](https://github.com/vadimdemedes/ink) — React for CLIs
- [@inkjs/ui](https://github.com/vadimdemedes/ink-ui) — Select, TextInput, ConfirmInput, Spinner, Alert
- [Bun](https://bun.sh) — Runtime
- [React](https://react.dev) — UI

---

## License

MIT — Happycoder ©
