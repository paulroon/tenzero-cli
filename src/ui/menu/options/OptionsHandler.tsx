import { useEffect, useMemo, useState } from "react";
import { Box, Text } from "ink";
import { Alert, Select, Spinner, TextInput } from "@inkjs/ui";
import {
    DEFAULT_EDITOR,
    saveConfig,
    syncProjects,
    type TzConfig,
} from "@/lib/config";
import { evaluateDeploymentsEnablementGate } from "@/lib/deployments/gate";
import { getErrorMessage } from "@/lib/errors";
import { callShell } from "@/lib/shell";
import {
    deleteInstalledProjectConfig,
    getInstalledProjectConfigVersion,
    installProjectConfig,
    isProjectConfigInstalled,
    listInstalledProjectConfigs,
    listRemoteProjectConfigs,
} from "@/lib/projectConfigRepo";
import { useBackKey } from "@/hooks/useBackKey";
import SecretsScreen from "@/ui/menu/options/SecretsScreen";

const OPTIONS_MENU_ITEMS = [
    { label: "Config", value: "config" },
    { label: "Secrets", value: "manage-secrets" },
    { label: "App Templates", value: "install-project-config" },
    { label: "Deployments", value: "deployments" },
] as const;

type OptionChoice = (typeof OPTIONS_MENU_ITEMS)[number]["value"];
type ExistingConfigChoice = "update" | "delete" | "cancel";
const SELECT_PLACEHOLDER = "__select_project_config__";
const DIM_GRAY = "\u001b[90m";
const ANSI_RESET = "\u001b[0m";

type ConfigField =
    | "name"
    | "email"
    | "projectDirectory"
    | "editor"
    | "allowShellSyntax";

function ConfigScreen({
    config,
    onBack,
    onConfigUpdate,
}: {
    config: TzConfig;
    onBack: () => void;
    onConfigUpdate?: (config: TzConfig) => void;
}) {
    const [phase, setPhase] = useState<"menu" | "edit" | "done" | "error">(
        "menu"
    );
    const [selectedField, setSelectedField] = useState<ConfigField | null>(
        null
    );
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useBackKey(() => {
        if (phase === "edit") {
            setSelectedField(null);
            setPhase("menu");
            return;
        }
        if (phase === "done" || phase === "error") {
            setPhase("menu");
            return;
        }
        onBack();
    });

    const currentValue = (field: ConfigField): string => {
        if (field === "editor") return config.editor || DEFAULT_EDITOR;
        if (field === "allowShellSyntax")
            return config.allowShellSyntax ? "true" : "false";
        return config[field] || "";
    };

    const fieldLabel = (field: ConfigField): string => {
        switch (field) {
            case "name":
                return "Name";
            case "email":
                return "Email";
            case "projectDirectory":
                return "Project Directory";
            case "editor":
                return "Editor";
            case "allowShellSyntax":
                return "Allow shell syntax without prompt";
        }
    };

    const saveField = (field: ConfigField, value: string | boolean) => {
        const next = typeof value === "string" ? value.trim() : value;
        if (field === "name" && !next) {
            setErrorMessage("Name cannot be empty.");
            setPhase("error");
            return;
        }
        const updatedBase: TzConfig = {
            ...config,
            [field]:
                field === "editor"
                    ? next || DEFAULT_EDITOR
                    : field === "allowShellSyntax"
                    ? next === true || next === "true"
                    : next,
        };
        const updated = syncProjects(updatedBase);
        saveConfig(updated);
        onConfigUpdate?.(updated);
        setStatusMessage(`Updated ${fieldLabel(field)}.`);
        setSelectedField(null);
        setPhase("done");
    };

    if (phase === "edit" && selectedField) {
        if (selectedField === "allowShellSyntax") {
            return (
                <Box flexDirection="column" gap={1}>
                    <Text color="yellow">Config</Text>
                    <Text>
                        Allow shell syntax commands without confirmation
                        prompts?
                    </Text>
                    <Box marginTop={1}>
                        <Select
                            defaultValue={currentValue(selectedField)}
                            options={[
                                { label: "No (recommended)", value: "false" },
                                { label: "Yes (always allow)", value: "true" },
                            ]}
                            onChange={(value) =>
                                saveField(selectedField, value === "true")
                            }
                        />
                    </Box>
                </Box>
            );
        }
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Config</Text>
                <Text>Update {fieldLabel(selectedField)}:</Text>
                <Box marginTop={1}>
                    <TextInput
                        defaultValue={currentValue(selectedField)}
                        placeholder={fieldLabel(selectedField)}
                        onSubmit={(value) => saveField(selectedField, value)}
                    />
                </Box>
            </Box>
        );
    }

    if (phase === "done") {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Config</Text>
                <Alert variant="success" title="Completed">
                    {statusMessage ?? "Updated."}
                </Alert>
            </Box>
        );
    }

    if (phase === "error") {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Config</Text>
                <Alert variant="error" title="Update failed">
                    {errorMessage ?? "Could not update config."}
                </Alert>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" gap={1}>
            <Text color="yellow">Config</Text>
            <Text>Choose a value to update:</Text>
            <Box marginTop={1}>
                <Select
                    options={[
                        { label: `Name: ${config.name}`, value: "name" },
                        {
                            label: `Email: ${config.email || "(not set)"}`,
                            value: "email",
                        },
                        {
                            label: `Project Directory: ${config.projectDirectory}`,
                            value: "projectDirectory",
                        },
                        {
                            label: `Editor: ${config.editor || DEFAULT_EDITOR}`,
                            value: "editor",
                        },
                        {
                            label: `Allow shell syntax without prompt: ${
                                config.allowShellSyntax ? "Yes" : "No"
                            }`,
                            value: "allowShellSyntax",
                        },
                        { label: "Back to options", value: "__back__" },
                    ]}
                    onChange={(value) => {
                        if (value === "__back__") {
                            onBack();
                            return;
                        }
                        setSelectedField(value as ConfigField);
                        setPhase("edit");
                    }}
                />
            </Box>
        </Box>
    );
}

