import { mkdirSync } from "node:fs";
import type { StepExecutor } from "./types";

export const createProjectDirectory: StepExecutor = async (ctx) => {
  mkdirSync(ctx.projectPath, { recursive: true });
};
