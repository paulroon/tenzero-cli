import { useState } from "react";
import { Box, Text } from "ink";
import { Select } from "@inkjs/ui";
import { type TzConfig } from "@/lib/config";
import { useBackKey } from "@/hooks/useBackKey";
import SecretsScreen from "@/ui/menu/options/SecretsScreen";
import ConfigScreen from "@/ui/menu/options/screens/ConfigScreen";
import InstallProjectConfigScreen from "@/ui/menu/options/screens/InstallProjectConfigScreen";
import DeploymentsScreen from "@/ui/menu/options/screens/DeploymentsScreen";

const OPTIONS_MENU_ITEMS = [
    { label: "Config", value: "config" },
    { label: "Secrets", value: "manage-secrets" },
    { label: "App Templates", value: "install-project-config" },
    { label: "Deployments", value: "deployments" },
] as const;

type OptionChoice = (typeof OPTIONS_MENU_ITEMS)[number]["value"];

type Props = {
    config: TzConfig;
    onBack: () => void;
    projectDirectory: string;
    onConfigUpdate?: (config: TzConfig) => void;
};

export default function OptionsHandler({
  config,
  onBack,
  onConfigUpdate,
}: Props) {
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

  switch (choice) {
    case "config":
      return (
        <ConfigScreen
          config={config}
          onBack={() => setChoice(null)}
          onConfigUpdate={onConfigUpdate}
        />
      );
    case "install-project-config":
      return <InstallProjectConfigScreen onBack={() => setChoice(null)} />;
    case "manage-secrets":
      return <SecretsScreen onBack={() => setChoice(null)} />;
    case "deployments":
      return (
        <DeploymentsScreen
          config={config}
          onBack={() => setChoice(null)}
          onConfigUpdate={onConfigUpdate}
        />
      );
    default:
      return null;
  }
}