function InstallProjectConfigScreen({ onBack }: { onBack: () => void }) {
    const [phase, setPhase] = useState<
        "loading" | "select" | "existing-choice" | "working" | "done" | "error"
    >("loading");
    const [remoteConfigs, setRemoteConfigs] = useState<string[]>([]);
    const [installedConfigs, setInstalledConfigs] = useState<string[]>([]);
    const [installedVersions, setInstalledVersions] = useState<
        Record<string, string>
    >({});
    const [selectedConfigId, setSelectedConfigId] = useState<string | null>(
        null
    );
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refreshData = async () => {
        setPhase("loading");
        setError(null);
        try {
            const [remote, installed] = await Promise.all([
                listRemoteProjectConfigs(),
                Promise.resolve(listInstalledProjectConfigs()),
            ]);
            setRemoteConfigs(remote);
            setInstalledConfigs(installed);
            setInstalledVersions(
                Object.fromEntries(
                    installed
                        .map((id) => [id, getInstalledProjectConfigVersion(id)])
                        .filter(
                            (entry): entry is [string, string] =>
                                typeof entry[1] === "string"
                        )
                )
            );
            setPhase("select");
        } catch (err) {
            setError(getErrorMessage(err, "Failed to load app template list"));
            setPhase("error");
        }
    };

    useEffect(() => {
        void refreshData();
    }, []);

    useBackKey(() => {
        if (phase === "working") return;
        if (phase === "existing-choice") {
            setSelectedConfigId(null);
            setPhase("select");
            return;
        }
        onBack();
    });

    const installedSet = useMemo(
        () => new Set(installedConfigs),
        [installedConfigs]
    );

    const orderedRemoteConfigs = useMemo(() => {
        return [...remoteConfigs].sort((a, b) => {
            const aInstalled = installedSet.has(a);
            const bInstalled = installedSet.has(b);
            if (aInstalled !== bInstalled) return aInstalled ? -1 : 1;
            return a.localeCompare(b);
        });
    }, [remoteConfigs, installedSet]);

    const formatInstalledLabel = (configId: string): string => {
        const version = installedVersions[configId] ?? "?";
        return `✅ ${configId} ${DIM_GRAY}(v ${version})${ANSI_RESET}`;
    };

    const performInstall = async (configId: string, replace: boolean) => {
        setPhase("working");
        setError(null);
        setStatusMessage(null);
        try {
            await installProjectConfig(configId, { replace });
            const installedVersion = getInstalledProjectConfigVersion(configId);
            const versionText = installedVersion
                ? ` (v ${installedVersion})`
                : "";
            setStatusMessage(
                replace
                    ? `Updated '${configId}'${versionText} in ~/tz/configs`
                    : `Installed '${configId}'${versionText} to ~/tz/configs`
            );
            const installed = listInstalledProjectConfigs();
            setInstalledConfigs(installed);
            setInstalledVersions(
                Object.fromEntries(
                    installed
                        .map((id) => [id, getInstalledProjectConfigVersion(id)])
                        .filter(
                            (entry): entry is [string, string] =>
                                typeof entry[1] === "string"
                        )
                )
            );
            setPhase("done");
        } catch (err) {
            if (
                err instanceof Error &&
                err.message.startsWith("App template already installed:")
            ) {
                setSelectedConfigId(configId);
                setPhase("existing-choice");
                return;
            }
            setError(getErrorMessage(err, "Install failed"));
            setPhase("error");
        }
    };

    const handleConfigSelect = (value: string) => {
        if (value === SELECT_PLACEHOLDER) return;
        setSelectedConfigId(value);
        if (installedSet.has(value) || isProjectConfigInstalled(value)) {
            setPhase("existing-choice");
            return;
        }
        void performInstall(value, false);
    };

    const handleExistingChoice = (choice: ExistingConfigChoice) => {
        if (!selectedConfigId) return;
        if (choice === "cancel") {
            setSelectedConfigId(null);
            setPhase("select");
            return;
        }
        if (choice === "delete") {
            try {
                deleteInstalledProjectConfig(selectedConfigId);
                const installed = listInstalledProjectConfigs();
                setInstalledConfigs(installed);
                setInstalledVersions(
                    Object.fromEntries(
                        installed
                            .map((id) => [
                                id,
                                getInstalledProjectConfigVersion(id),
                            ])
                            .filter(
                                (entry): entry is [string, string] =>
                                    typeof entry[1] === "string"
                            )
                    )
                );
                setStatusMessage(
                    `Deleted '${selectedConfigId}' from ~/tz/configs`
                );
                setPhase("done");
            } catch (err) {
                setError(getErrorMessage(err, "Delete failed"));
                setPhase("error");
            }
            return;
        }
        void performInstall(selectedConfigId, true);
    };

    if (phase === "loading") {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Manage app templates</Text>
                <Spinner label="Loading available app templates" />
            </Box>
        );
    }

    if (phase === "working") {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Manage app templates</Text>
                <Spinner label="Downloading selected app template" />
            </Box>
        );
    }

    if (phase === "existing-choice" && selectedConfigId) {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Manage app templates</Text>
                <Text>
                    App template '{selectedConfigId}' already exists in
                    ~/tz/configs. What would you like to do?
                </Text>
                <Box marginTop={1}>
                    <Select
                        options={[
                            {
                                label: "Update existing config",
                                value: "update",
                            },
                            {
                                label: "Delete existing template",
                                value: "delete",
                            },
                            { label: "Cancel", value: "cancel" },
                        ]}
                        onChange={(value) =>
                            handleExistingChoice(value as ExistingConfigChoice)
                        }
                    />
                </Box>
            </Box>
        );
    }

    if (phase === "error") {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Manage app templates</Text>
                <Alert variant="error" title="Action failed">
                    {error ?? "Something went wrong"}
                </Alert>
                <Box marginTop={1}>
                    <Select
                        options={[
                            { label: "Try again", value: "retry" },
                            { label: "Back to options", value: "back" },
                        ]}
                        onChange={(value) => {
                            if (value === "retry") {
                                void refreshData();
                            } else {
                                onBack();
                            }
                        }}
                    />
                </Box>
            </Box>
        );
    }

    if (phase === "done") {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Manage app templates</Text>
                <Alert variant="success" title="Completed">
                    {statusMessage ?? "Done"}
                </Alert>
                <Box marginTop={1}>
                    <Select
                        options={[
                            {
                                label: "Install or manage another...",
                                value: "again",
                            },
                            { label: "Back to options", value: "back" },
                        ]}
                        onChange={(value) => {
                            if (value === "again") {
                                setSelectedConfigId(null);
                                setPhase("select");
                                return;
                            }
                            onBack();
                        }}
                    />
                </Box>
            </Box>
        );
    }

    if (remoteConfigs.length === 0) {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Manage app templates</Text>
                <Text dimColor>No app templates found in repository.</Text>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" gap={1}>
            <Text color="yellow">Manage app templates</Text>
            <Text>Select an app template:</Text>
            <Box marginTop={1}>
                <Select
                    defaultValue={SELECT_PLACEHOLDER}
                    options={[
                        {
                            label: "Select an app template...",
                            value: SELECT_PLACEHOLDER,
                        },
                        ...orderedRemoteConfigs.map((configId) => ({
                            label: installedSet.has(configId)
                                ? formatInstalledLabel(configId)
                                : `  ${configId}`,
                            value: configId,
                        })),
                    ]}
                    onChange={handleConfigSelect}
                />
            </Box>
        </Box>
    );
}

