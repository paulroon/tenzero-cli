import { Box, Text, Spacer } from "ink";

function formatFooterRight(): string {
  const now = new Date();
  const dateTime = now.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
  return `Happycoder © ${now.getFullYear()}  ${dateTime}`;
}

type Props = {
  footerLeft: string;
};

export default function LayoutFooter({ footerLeft }: Props) {
  return (
    <Box flexDirection="row" marginTop={0} flexShrink={0}>
      <Text dimColor>{footerLeft}</Text>
      <Spacer />
      <Text dimColor>{formatFooterRight()}</Text>
    </Box>
  );
}
