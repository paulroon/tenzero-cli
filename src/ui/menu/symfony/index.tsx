import { useState } from "react";
import { Box, Text } from "ink";
import MenuBox from "@/ui/components/MenuBox";
import { Select } from "@inkjs/ui";
import type { TzConfig } from "@/lib/config";
import { useBackKey } from "@/hooks/useBackKey";
import Confirm from "@/ui/components/Confirm";
import NotYetImplemented from "@/ui/components/NotYetImplemented";

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

  useBackKey(() => {
    if (authChoice === null) onBack();
    else setAuthChoice(null);
  });

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
        <MenuBox>
          <Select
            options={AUTH_OPTIONS.map((o) => ({
              label: o.label,
              value: o.value,
            }))}
            onChange={(value) => setAuthChoice(value as AuthChoice)}
          />
        </MenuBox>
      </Box>
    );
  }

  if (authChoice === "single-user" || authChoice === "multi-tenant") {
    return <NotYetImplemented message="Not yet implemented" />;
  }

  return (
    <MenuBox>
      <Confirm
        message={`Are you sure you want to generate this project @ ${projectDirectory}`}
        onConfirm={handleConfirm}
        onCancel={() => setAuthChoice(null)}
      />
    </MenuBox>
  );
}
