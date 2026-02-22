import { useEffect, useMemo, useState } from "react";
import { Box, Text } from "ink";
import { Alert, Select, Spinner } from "@inkjs/ui";
import { DEFAULT_EDITOR, type TzConfig } from "@/lib/config";
import {
  deleteInstalledProjectConfig,
  getInstalledProjectConfigVersion,
  installProjectConfig,
  isProjectConfigInstalled,
  listInstalledProjectConfigs,
  listRemoteProjectConfigs,
} from "@/lib/projectConfigRepo";
import { useBackKey } from "@/hooks/useBackKey";
import ConfigSetup from "@/ui/ConfigSetup";
import SecretsScreen from "@/ui/menu/options/SecretsScreen";

const OPTIONS_MENU_ITEMS = [
  { label: "View Config", value: "view-config" },
  { label: "Edit Config", value: "edit-config" },
  { label: "Manage secrets", value: "manage-secrets" },
  { label: "Install project config", value: "install-project-config" },
] as const;

type OptionChoice = (typeof OPTIONS_MENU_ITEMS)[number]["value"];
type ExistingConfigChoice = "update" | "delete" | "cancel";
const SELECT_PLACEHOLDER = "__select_project_config__";
const DIM_GRAY = "\u001b[90m";
const ANSI_RESET = "\u001b[0m";

function InstallProjectConfigScreen({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<
    "loading" | "select" | "existing-choice" | "working" | "done" | "error"
  >("loading");
  const [remoteConfigs, setRemoteConfigs] = useState<string[]>([]);
  const [installedConfigs, setInstalledConfigs] = useState<string[]>([]);
  const [installedVersions, setInstalledVersions] = useState<Record<string, string>>(
    {}
  );
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshData = async () => {
    setPhase("loading");
    setError(null);
    try {
      const [remote, installed] = await Promise.all([
        listRemoteProjectConfigs(),
        Promise.resolve(listInstalledProjectConfigs()),
      ]);
      setRemoteConfigs(remote);
      setInstalledConfigs(installed);
      setInstalledVersions(
        Object.fromEntries(
          installed
            .map((id) => [id, getInstalledProjectConfigVersion(id)])
            .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        )
      );
      setPhase("select");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load project config list"
      );
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

  const installedSet = useMemo(
    () => new Set(installedConfigs),
    [installedConfigs]
  );

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
    return `✅ ${configId} ${DIM_GRAY}(v ${version})${ANSI_RESET}`;
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
      const installed = listInstalledProjectConfigs();
      setInstalledConfigs(installed);
      setInstalledVersions(
        Object.fromEntries(
          installed
            .map((id) => [id, getInstalledProjectConfigVersion(id)])
            .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        )
      );
      setPhase("done");
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.startsWith("Config already installed:")
      ) {
        setSelectedConfigId(configId);
        setPhase("existing-choice");
        return;
      }
      setError(err instanceof Error ? err.message : "Install failed");
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
        const installed = listInstalledProjectConfigs();
        setInstalledConfigs(installed);
        setInstalledVersions(
          Object.fromEntries(
            installed
              .map((id) => [id, getInstalledProjectConfigVersion(id)])
              .filter((entry): entry is [string, string] => typeof entry[1] === "string")
          )
        );
        setStatusMessage(`Deleted '${selectedConfigId}' from ~/tz/configs`);
        setPhase("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
        setPhase("error");
      }
      return;
    }
    void performInstall(selectedConfigId, true);
  };

  if (phase === "loading") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Install project config</Text>
        <Spinner label="Loading available project configs" />
      </Box>
    );
  }

  if (phase === "working") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Install project config</Text>
        <Spinner label="Downloading selected project config" />
      </Box>
    );
  }

  if (phase === "existing-choice" && selectedConfigId) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Install project config</Text>
        <Text>
          '{selectedConfigId}' already exists in ~/tz/configs. What would you like
          to do?
        </Text>
        <Box marginTop={1}>
          <Select
            options={[
              { label: "Update existing config", value: "update" },
              { label: "Delete existing config", value: "delete" },
              { label: "Cancel", value: "cancel" },
            ]}
            onChange={(value) =>
              handleExistingChoice(value as ExistingConfigChoice)
            }
          />
        </Box>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Install project config</Text>
        <Alert variant="error" title="Action failed">
          {error ?? "Something went wrong"}
        </Alert>
        <Box marginTop={1}>
          <Select
            options={[
              { label: "Try again", value: "retry" },
              { label: "Back to options", value: "back" },
            ]}
            onChange={(value) => {
              if (value === "retry") {
                void refreshData();
              } else {
                onBack();
              }
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "done") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Install project config</Text>
        <Alert variant="success" title="Completed">
          {statusMessage ?? "Done"}
        </Alert>
        <Box marginTop={1}>
          <Select
            options={[
              { label: "Install or manage another...", value: "again" },
              { label: "Back to options", value: "back" },
            ]}
            onChange={(value) => {
              if (value === "again") {
                setSelectedConfigId(null);
                setPhase("select");
                return;
              }
              onBack();
            }}
          />
        </Box>
      </Box>
    );
  }

  if (remoteConfigs.length === 0) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Install project config</Text>
        <Text dimColor>No project configs found in repository.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">Install project config</Text>
      <Text>Select a project config:</Text>
      <Box marginTop={1}>
        <Select
          defaultValue={SELECT_PLACEHOLDER}
          options={[
            { label: "Select a project config...", value: SELECT_PLACEHOLDER },
            ...orderedRemoteConfigs.map((configId) => ({
              label: installedSet.has(configId)
                ? formatInstalledLabel(configId)
                : `  ${configId}`,
              value: configId,
            })),
          ]}
          onChange={handleConfigSelect}
        />
      </Box>
    </Box>
  );
}

type Props = {
  config: TzConfig;
  onBack: () => void;
  projectDirectory: string;
  onConfigUpdate?: (config: TzConfig) => void;
};

export default function OptionsHandler({ config, onBack, onConfigUpdate }: Props) {
  const [choice, setChoice] = useState<OptionChoice | null>(null);

  useBackKey(() => {
    if (choice === null) onBack();
    else setChoice(null);
  });

  if (choice === null) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Options</Text>
        <Text>Choose an option:</Text>
        <Box marginTop={1}>
          <Select
            options={OPTIONS_MENU_ITEMS.map((o) => ({
              label: o.label,
              value: o.value,
            }))}
            onChange={(value) => setChoice(value as OptionChoice)}
          />
        </Box>
      </Box>
    );
  }

  if (choice === "view-config") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">View Config</Text>
        <Box flexDirection="column" padding={1}>
          <Text>
            <Text bold>Name: </Text>
            {config.name}
          </Text>
          <Text>
            <Text bold>Email: </Text>
            {config.email || "(not set)"}
          </Text>
          <Text>
            <Text bold>Project Directory: </Text>
            {config.projectDirectory}
          </Text>
          <Text>
            <Text bold>Editor: </Text>
            {config.editor || DEFAULT_EDITOR}
          </Text>
        </Box>
      </Box>
    );
  }

  if (choice === "edit-config") {
    return (
      <ConfigSetup
        initialConfig={config}
        onComplete={(newConfig) => {
          onConfigUpdate?.(newConfig);
          setChoice(null);
        }}
      />
    );
  }

  if (choice === "install-project-config") {
    return <InstallProjectConfigScreen onBack={() => setChoice(null)} />;
  }

  if (choice === "manage-secrets") {
    return <SecretsScreen onBack={() => setChoice(null)} />;
  }

  return null;
}
