import type { ReactNode } from "react";
import { Box } from "ink";

type Props = {
  children: ReactNode;
};

export default function LayoutAlerts({ children }: Props) {
  return (
    <Box flexDirection="column" marginTop={1}>
      {children}
    </Box>
  );
}
