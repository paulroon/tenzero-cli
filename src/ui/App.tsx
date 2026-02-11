import { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { Spinner } from "@inkjs/ui";
import { CurrentProjectProvider, useCurrentProject } from "@/contexts/CurrentProjectContext";
import { InputModeProvider, useInputMode } from "@/contexts/InputModeContext";
import { useConfig } from "@/hooks/useConfig";
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

  return (
    <System>
      {state.status === "loading" ? (
        <Box flexDirection="column" padding={1}>
          <Text color="yellow">TenZero CLI</Text>
          <Spinner label="Loading" />
        </Box>
      ) : state.status === "missing" ? (
        <>
          <ConfigSetup onComplete={setConfig} />
          <Box marginTop={1}>
            <Text dimColor>(x) exit</Text>
          </Box>
        </>
      ) : currentProject ? (
        <>
          <Box flexDirection="column" padding={1}>
            <ProjectScreen onBack={() => setScreen(ROOT_MENU_SCREEN)} />
          </Box>
          <Box marginTop={1} flexShrink={0}>
            <Text dimColor>(x) exit  (b) back  (Esc) back</Text>
          </Box>
        </>
      ) : (
        <>
          {screen === ROOT_MENU_SCREEN && (
            <RootMenu onSelect={(value) => setScreen(value)} />
          )}
          {screen !== ROOT_MENU_SCREEN && state.status === "ready" && (
            <Box flexDirection="column" padding={1}>
              {(() => {
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
              })()}
            </Box>
          )}
          <Box marginTop={1} flexShrink={0}>
            <Text dimColor>
              (x) exit
              {screen !== ROOT_MENU_SCREEN ? "  (b) back  (Esc) back" : ""}
            </Text>
          </Box>
        </>
      )}
    </System>
  );
}

export default function App() {
  return (
    <InputModeProvider>
      <CurrentProjectProvider>
        <AppContent />
      </CurrentProjectProvider>
    </InputModeProvider>
  );
}
