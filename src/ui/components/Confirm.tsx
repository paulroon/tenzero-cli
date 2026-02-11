import { Box, Text } from "ink";
import { ConfirmInput } from "@inkjs/ui";

type Props = {
  message: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  defaultChoice?: "confirm" | "cancel";
};

export default function Confirm({
  message,
  onConfirm,
  onCancel,
  defaultChoice = "cancel",
}: Props) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text>{message}</Text>
      <ConfirmInput
        onConfirm={onConfirm}
        onCancel={onCancel}
        defaultChoice={defaultChoice}
      />
    </Box>
  );
}
