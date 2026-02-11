import { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { Spinner } from "@inkjs/ui";
import {
  CurrentProjectProvider,
  useCurrentProject,
} from "@/contexts/CurrentProjectContext";
import { InputModeProvider, useInputMode } from "@/contexts/InputModeContext";
import { LoadingProvider } from "@/contexts/LoadingContext";
import { useConfig } from "@/hooks/useConfig";
import AppLayout from "@/ui/components/AppLayout";
import ConfigSetup from "@/ui/ConfigSetup";
import System from "@/ui/System";
import ProjectScreen from "@/ui/ProjectScreen";
import RootMenu, { type RootMenuChoice } from "@/ui/menu/RootMenu";
import { menuHandlers } from "@/ui/menu/handlers";
import { clearScreen } from "@/lib/common";

const EXIT_KEYS = ["x", "X"];

const ROOT_MENU_SCREEN = "root-menu";

function AppContent() {
  const [state, setConfig] = useConfig();
  const [screen, setScreen] = useState<
    typeof ROOT_MENU_SCREEN | RootMenuChoice
  >(ROOT_MENU_SCREEN);
  const { exit } = useApp();
  const { inputMode } = useInputMode();
  const { currentProject, setCurrentProjectFromPath } = useCurrentProject();

  useInput(
    (input) => {
      if (!inputMode && EXIT_KEYS.includes(input)) {
        clearScreen();
        exit();
      }
    },
    { isActive: true }
  );

  const renderMain = () => {
    if (state.status === "loading") {
      return (
        <Box flexDirection="column" padding={1}>
          <Spinner label="Loading" />
        </Box>
      );
    }
    if (state.status === "missing") {
      return <ConfigSetup onComplete={setConfig} />;
    }
    if (currentProject) {
      return <ProjectScreen onBack={() => setScreen(ROOT_MENU_SCREEN)} />;
    }
    if (screen === ROOT_MENU_SCREEN) {
      return <RootMenu onSelect={(value) => setScreen(value)} />;
    }
    if (state.status === "ready") {
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
    if (state.status === "loading" || state.status === "missing")
      return "(x) exit";
    if (currentProject || screen !== ROOT_MENU_SCREEN) {
      return "(x) exit  (b) back  (Esc) back";
    }
    return "(x) exit";
  };

  return (
    <System>
      <AppLayout
        headerTitle={getHeaderTitle()}
        status={getStatus()}
        footerLeft={getFooterLeft()}
      >
        {renderMain()}
      </AppLayout>
    </System>
  );
}

export default function App() {
  return (
    <LoadingProvider>
      <InputModeProvider>
        <CurrentProjectProvider>
          <AppContent />
        </CurrentProjectProvider>
      </InputModeProvider>
    </LoadingProvider>
  );
}
