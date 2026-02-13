import { Box, Text } from "ink";
import { Select } from "@inkjs/ui";
import { useBackKey } from "@/hooks/useBackKey";

export const ROOT_MENU_OPTIONS = [
  { label: "New Project", value: "new-project" },
  { label: "Options...", value: "options" },
  { label: "Open...", value: "open-existing-project" },
  { label: "Exit", value: "exit" },
] as const;

export type RootMenuChoice = (typeof ROOT_MENU_OPTIONS)[number]["value"];

type Props = {
  onSelect: (value: RootMenuChoice) => void;
};

export default function RootMenu({ onSelect }: Props) {
  useBackKey(() => onSelect("exit"));
  return (
    <Box flexDirection="column" padding={1}>
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
    </Box>
  );
}
