import type { ComponentType } from "react";
import type { RootMenuChoice } from "./RootMenu";
import type { TzConfig } from "../../lib/config";
import SymfonyHandler from "./symfony";
import NextJsHandler from "./nextjs";
import OptionsHandler from "./options";
import OpenExistingProjectHandler from "./open-existing-project";

type HandlerProps = {
  config: TzConfig;
  onBack: () => void;
  projectDirectory: string;
  onConfigUpdate?: (config: TzConfig) => void;
  onProjectSelect?: (projectPath: string) => void;
};

/** Handler map: each menu choice maps to a component */
export const menuHandlers: Record<
  RootMenuChoice,
  ComponentType<HandlerProps>
> = {
  symfony: SymfonyHandler,
  nextjs: NextJsHandler,
  options: OptionsHandler,
  "open-existing-project": OpenExistingProjectHandler,
};