function DeploymentsScreen({
    config,
    onBack,
    onConfigUpdate,
}: {
    config: TzConfig;
    onBack: () => void;
    onConfigUpdate?: (config: TzConfig) => void;
}) {
    const [phase, setPhase] = useState<
        | "menu"
        | "edit-bucket"
        | "edit-region"
        | "edit-profile"
        | "edit-prefix"
        | "done"
        | "error"
    >("menu");
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [awsCliInstalled, setAwsCliInstalled] = useState<boolean | null>(
        null
    );

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const result = await callShell("aws", ["--version"], {
                    collect: true,
                    throwOnNonZero: false,
                    quiet: true,
                });
                if (!cancelled) {
                    setAwsCliInstalled(result.exitCode === 0);
                }
            } catch {
                if (!cancelled) {
                    setAwsCliInstalled(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useBackKey(() => {
        if (phase !== "menu") {
            setPhase("menu");
            return;
        }
        onBack();
    });

    const aws = config.integrations?.aws;
    const backend = aws?.backend;
    const gate = evaluateDeploymentsEnablementGate(config);

    const updateConfig = (next: TzConfig) => {
        const updated = syncProjects(next);
        saveConfig(updated);
        onConfigUpdate?.(updated);
    };

    const ensureBackend = () =>
        ({
            bucket: backend?.bucket ?? "",
            region: backend?.region ?? "",
            profile: backend?.profile ?? "",
            statePrefix: backend?.statePrefix ?? "",
            lockStrategy: backend?.lockStrategy ?? "s3-lockfile",
        } as const);

    const setBackendField = (
        field: "bucket" | "region" | "profile" | "statePrefix",
        value: string
    ) => {
        const current = ensureBackend();
        const next: TzConfig = {
            ...config,
            integrations: {
                ...(config.integrations ?? {}),
                aws: {
                    connected: aws?.connected === true,
                    backend: {
                        ...current,
                        [field]: value.trim(),
                    },
                    backendChecks: aws?.backendChecks,
                },
            },
        };
        updateConfig(next);
        setStatusMessage(`Updated backend ${field}.`);
        setPhase("done");
    };

    const runValidationChecks = () => {
        const current = ensureBackend();
        const hasBackendDetails =
            current.bucket.length > 0 &&
            current.region.length > 0 &&
            current.profile.length > 0 &&
            current.statePrefix.length > 0;

        const next: TzConfig = {
            ...config,
            integrations: {
                ...(config.integrations ?? {}),
                aws: {
                    connected: aws?.connected === true,
                    backend: current,
                    backendChecks: {
                        stateReadWritePassed: hasBackendDetails,
                        lockAcquisitionPassed: hasBackendDetails,
                        checkedAt: new Date().toISOString(),
                    },
                },
            },
        };
        updateConfig(next);
        if (hasBackendDetails) {
            setStatusMessage("Backend validation checks passed.");
            setPhase("done");
            return;
        }
        setErrorMessage(
            "Backend validation failed. Complete all backend config fields and retry."
        );
        setPhase("error");
    };

    const setAwsConnected = (connected: boolean) => {
        const next: TzConfig = {
            ...config,
            integrations: {
                ...(config.integrations ?? {}),
                aws: {
                    connected,
                    backend: ensureBackend(),
                    backendChecks: aws?.backendChecks,
                },
            },
        };
        updateConfig(next);
        setStatusMessage(
            connected
                ? "AWS integration marked connected."
                : "AWS integration disconnected."
        );
        setPhase("done");
    };

    const enableDeploymentsMode = () => {
        const latestGate = evaluateDeploymentsEnablementGate(config);
        if (!latestGate.allowed) {
            setErrorMessage(
                latestGate.issues[0]?.message ?? "Deployments mode gate failed."
            );
            setPhase("error");
            return;
        }
        const next: TzConfig = {
            ...config,
            deployments: {
                enabled: true,
                enabledAt: new Date().toISOString(),
                enabledProfile: backend?.profile ?? "default",
            },
        };
        updateConfig(next);
        setStatusMessage("Deployments mode enabled.");
        setPhase("done");
    };

    if (phase === "edit-bucket") {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Deployments</Text>
                <Text>Set AWS backend bucket:</Text>
                <TextInput
                    defaultValue={backend?.bucket ?? ""}
                    placeholder="tz-state-123456789012-eu-west-1"
                    onSubmit={(value) => setBackendField("bucket", value)}
                />
            </Box>
        );
    }
    if (phase === "edit-region") {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Deployments</Text>
                <Text>Set AWS backend region:</Text>
                <TextInput
                    defaultValue={backend?.region ?? ""}
                    placeholder="eu-west-1"
                    onSubmit={(value) => setBackendField("region", value)}
                />
            </Box>
        );
    }
    if (phase === "edit-profile") {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Deployments</Text>
                <Text>Set AWS backend profile:</Text>
                <TextInput
                    defaultValue={backend?.profile ?? ""}
                    placeholder="default"
                    onSubmit={(value) => setBackendField("profile", value)}
                />
            </Box>
        );
    }
    if (phase === "edit-prefix") {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Deployments</Text>
                <Text>Set backend state prefix:</Text>
                <TextInput
                    defaultValue={backend?.statePrefix ?? ""}
                    placeholder="tz/v1/default/my-app"
                    onSubmit={(value) => setBackendField("statePrefix", value)}
                />
            </Box>
        );
    }
    if (phase === "done") {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Deployments</Text>
                <Alert variant="success" title="Completed">
                    {statusMessage ?? "Done"}
                </Alert>
                <Select
                    options={[
                        { label: "Back to deployments", value: "menu" },
                        { label: "Back to options", value: "back" },
                    ]}
                    onChange={(value) => {
                        if (value === "menu") setPhase("menu");
                        else onBack();
                    }}
                />
            </Box>
        );
    }
    if (phase === "error") {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Deployments</Text>
                <Alert variant="error" title="Action failed">
                    {errorMessage ?? "Could not complete action."}
                </Alert>
                <Select
                    options={[
                        { label: "Back to deployments", value: "menu" },
                        { label: "Back to options", value: "back" },
                    ]}
                    onChange={(value) => {
                        if (value === "menu") setPhase("menu");
                        else onBack();
                    }}
                />
            </Box>
        );
    }

    return (
        <Box flexDirection="column" gap={1}>
            <Text color="yellow">Deployments</Text>
            <Text>
                Deployments mode:{" "}
                {config.deployments?.enabled ? "Enabled" : "Disabled"}
            </Text>
            <Text>
                AWS integration: {aws?.connected ? "Connected" : "Disconnected"}
            </Text>
            <Text>
                Backend:{" "}
                {backend?.bucket
                    ? `${backend.bucket} (${backend.region || "no-region"})`
                    : "Not configured"}
            </Text>
            <Text>Gate status: {gate.allowed ? "Ready" : "Blocked"}</Text>
            {gate.issues.length > 0 && (
                <Box flexDirection="column">
                    {gate.issues.map((issue) => (
                        <Text key={issue.check} dimColor>
                            - {issue.message}
                        </Text>
                    ))}
                </Box>
            )}
            <Box marginTop={1}>
                <Select
                    options={[
                        {
                            label: aws?.connected
                                ? "Disconnect AWS integration"
                                : "Connect AWS integration",
                            value: "toggleAws",
                        },
                        { label: "Set backend bucket", value: "bucket" },
                        { label: "Set backend region", value: "region" },
                        { label: "Set backend profile", value: "profile" },
                        { label: "Set backend state prefix", value: "prefix" },
                        {
                            label: "Run backend validation checks",
                            value: "validate",
                        },
                        { label: "Enable deployments mode", value: "enable" },
                        { label: "Back to options", value: "back" },
                    ]}
                    onChange={(value) => {
                        if (value === "toggleAws") {
                            setAwsConnected(!(aws?.connected === true));
                            return;
                        }
                        if (value === "bucket") {
                            setPhase("edit-bucket");
                            return;
                        }
                        if (value === "region") {
                            setPhase("edit-region");
                            return;
                        }
                        if (value === "profile") {
                            setPhase("edit-profile");
                            return;
                        }
                        if (value === "prefix") {
                            setPhase("edit-prefix");
                            return;
                        }
                        if (value === "validate") {
                            runValidationChecks();
                            return;
                        }
                        if (value === "enable") {
                            enableDeploymentsMode();
                            return;
                        }
                        onBack();
                    }}
                />
            </Box>

            <Alert
                variant={awsCliInstalled ? "success" : "warning"}
                title={
                    awsCliInstalled
                        ? "AWS CLI installed"
                        : "AWS CLI not installed"
                }
            >
                Recommended for setup/troubleshooting
            </Alert>
        </Box>
    );
}

