import { useState } from "react";
import { Box, Text } from "ink";
import { Select } from "@inkjs/ui";
import type { TzConfig } from "@/lib/config";
import { useBackKey } from "@/hooks/useBackKey";
import ConfigSetup from "@/ui/ConfigSetup";

const OPTIONS_MENU_ITEMS = [
  { label: "View Config", value: "view-config" },
  { label: "Edit Config", value: "edit-config" },
] as const;

type OptionChoice = (typeof OPTIONS_MENU_ITEMS)[number]["value"];

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

  return null;
}
