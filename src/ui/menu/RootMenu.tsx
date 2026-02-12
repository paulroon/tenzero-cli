import { Box, Text } from "ink";
import MenuBox from "@/ui/components/MenuBox";
import { Alert, Select } from "@inkjs/ui";
import { useConfig } from "@/hooks/useConfig";

export const ROOT_MENU_OPTIONS = [
  { label: "New Project", value: "new-project" },
  { label: "Options...", value: "options" },
  { label: "Open...", value: "open-existing-project" },
] as const;

export type RootMenuChoice = (typeof ROOT_MENU_OPTIONS)[number]["value"];

type Props = {
  onSelect: (value: RootMenuChoice) => void;
};

export default function RootMenu({ onSelect }: Props) {
  const [state] = useConfig();
  if (state.status === "missing") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">TenZero CLI</Text>
        <Alert variant="error" title="No config found">
          No config found. Please run `tz config`.
        </Alert>
      </Box>
    );
  }
  return state.status === "ready" ? (
    <MenuBox flexDirection="column" padding={1}>
      <Text color="yellow">Main Menu</Text>
      <Text>Choose an option:</Text>
      <Box marginTop={1}>
        <Select
          options={ROOT_MENU_OPTIONS.map((o) => ({
            label: o.label,
            value: o.value,
          }))}
          visibleOptionCount={5}
          onChange={(value) => onSelect(value as RootMenuChoice)}
        />
      </Box>
    </MenuBox>
  ) : null;
}
