import { useEffect, useState } from "react";
import { Box, Text, useApp } from "ink";
import { Alert, Spinner } from "@inkjs/ui";
import {
  CurrentProjectProvider,
  useCurrentProject,
} from "@/contexts/CurrentProjectContext";
import { useConfig } from "@/hooks/useConfig";
import { useDependencyCheck } from "@/hooks/useDependencyCheck";
import AppLayout from "@/ui/components/AppLayout";
import ConfigSetup from "@/ui/ConfigSetup";
import Dashboard from "@/ui/Dashboard";
import RootMenu, { type RootMenuChoice } from "@/ui/menu/RootMenu";
import { menuHandlers } from "@/ui/menu/handlers";
import { clearScreen } from "@/lib/common";
import { getInkInstance } from "@/lib/inkInstance";

const ROOT_MENU_SCREEN = "root-menu";

function AppContent() {
  const { status: depsStatus, failedDeps } = useDependencyCheck();
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
    if (depsStatus === "loading") {
      return (
        <Box flexDirection="column" padding={1}>
          <Spinner label="Checking dependencies" />
        </Box>
      );
    }

    if (depsStatus === "failed") {
      return (
        <>
          {failedDeps.map((dep) => (
            <Box key={dep.name} flexDirection="column" gap={0} marginBottom={1}>
              <Alert variant="error" title={`${dep.name} not found`}>
                {dep.name} is required but was not found on your system.
              </Alert>
              <Box marginTop={1} flexDirection="column" gap={0}>
                {dep.instructions.map((line, i) => (
                  <Text key={i} dimColor={!!line}>
                    {line || " "}
                  </Text>
                ))}
              </Box>
            </Box>
          ))}
        </>
      );
    }

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
    if (depsStatus === "loading") return "Loading";
    if (depsStatus === "failed") return "Error";
    if (state.status === "loading") return "Loading";
    if (state.status === "missing") return "Setup";
    if (currentProject) return `Project: ${currentProject.name}`;
    if (screen === ROOT_MENU_SCREEN) return "Ready";
    return "Ready";
  };

  const getFooterLeft = () => {
    const isAtRoot =
      depsStatus !== "ok" ||
      state.status === "loading" ||
      state.status === "missing" ||
      (screen === ROOT_MENU_SCREEN && !currentProject);
    if (screen === ROOT_MENU_SCREEN && !currentProject && state.status === "ready")
      return "(Esc) exit";
    if (currentProject) {
      const launchHint =
        currentProject.builderAnswers?.dockerize === "yes"
          ? "  (l) launch"
          : "";
      return `(Esc) back  (o) open in editor${launchHint}`;
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
