import { Box, Text } from "ink";
import { Alert } from "@inkjs/ui";

export type StepStatus = "pending" | "running" | "done" | "error";

export type GenerationStep = {
  label: string;
  status: StepStatus;
};

type Props = {
  steps: GenerationStep[];
  error?: string;
  lastOutput?: { stdout?: string; stderr?: string };
};

function truncateOutput(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(-max) + "\n… (truncated)";
}

const TICK = "✓";
const SPINNER = "○";
const CROSS = "✗";
const PENDING = "○";

function renderStep(status: StepStatus, label: string) {
  const icon =
    status === "done"
      ? TICK
      : status === "error"
        ? CROSS
        : status === "running"
          ? SPINNER
          : PENDING;
  const color =
    status === "done"
      ? "green"
      : status === "error"
        ? "red"
        : status === "running"
          ? "cyan"
          : "gray";

  return (
    <Text>
      <Text color={color}> {icon} </Text>
      {label}
    </Text>
  );
}

export default function GenerationOutput({
  steps,
  error,
  lastOutput,
}: Props) {
  const hasOutput =
    lastOutput &&
    ((lastOutput.stdout?.trim?.()?.length ?? 0) > 0 ||
      (lastOutput.stderr?.trim?.()?.length ?? 0) > 0);

  return (
    <Box flexDirection="column" gap={0}>
      <Text bold color="yellow">
        Generating project…
      </Text>
      <Box flexDirection="column" marginTop={1} gap={0}>
        {steps.map((s, i) => (
          <Box key={i}>{renderStep(s.status, s.label)}</Box>
        ))}
      </Box>
      {error && (
        <Box marginTop={1} flexDirection="column" gap={0}>
          <Alert variant="error" title="Error">
            {error}
          </Alert>
          <Box marginTop={1}>
            <Text dimColor>Press Esc to go back.</Text>
          </Box>
          {hasOutput && (
            <Box
              flexDirection="column"
              marginTop={1}
              padding={1}
              borderStyle="round"
              borderColor="gray"
            >
              <Text bold dimColor>
                Last output:
              </Text>
              {lastOutput?.stderr?.trim() && (
                <Box flexDirection="column" marginTop={1}>
                  <Text bold color="red">
                    stderr:
                  </Text>
                  <Text>{truncateOutput(lastOutput.stderr.trim(), 2000)}</Text>
                </Box>
              )}
              {lastOutput?.stdout?.trim() && (
                <Box flexDirection="column" marginTop={1}>
                  <Text bold color="yellow">
                    stdout:
                  </Text>
                  <Text>{truncateOutput(lastOutput.stdout.trim(), 2000)}</Text>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
