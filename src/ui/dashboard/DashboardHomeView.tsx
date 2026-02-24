import React from "react";
import { Box, Text } from "ink";
import SelectableTable from "@/ui/components/SelectableTable";

type DeployEnv = {
    id: string;
    label: string;
};

type Props = {
    projectName: string;
    projectPath: string;
    projectType: string;
    answers: Record<string, unknown>;
    localUrl: string;
    isDockerized: boolean;
    isLocalRunning: boolean;
    environments: DeployEnv[];
    getEnvironmentStatus: (environmentId: string) => string;
    getEnvironmentStatusLabel: (environmentId: string) => string;
    getEnvironmentUrl: (environmentId: string) => string;
    onSelectEnvironment: (environmentId: string) => void;
    onSelectEnvironmentAction: (environmentId: string) => void;
    onOpenUrl: (url: string) => void;
};

const LOCAL_ROW_ID = "__local__";

function getStatusCellColor(status: string): string {
    const normalized = status.toLowerCase();
    return (
        normalized === "not deployed" ||
        normalized === "unknown" ||
        normalized === "down"
    )
        ? "gray"
        : "yellow";
}

function getActionForEnvironmentStatus(status: string): {
    label: string;
    color: string;
} {
    const normalized = status.toLowerCase();
    if (
        normalized === "not deployed" ||
        normalized === "unknown" ||
        normalized === "down"
    ) {
        return { label: "Deploy latest", color: "yellow" };
    }
    return { label: "Takedown", color: "red" };
}

function getLocalAction(
    isDockerized: boolean,
    isLocalRunning: boolean
): { label: string; color: string } {
    if (isDockerized) {
        return isLocalRunning
            ? { label: "Down", color: "red" }
            : { label: "Up", color: "yellow" };
    }
    return isLocalRunning
        ? { label: "Stop", color: "red" }
        : { label: "Start", color: "yellow" };
}

export function DashboardHomeView({
    projectName,
    projectPath,
    projectType,
    answers,
    localUrl,
    isDockerized,
    isLocalRunning,
    environments,
    getEnvironmentStatus,
    getEnvironmentStatusLabel,
    getEnvironmentUrl,
    onSelectEnvironment,
    onSelectEnvironmentAction,
    onOpenUrl,
}: Props) {
    const tableColumns = [
        { id: "env", label: "Environment" },
        { id: "status", label: "Status", selectable: false },
        { id: "url", label: "URL" },
        { id: "action", label: "Action" },
    ] as const;

    const localAction = getLocalAction(isDockerized, isLocalRunning);

    const tableRows = [
        {
            id: LOCAL_ROW_ID,
            cells: {
                env: {
                    value: isDockerized ? "Local (Docker)" : "Local",
                    selectable: false,
                },
                status: { value: "-", color: "gray" },
                url: localUrl,
                action: { value: localAction.label, color: localAction.color },
            },
        },
        ...environments.map((environment) => {
            const status = getEnvironmentStatus(environment.id);
            const action = getActionForEnvironmentStatus(status);
            return {
                id: environment.id,
                cells: {
                    env: { value: environment.label, selectable: true },
                    status: {
                        value: getEnvironmentStatusLabel(environment.id),
                        color: getStatusCellColor(status),
                    },
                    url: getEnvironmentUrl(environment.id),
                    action: { value: action.label, color: action.color },
                },
            };
        }),
    ];

    return (
        <Box flexDirection="column" gap={1} paddingLeft={1}>
            <Text color="yellow" bold>
                App Dashboard: {projectName}
            </Text>
            <SelectableTable
                columns={[...tableColumns]}
                rows={[...tableRows]}
                onSelect={(rowId, cellId) => {
                    if (cellId === "env" && rowId !== LOCAL_ROW_ID) {
                        onSelectEnvironment(rowId);
                    }
                    if (cellId === "action" && rowId !== LOCAL_ROW_ID) {
                        onSelectEnvironmentAction(rowId);
                    }
                    if (cellId === "url") {
                        const selectedRow = tableRows.find((row) => row.id === rowId);
                        const selectedUrl = String(selectedRow?.cells.url ?? "").trim();
                        if (selectedUrl.length > 0 && selectedUrl !== "-") {
                            onOpenUrl(selectedUrl);
                        }
                    }
                }}
            />
            {environments.length === 0 && (
                <Text dimColor>No deployment environments defined for this template.</Text>
            )}
            <Box flexDirection="column" paddingX={1} marginTop={1}>
                <Text>
                    <Text dimColor>Path: </Text>
                    {projectPath}
                </Text>
                <Text>
                    <Text dimColor>Type: </Text>
                    {projectType}
                </Text>
                {Object.keys(answers).length > 0 && (
                    <Box flexDirection="column" marginTop={1}>
                        <Text dimColor>Options:</Text>
                        {Object.entries(answers).map(([key, value]) => (
                            <Text key={key}>
                                {"  "}
                                {key}: {String(value)}
                            </Text>
                        ))}
                    </Box>
                )}
            </Box>
        </Box>
    );
}
