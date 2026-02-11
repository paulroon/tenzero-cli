import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Select } from "@inkjs/ui";
import type { TzConfig } from "../../../lib/config";
import { useInputMode } from "../../../contexts/InputModeContext";
import Confirm from "../../Confirm";
import NotYetImplemented from "../../NotYetImplemented";

const AUTH_OPTIONS = [
  { label: "No auth", value: "no-auth" },
  { label: "Single user auth", value: "single-user" },
  { label: "Multi tenant auth", value: "multi-tenant" },
] as const;

type AuthChoice = (typeof AUTH_OPTIONS)[number]["value"];

type Props = {
  config: TzConfig;
  onBack: () => void;
  projectDirectory: string;
};

export default function SymfonyHandler({ onBack, projectDirectory }: Props) {
  const [authChoice, setAuthChoice] = useState<AuthChoice | null>(null);
  const { inputMode } = useInputMode();

  useInput(
    (input, key) => {
      const isBack = key.escape || (!inputMode && (input === "b" || input === "B"));
      if (isBack) {
        if (authChoice === null) {
          onBack();
        } else {
          setAuthChoice(null);
        }
      }
    },
    { isActive: true }
  );

  const handleConfirm = async () => {
    const proc = Bun.spawn(["echo", "ok", "-", "done"], {
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
    onBack();
  };

  if (authChoice === null) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">New Symfony App</Text>
        <Text>Choose auth type:</Text>
        <Box borderStyle="round" borderColor="cyan">
          <Select
            options={AUTH_OPTIONS.map((o) => ({
              label: o.label,
              value: o.value,
            }))}
            onChange={(value) => setAuthChoice(value as AuthChoice)}
          />
        </Box>
      </Box>
    );
  }

  if (authChoice === "single-user" || authChoice === "multi-tenant") {
    return <NotYetImplemented message="Not yet implemented" />;
  }

  return (
    <Box borderStyle="round" borderColor="cyan">
      <Confirm
        message={`Are you sure you want to generate this project @ ${projectDirectory}`}
        onConfirm={handleConfirm}
        onCancel={() => setAuthChoice(null)}
      />
    </Box>
  );
}
