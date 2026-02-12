import type { ComponentType } from "react";
import type { RootMenuChoice } from "@/ui/menu/RootMenu";
import type { TzConfig } from "@/lib/config";
import ProjectBuilder from "@/ui/menu/new-project";
import OptionsHandler from "@/ui/menu/options";
import OpenExistingProjectHandler from "@/ui/menu/open-existing-project";

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
  "new-project": ProjectBuilder,
  options: OptionsHandler,
  "open-existing-project": OpenExistingProjectHandler,
};
