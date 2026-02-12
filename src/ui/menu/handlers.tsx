import type { ComponentType } from "react";
import type { RootMenuChoice } from "@/ui/menu/RootMenu";
import type { TzConfig } from "@/lib/config";
import ProjectBuilder from "@/ui/menu/new-project/ProjectBuilder";
import OptionsHandler from "@/ui/menu/options/OptionsHandler";
import OpenExistingProjectHandler from "@/ui/menu/open-existing-project/OpenExistingProjectHandler";

type HandlerProps = {
  config: TzConfig;
  onBack: () => void;
  projectDirectory: string;
  onConfigUpdate?: (config: TzConfig) => void;
  onProjectSelect?: (projectPath: string) => void;
};

/** Handler map: menu choices that have screens (excludes Exit) */
export const menuHandlers: Record<
  Exclude<RootMenuChoice, "exit">,
  ComponentType<HandlerProps>
> = {
  "new-project": ProjectBuilder,
  options: OptionsHandler,
  "open-existing-project": OpenExistingProjectHandler,
};
