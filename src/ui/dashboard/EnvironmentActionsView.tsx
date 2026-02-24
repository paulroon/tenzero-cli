import React from "react";
import { Box, Text } from "ink";
import { Alert, Select } from "@inkjs/ui";
import type { DeploymentStep, PlannedChange } from "@/ui/dashboard/types";

function getStepStatusBadge(status: DeploymentStep["status"]): string {
  if (status === "running") return "[RUNNING]";
  if (status === "success") return "[DONE]";
  if (status === "failed") return "[FAILED]";
  if (status === "skipped") return "[SKIPPED]";
  return "[PENDING]";
}

type Props = {
  selectedEnvironmentId: string;
  status: string;
  liveUrl?: string;
  environmentProvider?: string;
  canDestroy: boolean;
  hasDeployWorkspace: boolean;
  deployTfCount: number;
  firstTfPath?: string;
  releaseTag?: string;
  releasePresetId?: string;
  imageOverride?: string;
  imageDigest?: string;
  lastApplySummary?: {
    add?: number;
    change?: number;
    destroy?: number;
  };
  lastApplyAt?: string;
  lastReportedAt?: string;
  lastStatusUpdatedAt?: string;
  resolvedOutputs?: Array<{ key: string; value: string }>;
  deploymentNotice: string | null;
  deploymentInProgress: boolean;
  deploymentSteps: DeploymentStep[];
  deploymentStartedAt: number | null;
  deploymentPlannedChanges: PlannedChange[];
  deploymentError: string | null;
  deploymentLogs: string[];
  actionLocked: boolean;
  onBack: () => void;
  onDeploy: () => void;
  onSelectRelease: () => void;
  onReport: () => void;
  onDestroy: () => void;
};

export function EnvironmentActionsView({
  selectedEnvironmentId,
  status,
  liveUrl,
  environmentProvider,
  canDestroy,
  hasDeployWorkspace,
  deployTfCount,
  firstTfPath,
  releaseTag,
  releasePresetId,
  imageOverride,
  imageDigest,
  lastApplySummary,
  lastApplyAt,
  lastReportedAt,
  lastStatusUpdatedAt,
  resolvedOutputs,
  deploymentNotice,
  deploymentInProgress,
  deploymentSteps,
  deploymentStartedAt,
  deploymentPlannedChanges,
  deploymentError,
  deploymentLogs,
  actionLocked,
  onBack,
  onDeploy,
  onSelectRelease,
  onReport,
  onDestroy,
}: Props) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow" bold>
        Environment: {selectedEnvironmentId}
      </Text>
      <Text>Current status: {status}</Text>
      <Text>
        Deploy workspace: {hasDeployWorkspace ? `Ready (${deployTfCount} .tf file(s))` : "Missing (.tf files not found)"}
      </Text>
      {hasDeployWorkspace && firstTfPath && <Text dimColor>First match: {firstTfPath}</Text>}
      {!hasDeployWorkspace && (
        <Text dimColor>Deploy workspace will be generated automatically on first deployment action.</Text>
      )}
      <Text>Release: {releaseTag ?? "(not selected)"}</Text>
      <Text>Preset: {releasePresetId ?? "(not selected)"}</Text>
      <Text dimColor>Provider: {environmentProvider ?? "(template default)"}</Text>
      <Text dimColor>Resolved release reference: {imageOverride ?? "(not selected)"}</Text>
      {imageDigest && <Text dimColor>Release proof: {imageDigest}</Text>}
      {liveUrl && (
        <Text>
          Live environment URL: {liveUrl}
        </Text>
      )}
      {(lastApplySummary || lastApplyAt || lastReportedAt || lastStatusUpdatedAt) && (
        <Box flexDirection="column">
          <Text dimColor>Running now:</Text>
          {lastApplySummary && (
            <Text dimColor>
              Last apply resources: add={lastApplySummary.add ?? 0}, change={lastApplySummary.change ?? 0}, destroy={lastApplySummary.destroy ?? 0}
            </Text>
          )}
          {lastApplyAt && <Text dimColor>Last apply completed: {new Date(lastApplyAt).toLocaleString()}</Text>}
          {lastReportedAt && <Text dimColor>Last report: {new Date(lastReportedAt).toLocaleString()}</Text>}
          {lastStatusUpdatedAt && (
            <Text dimColor>Status updated: {new Date(lastStatusUpdatedAt).toLocaleString()}</Text>
          )}
        </Box>
      )}
      {resolvedOutputs && resolvedOutputs.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>Resolved environment outputs:</Text>
          {resolvedOutputs.map((entry) => (
            <Text key={entry.key} dimColor>
              - {entry.key}: {entry.value}
            </Text>
          ))}
        </Box>
      )}
      {deploymentNotice && (
        <Alert variant="success" title="Completed">
          {deploymentNotice}
        </Alert>
      )}
      {deploymentInProgress && (
        <Alert variant="warning" title="Deployment action running">
          Please wait. Avoid triggering another action until this completes.
        </Alert>
      )}
      {deploymentSteps.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>
            Deployment timeline
            {deploymentStartedAt ? ` (started ${new Date(deploymentStartedAt).toLocaleTimeString()})` : ""}:
          </Text>
          {deploymentSteps.map((step) => (
            <Text key={step.id} dimColor>
              {step.label}: {getStepStatusBadge(step.status)}
            </Text>
          ))}
        </Box>
      )}
      {deploymentPlannedChanges.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>Planned provider changes:</Text>
          {deploymentPlannedChanges.map((change) => (
            <Text key={`${change.address}:${change.actions.join(",")}`} dimColor>
              - [{change.actions.join(",")}] {change.address}
            </Text>
          ))}
        </Box>
      )}
      {deploymentError && (
        <Alert variant="error" title="Action failed">
          {deploymentError}
        </Alert>
      )}
      {deploymentLogs.length > 0 && (
        <Box flexDirection="column">
          <Text dimColor>Recent output:</Text>
          {deploymentLogs.map((line, idx) => (
            <Text key={`${line}-${idx}`} dimColor>
              {line}
            </Text>
          ))}
        </Box>
      )}
      <Select
        options={[
          { label: "Deploy / redeploy", value: "deploy" },
          { label: "Select release", value: "select-release" },
          { label: "Report", value: "report" },
          ...(canDestroy ? [{ label: "Destroy environment", value: "destroy" }] : []),
          { label: "Back to environments", value: "back" },
        ]}
        onChange={(value) => {
          if (actionLocked) return;
          if (value === "back") {
            onBack();
            return;
          }
          if (value === "deploy") {
            onDeploy();
            return;
          }
          if (value === "select-release") {
            onSelectRelease();
            return;
          }
          if (value === "report") {
            onReport();
            return;
          }
          if (value === "destroy") {
            onDestroy();
          }
        }}
      />
    </Box>
  );
}
