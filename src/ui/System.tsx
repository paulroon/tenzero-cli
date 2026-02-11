import { type ReactNode, useEffect, useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { Alert, Spinner } from "@inkjs/ui";
import { clearScreen } from "@/lib/common";
import { getDependencyStatus } from "@/lib/dependencies";
import AppLayout from "@/ui/components/AppLayout";

const COMMAND_KEYS = {
  exit: ["x", "X"],
} satisfies Record<string, readonly string[]>;

type Props = {
  children: ReactNode;
};

export default function System({ children }: Props) {
  const [status, setStatus] = useState<"loading" | "failed" | "ok">("loading");
  const [failedDeps, setFailedDeps] = useState<
    Array<{ name: string; instructions: readonly string[] }>
  >([]);
  const { exit } = useApp();

  useInput(
    (input) => {
      if (status === "failed" && COMMAND_KEYS.exit.includes(input)) {
        clearScreen();
        exit();
      }
    },
    { isActive: status === "failed" }
  );

  useEffect(() => {
    getDependencyStatus().then((results) => {
      const failed = results.filter((r) => !r.installed);
      setStatus(failed.length === 0 ? "ok" : "failed");
      setFailedDeps(
        failed.map((r) => ({ name: r.name, instructions: r.instructions }))
      );
    });
  }, []);

  if (status === "loading") {
    return (
      <AppLayout
        headerTitle="TenZero CLI"
        status="Loading"
        footerLeft={`(${COMMAND_KEYS.exit[0]}) exit`}
      >
        <Box flexDirection="column" padding={1}>
          <Spinner label="Checking dependencies" />
        </Box>
      </AppLayout>
    );
  }

  if (status === "failed") {
    return (
      <AppLayout
        headerTitle="TenZero CLI"
        status="Error"
        alerts={
          <>
            {failedDeps.map((dep) => (
              <Box key={dep.name} flexDirection="column" gap={0} marginBottom={1}>
                <Alert variant="error" title={`${dep.name} not found`}>
                  {dep.name} is required but was not found on your system.
                </Alert>
                <Box marginTop={1} flexDirection="column" gap={0}>
                  {dep.instructions.map((line, i) => (
                    <Text key={i} dimColor={!!line}>
                      {line || " "}
                    </Text>
                  ))}
                </Box>
              </Box>
            ))}
          </>
        }
        footerLeft={`(${COMMAND_KEYS.exit[0]}) exit`}
      >
        <></>
      </AppLayout>
    );
  }

  return <>{children}</>;
}
