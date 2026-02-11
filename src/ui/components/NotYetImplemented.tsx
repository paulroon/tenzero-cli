import { Box } from "ink";
import { Alert } from "@inkjs/ui";

type Props = {
  message?: string;
};

export default function NotYetImplemented({ message = "Not yet implemented" }: Props) {
  return (
    <Box flexDirection="column" padding={1}>
      <Alert variant="warning">{message}</Alert>
    </Box>
  );
}
