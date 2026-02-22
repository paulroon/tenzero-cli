import { useMemo, useState } from "react";
import { Alert, Select, TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import { useBackKey } from "@/hooks/useBackKey";
import { listProjectConfigs, loadProjectBuilderConfig } from "@/lib/config";
import {
  deleteStoredSecret,
  listStoredSecretKeys,
  normalizeSecretKey,
  setStoredSecret,
} from "@/lib/secrets";

type Phase =
  | "menu"
  | "set-custom-key"
  | "set-secret-value"
  | "secret-action"
  | "done"
  | "error";

export default function SecretsScreen({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>("menu");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const storedSecretKeys = listStoredSecretKeys();
  const storedSecretSet = useMemo(
    () => new Set(storedSecretKeys),
    [storedSecretKeys]
  );
  const availableSecretKeys = useMemo(() => {
    const keys = new Set<string>(["GITHUB_TOKEN"]);
    for (const config of listProjectConfigs()) {
      const loaded = loadProjectBuilderConfig(config.id);
      for (const dep of loaded?.secretDependencies ?? []) {
        const normalized = normalizeSecretKey(dep.id);
        if (normalized) keys.add(normalized);
      }
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, []);
  const listedSecretKeys = useMemo(() => {
    const keys = new Set<string>(availableSecretKeys);
    for (const key of storedSecretKeys) keys.add(key);
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [availableSecretKeys, storedSecretKeys]);

  useBackKey(() => {
    if (phase === "menu") {
      onBack();
      return;
    }
    if (phase === "set-custom-key") {
      setSelectedKey(null);
      setPhase("menu");
      return;
    }
    if (phase === "set-secret-value") {
      if (selectedKey && storedSecretSet.has(selectedKey)) {
        setPhase("secret-action");
      } else {
        setSelectedKey(null);
        setPhase("menu");
      }
      return;
    }
    if (phase === "secret-action") {
      setSelectedKey(null);
      setPhase("menu");
      return;
    }
    setPhase("menu");
  });

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
              setSelectedKey(normalized);
              setPhase("set-secret-value");
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "secret-action" && selectedKey) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Secrets</Text>
        <Text>
          <Text bold>{selectedKey}</Text> is already stored. What would you like to do?
        </Text>
        <Box marginTop={1}>
          <Select
            options={[
              { label: "Update value", value: "update" },
              { label: "Delete secret", value: "delete" },
              { label: "Cancel", value: "cancel" },
            ]}
            onChange={(value) => {
              if (value === "update") {
                setPhase("set-secret-value");
                return;
              }
              if (value === "delete") {
                deleteStoredSecret(selectedKey);
                setStatusMessage(`Deleted ${selectedKey}.`);
                setSelectedKey(null);
                setPhase("done");
                return;
              }
              setSelectedKey(null);
              setPhase("menu");
            }}
          />
        </Box>
      </Box>
    );
  }

  if (phase === "set-secret-value" && selectedKey) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Secrets</Text>
        <Text>
          Set value for <Text bold>{selectedKey}</Text>:
        </Text>
        <Box marginTop={1}>
          <TextInput
            placeholder={selectedKey === "GITHUB_TOKEN" ? "ghp_..." : "secret value"}
            onSubmit={(value) => {
              const next = value.trim();
              if (!next) {
                setErrorMessage("Secret value cannot be blank.");
                setPhase("error");
                return;
              }
              try {
                setStoredSecret(selectedKey, next);
                setStatusMessage(`Saved ${selectedKey}.`);
                setSelectedKey(null);
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
        {selectedKey === "GITHUB_TOKEN" && (
          <>
            <Alert variant="info" title="GitHub setup">
              Create a Personal Access Token in GitHub Settings, then Developer
              settings, then Personal access tokens. For public template repos,
              read-only access is enough.
            </Alert>
            <Text dimColor>
              Tip: env var GITHUB_TOKEN or TZ_SECRET_GITHUB_TOKEN overrides stored
              value.
            </Text>
          </>
        )}
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
      <Text>Select a secret to manage:</Text>
      <Box marginTop={1}>
        <Select
          options={[
            ...listedSecretKeys.map((key) => ({
              label: `${storedSecretSet.has(key) ? "✅" : "  "} ${key}`,
              value: key,
            })),
            { label: "Add custom secret...", value: "__add_custom__" },
            { label: "Back to options", value: "back" },
          ]}
          onChange={(value) => {
            if (value === "__add_custom__") {
              setSelectedKey(null);
              setPhase("set-custom-key");
              return;
            }
            if (value === "back") {
              onBack();
              return;
            }
            setSelectedKey(value);
            if (storedSecretSet.has(value)) {
              setPhase("secret-action");
            } else {
              setPhase("set-secret-value");
            }
          }}
        />
      </Box>
    </Box>
  );
}
