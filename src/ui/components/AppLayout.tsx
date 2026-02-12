import type { ReactNode } from "react";
import { Box } from "ink";
import LayoutHeader from "@/ui/components/LayoutHeader";
import LayoutAlerts from "@/ui/components/LayoutAlerts";
import LayoutMain from "@/ui/components/LayoutMain";
import LayoutFooter from "@/ui/components/LayoutFooter";
import BorderBox from "./BorderBox";

type Props = {
  headerTitle: string;
  status: string;
  alerts?: ReactNode;
  children: ReactNode;
  footerLeft: string;
};

export default function AppLayout({
  headerTitle,
  status,
  alerts,
  children,
  footerLeft,
}: Props) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <LayoutHeader headerTitle={headerTitle} status={status} />
      {alerts && <LayoutAlerts>{alerts}</LayoutAlerts>}
      <LayoutMain>
        <BorderBox>{children}</BorderBox>
      </LayoutMain>
      <LayoutFooter footerLeft={footerLeft} />
    </Box>
  );
}
