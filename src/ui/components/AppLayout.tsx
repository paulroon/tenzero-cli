import type { ReactNode } from "react";
import { Box } from "ink";
import LayoutHeader from "@/ui/components/LayoutHeader";
import LayoutMain from "@/ui/components/LayoutMain";
import LayoutFooter from "@/ui/components/LayoutFooter";
import BorderBox from "./BorderBox";

type Props = {
    headerTitle: string;
    status: string;
    children: ReactNode;
    footerLeft: string;
};

export default function AppLayout({
    headerTitle,
    status,
    children,
    footerLeft,
}: Props) {
    return (
        <Box flexDirection="column" flexGrow={1}>
            <LayoutHeader headerTitle={headerTitle} status={status} />
            <LayoutMain>
                <BorderBox>{children}</BorderBox>
            </LayoutMain>
            <LayoutFooter footerLeft={footerLeft} />
        </Box>
    );
}