type Props = {
    config: TzConfig;
    onBack: () => void;
    projectDirectory: string;
    onConfigUpdate?: (config: TzConfig) => void;
};

export default function OptionsHandler({
    config,
    onBack,
    onConfigUpdate,
}: Props) {
    const [choice, setChoice] = useState<OptionChoice | null>(null);

    useBackKey(() => {
        if (choice === null) onBack();
        else setChoice(null);
    });

    if (choice === null) {
        return (
            <Box flexDirection="column" gap={1}>
                <Text color="yellow">Options</Text>
                <Text>Choose an option:</Text>
                <Box marginTop={1}>
                    <Select
                        options={OPTIONS_MENU_ITEMS.map((o) => ({
                            label: o.label,
                            value: o.value,
                        }))}
                        onChange={(value) => setChoice(value as OptionChoice)}
                    />
                </Box>
            </Box>
        );
    }

    if (choice === "config") {
        return (
            <ConfigScreen
                config={config}
                onBack={() => setChoice(null)}
                onConfigUpdate={onConfigUpdate}
            />
        );
    }

    if (choice === "install-project-config") {
        return <InstallProjectConfigScreen onBack={() => setChoice(null)} />;
    }

    if (choice === "manage-secrets") {
        return <SecretsScreen onBack={() => setChoice(null)} />;
    }

    if (choice === "deployments") {
        return (
            <DeploymentsScreen
                config={config}
                onBack={() => setChoice(null)}
                onConfigUpdate={onConfigUpdate}
            />
        );
    }

    return null;
}
