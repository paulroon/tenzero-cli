import type { ComponentProps } from "react";
import { Box } from "ink";

type Props = ComponentProps<typeof Box>;

export default function BorderBox(props: Props) {
  return <Box borderStyle="round" borderColor="cyan" {...props} />;
}
