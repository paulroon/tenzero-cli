import { useEffect, useMemo, useState } from "react";
import { Box, Text } from "ink";
import { Select } from "@inkjs/ui";
import { getErrorMessage } from "@/lib/errors";
import {
  deleteInstalledProjectConfig,
  getInstalledProjectConfigVersion,
  installProjectConfig,
  isProjectConfigInstalled,
  listInstalledProjectConfigs,
  listRemoteProjectConfigs,
} from "@/lib/projectConfigRepo";
import { useBackKey } from "@/hooks/useBackKey";
import {
  OptionLoadingPanel,
  OptionStatusPanel,
} from "@/ui/menu/options/screens/OptionPanels";

type ExistingConfigChoice = "update" | "delete" | "cancel";
const SELECT_PLACEHOLDER = "__select_project_config__";
const DIM_GRAY = "\u001b[90m";
const ANSI_RESET = "\u001b[0m";
const SCREEN_TITLE = "Manage app templates";

function toInstalledVersions(installed: string[]): Record<string, string> {
  return Object.fromEntries(
    installed
      .map((id) => [id, getInstalledProjectConfigVersion(id)])
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

export default function InstallProjectConfigScreen({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<
    "loading" | "select" | "existing-choice" | "working" | "done" | "error"
  >("loading");
  const [remoteConfigs, setRemoteConfigs] = useState<string[]>([]);
  const [installedConfigs, setInstalledConfigs] = useState<string[]>([]);
  const [installedVersions, setInstalledVersions] = useState<Record<string, string>>({});
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyInstalledState = (installed: string[]) => {
    setInstalledConfigs(installed);
    setInstalledVersions(toInstalledVersions(installed));
  };

  const refreshData = async () => {
    setPhase("loading");
    setError(null);
    try {
      const [remote, installed] = await Promise.all([
        listRemoteProjectConfigs(),
        Promise.resolve(listInstalledProjectConfigs()),
      ]);
      setRemoteConfigs(remote);
      applyInstalledState(installed);
      setPhase("select");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load app template list"));
      setPhase("error");
    }
  };

  useEffect(() => {
    void refreshData();
  }, []);

  useBackKey(() => {
    if (phase === "working") return;
    if (phase === "existing-choice") {
      setSelectedConfigId(null);
      setPhase("select");
      return;
    }
    onBack();
  });

  const installedSet = useMemo(() => new Set(installedConfigs), [installedConfigs]);

  const orderedRemoteConfigs = useMemo(() => {
    return [...remoteConfigs].sort((a, b) => {
      const aInstalled = installedSet.has(a);
      const bInstalled = installedSet.has(b);
      if (aInstalled !== bInstalled) return aInstalled ? -1 : 1;
      return a.localeCompare(b);
    });
  }, [remoteConfigs, installedSet]);

  const formatInstalledLabel = (configId: string): string => {
    const version = installedVersions[configId] ?? "?";
    return `✔ ${configId} ${DIM_GRAY}(v ${version})${ANSI_RESET}`;
  };

  const performInstall = async (configId: string, replace: boolean) => {
    setPhase("working");
    setError(null);
    setStatusMessage(null);
    try {
      await installProjectConfig(configId, { replace });
      const installedVersion = getInstalledProjectConfigVersion(configId);
      const versionText = installedVersion ? ` (v ${installedVersion})` : "";
      setStatusMessage(
        replace
          ? `Updated '${configId}'${versionText} in ~/tz/configs`
          : `Installed '${configId}'${versionText} to ~/tz/configs`
      );
      applyInstalledState(listInstalledProjectConfigs());
      setPhase("done");
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("App template already installed:")) {
        setSelectedConfigId(configId);
        setPhase("existing-choice");
        return;
      }
      setError(getErrorMessage(err, "Install failed"));
      setPhase("error");
    }
  };

  const handleConfigSelect = (value: string) => {
    if (value === SELECT_PLACEHOLDER) return;
    setSelectedConfigId(value);
    if (installedSet.has(value) || isProjectConfigInstalled(value)) {
      setPhase("existing-choice");
      return;
    }
    void performInstall(value, false);
  };

  const handleExistingChoice = (choice: ExistingConfigChoice) => {
    if (!selectedConfigId) return;
    if (choice === "cancel") {
      setSelectedConfigId(null);
      setPhase("select");
      return;
    }
    if (choice === "delete") {
      try {
        deleteInstalledProjectConfig(selectedConfigId);
        applyInstalledState(listInstalledProjectConfigs());
        setStatusMessage(`Deleted '${selectedConfigId}' from ~/tz/configs`);
        setPhase("done");
      } catch (err) {
        setError(getErrorMessage(err, "Delete failed"));
        setPhase("error");
      }
      return;
    }
    void performInstall(selectedConfigId, true);
  };

  if (phase === "loading") {
    return <OptionLoadingPanel title={SCREEN_TITLE} spinnerLabel="Loading available app templates" />;
  }

  if (phase === "working") {
    return <OptionLoadingPanel title={SCREEN_TITLE} spinnerLabel="Downloading selected app template" />;
  }

  if (phase === "existing-choice" && selectedConfigId) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">{SCREEN_TITLE}</Text>
        <Text>
          App template '{selectedConfigId}' already exists in ~/tz/configs. What would you like to do?
        </Text>
        <Box marginTop={1}>
          <Select
            options={[
              { label: "Update existing config", value: "update" },
              { label: "Delete existing template", value: "delete" },
              { label: "Cancel", value: "cancel" },
            ]}
            onChange={(value) => handleExistingChoice(value as ExistingConfigChoice)}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <OptionStatusPanel
        title={SCREEN_TITLE}
        variant="error"
        alertTitle="Action failed"
        message={error ?? "Something went wrong"}
        options={[
          { label: "Try again", value: "retry" },
          { label: "Back to options", value: "back" },
        ]}
        onSelect={(value) => {
          if (value === "retry") {
            void refreshData();
          } else {
            onBack();
          }
        }}
      />
    );
  }

  if (phase === "done") {
    return (
      <OptionStatusPanel
        title={SCREEN_TITLE}
        variant="success"
        alertTitle="Completed"
        message={statusMessage ?? "Done"}
        options={[
          { label: "Install or manage another...", value: "again" },
          { label: "Back to options", value: "back" },
        ]}
        onSelect={(value) => {
          if (value === "again") {
            setSelectedConfigId(null);
            setPhase("select");
            return;
          }
          onBack();
        }}
      />
    );
  }

  if (remoteConfigs.length === 0) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">{SCREEN_TITLE}</Text>
        <Text dimColor>No app templates found in repository.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">{SCREEN_TITLE}</Text>
      <Text>Select an app template:</Text>
      <Box marginTop={1}>
        <Select
          defaultValue={SELECT_PLACEHOLDER}
          options={[
            { label: "Select an app template...", value: SELECT_PLACEHOLDER },
            ...orderedRemoteConfigs.map((configId) => ({
              label: installedSet.has(configId) ? formatInstalledLabel(configId) : `  ${configId}`,
              value: configId,
            })),
          ]}
          onChange={handleConfigSelect}
        />
      </Box>
    </Box>
  );
}
