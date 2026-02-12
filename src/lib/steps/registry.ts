import type { StepExecutor } from "./types";
import { run } from "./run";
import { copyFiles } from "./copyFiles";
import { modifyFile } from "./modifyFile";
import { finalizeTzProjectSetup } from "./finalizeTzProjectSetup";

export const stepRegistry: Record<string, StepExecutor> = {
  run,
  copy: copyFiles,
  modify: modifyFile,
  finalizeTzProjectSetup,
};
