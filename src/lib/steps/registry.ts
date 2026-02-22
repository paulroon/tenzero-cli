import type { StepExecutor } from "./types";
import { run } from "./run";
import { copy } from "./copy";
import { modify } from "./modify";
import { append } from "./append";
import { deleteStep } from "./delete";
import { finalize } from "./finalize";
import { createProjectDirectory } from "./createProjectDirectory";
import { waitForHttp } from "./waitForHttp";

export const stepRegistry: Record<string, StepExecutor> = {
  createProjectDirectory,
  run,
  copy,
  modify,
  append,
  delete: deleteStep,
  waitForHttp,
  finalize,
};
