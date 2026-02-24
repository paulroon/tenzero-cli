import React from "react";
import { Box, Text } from "ink";
import { Alert, Select, Spinner } from "@inkjs/ui";
import type { ReleaseBuildMonitorState } from "@/ui/dashboard/types";

type Props = {
  monitor: ReleaseBuildMonitorState;
  onClose: () => void;
};

export function ReleaseBuildMonitorView({ monitor, onClose }: Props) {
  const isRunning =
    monitor.stage === "pushing" || monitor.stage === "waiting" || monitor.stage === "running";
  const isFinished = monitor.stage === "completed" || monitor.stage === "failed";

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow" bold>
        Release build: {monitor.tag}
      </Text>
      {isRunning && <Spinner label={monitor.message} />}
      {isFinished && (
        <Alert
          variant={monitor.stage === "completed" ? "success" : "error"}
          title={monitor.stage === "completed" ? "Build completed" : "Build failed"}
        >
          {monitor.message}
        </Alert>
      )}
      {monitor.preflightSummary && <Text dimColor>Preflight: {monitor.preflightSummary}</Text>}
      {monitor.runUrl && <Text dimColor>GitHub Actions run: {monitor.runUrl}</Text>}
      {isFinished && (
        <Select
          options={[
            { label: "Back to release selection", value: "back" },
            { label: "Close", value: "close" },
          ]}
          onChange={onClose}
        />
      )}
    </Box>
  );
}
