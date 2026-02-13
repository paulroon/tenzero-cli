import type { StepExecutor } from "./types";
import { run } from "./run";
import { copy } from "./copy";
import { modify } from "./modify";
import { append } from "./append";
import { deleteStep } from "./delete";
import { finalize } from "./finalize";
import { createProjectDirectory } from "./createProjectDirectory";

export const stepRegistry: Record<string, StepExecutor> = {
  createProjectDirectory,
  run,
  copy,
  modify,
  append,
  delete: deleteStep,
  finalize,
};
