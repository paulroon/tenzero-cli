/**
 * Holds the project path to restore when resuming the CLI after a shell session
 * (e.g. after docker compose exec). Consumed once on next render.
 */
let resumeProjectPath: string | null = null;

export function setResumeProjectPath(path: string): void {
  resumeProjectPath = path;
}

export function consumeResumeProjectPath(): string | null {
  const path = resumeProjectPath;
  resumeProjectPath = null;
  return path;
}
