import { useEffect, useState } from "react";
import { useApp } from "ink";
import { Spinner } from "@inkjs/ui";
import {
  CurrentProjectProvider,
  useCurrentProject,
} from "@/contexts/CurrentProjectContext";
import { useConfig } from "@/hooks/useConfig";
import AppLayout from "@/ui/components/AppLayout";
import ConfigSetup from "@/ui/ConfigSetup";
import Dashboard from "@/ui/Dashboard";
import RootMenu, { type RootMenuChoice } from "@/ui/menu/RootMenu";
import { menuHandlers } from "@/ui/menu/handlers";
import { clearScreen } from "@/lib/common";
import { getInkInstance } from "@/lib/inkInstance";

const ROOT_MENU_SCREEN = "root-menu";

function isDockerizedValue(value: unknown): boolean {
  return value === "yes" || value === "true";
}

function AppContent() {
  const [state, setConfig] = useConfig();
  const [screen, setScreen] = useState<
    typeof ROOT_MENU_SCREEN | RootMenuChoice
  >(ROOT_MENU_SCREEN);
  const { exit } = useApp();
  const { currentProject, setCurrentProjectFromPath } = useCurrentProject();

  const exitApp = () => {
    getInkInstance()?.clear();
    clearScreen();
    exit();
    process.exit(0);
  };

  useEffect(() => {
    const handler = () => exitApp();
    process.on("SIGINT", handler);
    return () => {
      process.off("SIGINT", handler);
    };
  }, [exit]);

  const renderMain = () => {
    if (state.status === "loading") {
      return <Spinner label="Loading" />;
    }
    if (state.status === "missing") {
      return <ConfigSetup onComplete={setConfig} />;
    }
    if (currentProject && state.status === "ready") {
      return (
        <Dashboard
          config={state.config}
          onBack={() => setScreen(ROOT_MENU_SCREEN)}
          onConfigUpdate={setConfig}
        />
      );
    }
    if (screen === ROOT_MENU_SCREEN) {
      return (
        <RootMenu
          onSelect={(value) => {
            if (value === "exit") exitApp();
            else setScreen(value);
          }}
        />
      );
    }
    if (state.status === "ready" && screen !== "exit") {
      const Handler = menuHandlers[screen];
      const { config } = state;
      return (
        <Handler
          config={config}
          onBack={() => setScreen(ROOT_MENU_SCREEN)}
          projectDirectory={config.projectDirectory}
          onConfigUpdate={setConfig}
          onProjectSelect={(path) => setCurrentProjectFromPath(path)}
        />
      );
    }
    return null;
  };

  const getHeaderTitle = () => {
    if (state.status === "ready") return `TenZero CLI [${state.config.name}]`;
    return "TenZero CLI";
  };

  const getStatus = () => {
    if (state.status === "loading") return "Loading";
    if (state.status === "missing") return "Setup";
    if (currentProject) return `Project: ${currentProject.name}`;
    if (screen === ROOT_MENU_SCREEN) return "Ready";
    return "Ready";
  };

  const getFooterLeft = () => {
    const isAtRoot =
      state.status === "loading" ||
      state.status === "missing" ||
      (screen === ROOT_MENU_SCREEN && !currentProject);
    if (screen === ROOT_MENU_SCREEN && !currentProject && state.status === "ready")
      return "(Esc) exit";
    if (currentProject) {
      const isDockerized = isDockerizedValue(currentProject.builderAnswers?.dockerize);
      const hints = isDockerized ? "  (o) open  (s) shell" : "";
      return `(Esc) back  (e) editor${hints}`;
    }
    return isAtRoot ? "" : "(Esc) back";
  };

  return (
    <AppLayout
      headerTitle={getHeaderTitle()}
      status={getStatus()}
      footerLeft={getFooterLeft()}
    >
      {renderMain()}
    </AppLayout>
  );
}

export default function App() {
  return (
    <CurrentProjectProvider>
      <AppContent />
    </CurrentProjectProvider>
  );
}
