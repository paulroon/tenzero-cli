import { useState } from "react";
import { Alert, Select, TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import { useBackKey } from "@/hooks/useBackKey";
import {
  deleteStoredSecret,
  listStoredSecretKeys,
  normalizeSecretKey,
  setStoredSecret,
} from "@/lib/secrets";

type Phase =
  | "menu"
  | "set-github"
  | "set-custom-key"
  | "set-custom-value"
  | "delete"
  | "done"
  | "error";

export default function SecretsScreen({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>("menu");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customKey, setCustomKey] = useState<string | null>(null);
  const secretKeys = listStoredSecretKeys();

  useBackKey(() => {
    if (phase === "menu") {
      onBack();
      return;
    }
    if (phase === "set-custom-value") {
      setCustomKey(null);
      setPhase("set-custom-key");
      return;
    }
    setPhase("menu");
  });

  if (phase === "set-github") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Secrets</Text>
        <Text>Set GITHUB_TOKEN (leave blank to delete):</Text>
        <Box marginTop={1}>
          <TextInput
            placeholder="ghp_..."
            onSubmit={(value) => {
              const next = value.trim();
              try {
                if (!next) {
                  deleteStoredSecret("GITHUB_TOKEN");
                  setStatusMessage("Deleted GITHUB_TOKEN from stored secrets.");
                } else {
                  setStoredSecret("GITHUB_TOKEN", next);
                  setStatusMessage("Saved GITHUB_TOKEN to stored secrets.");
                }
                setPhase("done");
              } catch (error) {
                setErrorMessage(
                  error instanceof Error ? error.message : "Failed to save secret."
                );
                setPhase("error");
              }
            }}
          />
        </Box>
        <Alert variant="info" title="GitHub setup">
          Create a Personal Access Token in GitHub Settings -> Developer settings ->
          Personal access tokens, then copy it here. For public template repos, read-only
          access is enough.
        </Alert>
        <Text dimColor>
          Tip: env var GITHUB_TOKEN or TZ_SECRET_GITHUB_TOKEN overrides stored value.
        </Text>
      </Box>
    );
  }

  if (phase === "set-custom-key") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Secrets</Text>
        <Text>Secret key (A-Z, 0-9, underscore):</Text>
        <Box marginTop={1}>
          <TextInput
            placeholder="API_TOKEN"
            onSubmit={(value) => {
              const normalized = normalizeSecretKey(value);
              if (!normalized) {
                setErrorMessage(
                  "Invalid key. Use A-Z, 0-9 and underscore only (must start with A-Z)."
                );
                setPhase("error");
                return;
              }
              setCustomKey(normalized);
              setPhase("set-custom-value");
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "set-custom-value" && customKey) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Secrets</Text>
        <Text>
          Set value for <Text bold>{customKey}</Text> (leave blank to delete):
        </Text>
        <Box marginTop={1}>
          <TextInput
            placeholder="secret value"
            onSubmit={(value) => {
              const next = value.trim();
              try {
                if (!next) {
                  deleteStoredSecret(customKey);
                  setStatusMessage(`Deleted ${customKey}.`);
                } else {
                  setStoredSecret(customKey, next);
                  setStatusMessage(`Saved ${customKey}.`);
                }
                setCustomKey(null);
                setPhase("done");
              } catch (error) {
                setErrorMessage(
                  error instanceof Error ? error.message : "Failed to save secret."
                );
                setPhase("error");
              }
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "delete") {
    if (secretKeys.length === 0) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="yellow">Secrets</Text>
          <Text dimColor>No stored secrets to delete.</Text>
          <Box marginTop={1}>
            <Select
              options={[{ label: "Back", value: "back" }]}
              onChange={() => setPhase("menu")}
            />
          </Box>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Secrets</Text>
        <Text>Select a secret to delete:</Text>
        <Box marginTop={1}>
          <Select
            options={[
              ...secretKeys.map((key) => ({ label: key, value: key })),
              { label: "Cancel", value: "__cancel__" },
            ]}
            onChange={(value) => {
              if (value === "__cancel__") {
                setPhase("menu");
                return;
              }
              deleteStoredSecret(value);
              setStatusMessage(`Deleted ${value}.`);
              setPhase("done");
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "done") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Secrets</Text>
        <Alert variant="success" title="Completed">
          {statusMessage ?? "Done"}
        </Alert>
        <Box marginTop={1}>
          <Select
            options={[
              { label: "Manage more secrets", value: "more" },
              { label: "Back to options", value: "back" },
            ]}
            onChange={(value) => {
              if (value === "more") {
                setPhase("menu");
                return;
              }
              onBack();
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Secrets</Text>
        <Alert variant="error" title="Action failed">
          {errorMessage ?? "Failed to update secrets."}
        </Alert>
        <Box marginTop={1}>
          <Select
            options={[
              { label: "Back to secrets", value: "menu" },
              { label: "Back to options", value: "back" },
            ]}
            onChange={(value) => {
              if (value === "menu") {
                setPhase("menu");
                return;
              }
              onBack();
            }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">Secrets</Text>
      <Text>Stored secret keys:</Text>
      {secretKeys.length > 0 ? (
        <Text dimColor>{secretKeys.join(", ")}</Text>
      ) : (
        <Text dimColor>(none)</Text>
      )}
      <Text dimColor>
        Use in templates: {"{{secret.GITHUB_TOKEN}}"} or {"{{secret.MY_KEY}}"}
      </Text>
      <Box marginTop={1}>
        <Select
          options={[
            { label: "Set GitHub token", value: "set-github" },
            { label: "Add/update custom secret", value: "set-custom" },
            { label: "Delete stored secret", value: "delete" },
            { label: "Back to options", value: "back" },
          ]}
          onChange={(value) => {
            if (value === "set-github") {
              setPhase("set-github");
              return;
            }
            if (value === "set-custom") {
              setCustomKey(null);
              setPhase("set-custom-key");
              return;
            }
            if (value === "delete") {
              setPhase("delete");
              return;
            }
            onBack();
          }}
        />
      </Box>
    </Box>
  );
}
