import { useState } from "react";
import { Box, Text } from "ink";
import { Select, TextInput } from "@inkjs/ui";
import { DEFAULT_EDITOR, saveConfig, syncProjects, type TzConfig } from "@/lib/config";
import { useBackKey } from "@/hooks/useBackKey";
import { OptionStatusPanel } from "@/ui/menu/options/screens/OptionPanels";

type ConfigField =
  | "name"
  | "email"
  | "projectDirectory"
  | "editor"
  | "allowShellSyntax";

export default function ConfigScreen({
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
          ? next || DEFAULT_EDITOR
          : field === "allowShellSyntax"
            ? next === true || next === "true"
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
      <OptionStatusPanel
        title="Config"
        variant="success"
        alertTitle="Completed"
        message={statusMessage ?? "Updated."}
      />
    );
  }

  if (phase === "error") {
    return (
      <OptionStatusPanel
        title="Config"
        variant="error"
        alertTitle="Update failed"
        message={errorMessage ?? "Could not update config."}
      />
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
              label: `Allow shell syntax without prompt: ${config.allowShellSyntax ? "Yes" : "No"}`,
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
