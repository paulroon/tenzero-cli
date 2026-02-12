import { Box, Text, Spacer } from "ink";

type Props = {
  headerTitle: string;
  status: string;
};

export default function LayoutHeader({ headerTitle, status }: Props) {
  return (
    <Box flexDirection="column" padding={0} gap={0}>
      <Box flexDirection="row" padding={0}>
        <Text bold color="yellow">
          {headerTitle}
        </Text>
        <Spacer />
        <Text color="green">{status}</Text>
      </Box>
    </Box>
  );
}
