import type { StepExecutor } from "./types";
import { run } from "./run";
import { copy } from "./copy";
import { modify } from "./modify";
import { finalize } from "./finalize";

export const stepRegistry: Record<string, StepExecutor> = {
  run,
  copy,
  modify,
  finalize,
};
