import type { ReactNode } from "react";
import { Box } from "ink";
import { Spinner } from "@inkjs/ui";
import { useLoading } from "@/contexts/LoadingContext";

type Props = {
  children: ReactNode;
};

export default function LayoutMain({ children }: Props) {
  const { loading } = useLoading();

  return (
    <Box flexDirection="column" flexGrow={1} marginTop={0} marginBottom={0}>
      {loading ? <Spinner /> : children}
    </Box>
  );
}
