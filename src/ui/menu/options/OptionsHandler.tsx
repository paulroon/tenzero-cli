import { useEffect, useMemo, useState } from "react";
import { Box, Text } from "ink";
import { Alert, Select, Spinner, TextInput } from "@inkjs/ui";
import {
  DEFAULT_EDITOR,
  saveConfig,
  syncProjects,
  type TzConfig,
} from "@/lib/config";
import {
  deleteInstalledProjectConfig,
  getInstalledProjectConfigVersion,
  installProjectConfig,
  isProjectConfigInstalled,
  listInstalledProjectConfigs,
  listRemoteProjectConfigs,
} from "@/lib/projectConfigRepo";
import { useBackKey } from "@/hooks/useBackKey";
import SecretsScreen from "@/ui/menu/options/SecretsScreen";

const OPTIONS_MENU_ITEMS = [
  { label: "Config", value: "config" },
  { label: "Secrets", value: "manage-secrets" },
  { label: "App Templates", value: "install-project-config" },
] as const;

type OptionChoice = (typeof OPTIONS_MENU_ITEMS)[number]["value"];
type ExistingConfigChoice = "update" | "delete" | "cancel";
const SELECT_PLACEHOLDER = "__select_project_config__";
const DIM_GRAY = "\u001b[90m";
const ANSI_RESET = "\u001b[0m";

type ConfigField =
  | "name"
  | "email"
  | "projectDirectory"
  | "editor"
  | "allowShellSyntax";

function ConfigScreen({
  config,
  onBack,
  onConfigUpdate,
}: {
  config: TzConfig;
  onBack: () => void;
  onConfigUpdate?: (config: TzConfig) => void;
}) {
  const [phase, setPhase] = useState<"menu" | "edit" | "done" | "error">("menu");
  const [selectedField, setSelectedField] = useState<ConfigField | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useBackKey(() => {
    if (phase === "edit") {
      setSelectedField(null);
      setPhase("menu");
      return;
    }
    if (phase === "done" || phase === "error") {
      setPhase("menu");
      return;
    }
    onBack();
  });

  const currentValue = (field: ConfigField): string => {
    if (field === "editor") return config.editor || DEFAULT_EDITOR;
    if (field === "allowShellSyntax") return config.allowShellSyntax ? "true" : "false";
    return config[field] || "";
  };

  const fieldLabel = (field: ConfigField): string => {
    switch (field) {
      case "name":
        return "Name";
      case "email":
        return "Email";
      case "projectDirectory":
        return "Project Directory";
      case "editor":
        return "Editor";
      case "allowShellSyntax":
        return "Allow shell syntax without prompt";
    }
  };

  const saveField = (field: ConfigField, value: string | boolean) => {
    const next = typeof value === "string" ? value.trim() : value;
    if (field === "name" && !next) {
      setErrorMessage("Name cannot be empty.");
      setPhase("error");
      return;
    }
    const updatedBase: TzConfig = {
      ...config,
      [field]:
        field === "editor"
          ? (next || DEFAULT_EDITOR)
          : field === "allowShellSyntax"
            ? (next === true || next === "true")
            : next,
    };
    const updated = syncProjects(updatedBase);
    saveConfig(updated);
    onConfigUpdate?.(updated);
    setStatusMessage(`Updated ${fieldLabel(field)}.`);
    setSelectedField(null);
    setPhase("done");
  };

  if (phase === "edit" && selectedField) {
    if (selectedField === "allowShellSyntax") {
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="yellow">Config</Text>
          <Text>Allow shell syntax commands without confirmation prompts?</Text>
          <Box marginTop={1}>
            <Select
              defaultValue={currentValue(selectedField)}
              options={[
                { label: "No (recommended)", value: "false" },
                { label: "Yes (always allow)", value: "true" },
              ]}
              onChange={(value) => saveField(selectedField, value === "true")}
            />
          </Box>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Config</Text>
        <Text>Update {fieldLabel(selectedField)}:</Text>
        <Box marginTop={1}>
          <TextInput
            defaultValue={currentValue(selectedField)}
            placeholder={fieldLabel(selectedField)}
            onSubmit={(value) => saveField(selectedField, value)}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "done") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Config</Text>
        <Alert variant="success" title="Completed">
          {statusMessage ?? "Updated."}
        </Alert>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Config</Text>
        <Alert variant="error" title="Update failed">
          {errorMessage ?? "Could not update config."}
        </Alert>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">Config</Text>
      <Text>Choose a value to update:</Text>
      <Box marginTop={1}>
        <Select
          options={[
            { label: `Name: ${config.name}`, value: "name" },
            { label: `Email: ${config.email || "(not set)"}`, value: "email" },
            { label: `Project Directory: ${config.projectDirectory}`, value: "projectDirectory" },
            { label: `Editor: ${config.editor || DEFAULT_EDITOR}`, value: "editor" },
            {
              label: `Allow shell syntax without prompt: ${
                config.allowShellSyntax ? "Yes" : "No"
              }`,
              value: "allowShellSyntax",
            },
            { label: "Back to options", value: "__back__" },
          ]}
          onChange={(value) => {
            if (value === "__back__") {
              onBack();
              return;
            }
            setSelectedField(value as ConfigField);
            setPhase("edit");
          }}
        />
      </Box>
    </Box>
  );
}

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
        err instanceof Error ? err.message : "Failed to load app template list"
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
        err.message.startsWith("App template already installed:")
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
        <Text color="yellow">Manage app templates</Text>
        <Spinner label="Loading available app templates" />
      </Box>
    );
  }

  if (phase === "working") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Manage app templates</Text>
        <Spinner label="Downloading selected app template" />
      </Box>
    );
  }

  if (phase === "existing-choice" && selectedConfigId) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Manage app templates</Text>
        <Text>
          App template '{selectedConfigId}' already exists in ~/tz/configs. What would you like
          to do?
        </Text>
        <Box marginTop={1}>
          <Select
            options={[
              { label: "Update existing config", value: "update" },
              { label: "Delete existing template", value: "delete" },
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
        <Text color="yellow">Manage app templates</Text>
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
        <Text color="yellow">Manage app templates</Text>
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
        <Text color="yellow">Manage app templates</Text>
        <Text dimColor>No app templates found in repository.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">Manage app templates</Text>
      <Text>Select an app template:</Text>
      <Box marginTop={1}>
        <Select
          defaultValue={SELECT_PLACEHOLDER}
          options={[
            { label: "Select an app template...", value: SELECT_PLACEHOLDER },
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

  if (choice === "config") {
    return (
      <ConfigScreen
        config={config}
        onBack={() => setChoice(null)}
        onConfigUpdate={onConfigUpdate}
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
