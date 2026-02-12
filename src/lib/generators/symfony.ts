import type { ProjectBuilderAnswers } from "@/lib/generators/types";

export async function createSymfonyApp(
  projectDirectory: string,
  projectName: string,
  _answers: ProjectBuilderAnswers
): Promise<void> {
  const proc = Bun.spawn(["symfony", "new", "--webapp", projectName], {
    cwd: projectDirectory,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`symfony new exited with code ${exitCode}`);
  }
}
