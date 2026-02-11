import type { ReactNode } from "react";
import { Box } from "ink";

type Props = {
  children: ReactNode;
};

export default function LayoutMain({ children }: Props) {
  return (
    <Box flexDirection="column" flexGrow={1} marginTop={0} marginBottom={0}>
      {children}
    </Box>
  );
}
