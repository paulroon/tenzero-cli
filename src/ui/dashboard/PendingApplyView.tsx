import React from "react";
import { Box, Text } from "ink";
import { Alert, Select } from "@inkjs/ui";
import type { PlannedChange } from "@/ui/dashboard/types";

type PlannedChangeSummary = {
  create: number;
  update: number;
  delete: number;
  replace: number;
  other: number;
};

function summarizePlannedChanges(changes: PlannedChange[]): PlannedChangeSummary {
  const summary: PlannedChangeSummary = {
    create: 0,
    update: 0,
    delete: 0,
    replace: 0,
    other: 0,
  };
  for (const change of changes) {
    const actionSet = new Set(change.actions);
    if (actionSet.has("create") && actionSet.has("delete")) {
      summary.replace += 1;
      continue;
    }
    if (actionSet.has("create")) {
      summary.create += 1;
      continue;
    }
    if (actionSet.has("update")) {
      summary.update += 1;
      continue;
    }
    if (actionSet.has("delete")) {
      summary.delete += 1;
      continue;
    }
    summary.other += 1;
  }
  return summary;
}

type Props = {
  environmentId: string;
  deploymentPlannedChanges: PlannedChange[];
  onProceed: () => void;
  onCancel: () => void;
};

export function PendingApplyView({
  environmentId,
  deploymentPlannedChanges,
  onProceed,
  onCancel,
}: Props) {
  const summary = summarizePlannedChanges(deploymentPlannedChanges);
  const hasHighRiskChanges = summary.delete > 0 || summary.replace > 0;

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow" bold>
        Confirm apply ({environmentId})
      </Text>
      <Text>Plan completed. Review provider changes before starting apply.</Text>
      <Text dimColor>
        Summary: create={summary.create}, update={summary.update}, delete={summary.delete}, replace=
        {summary.replace}
        {summary.other > 0 ? `, other=${summary.other}` : ""}
      </Text>
      {hasHighRiskChanges ? (
        <Alert variant="warning" title="Risk: destructive changes detected">
          This plan includes {summary.delete} delete(s) and {summary.replace} replacement(s). Verify
          carefully before apply.
        </Alert>
      ) : (
        <Alert variant="info" title="Risk: no destructive changes">
          No deletes or replacements detected in this plan.
        </Alert>
      )}
      {deploymentPlannedChanges.length === 0 ? (
        <Text dimColor>No provider resource changes detected.</Text>
      ) : (
        <Box flexDirection="column">
          <Text dimColor>Planned provider changes:</Text>
          {deploymentPlannedChanges.slice(0, 20).map((change) => (
            <Text key={`${change.address}:${change.actions.join(",")}`} dimColor>
              - [{change.actions.join(",")}] {change.address}
            </Text>
          ))}
          {deploymentPlannedChanges.length > 20 && (
            <Text dimColor>...and {deploymentPlannedChanges.length - 20} more change(s).</Text>
          )}
        </Box>
      )}
      <Select
        options={[
          { label: "Proceed to apply", value: "proceed" },
          { label: "Cancel apply", value: "cancel" },
        ]}
        onChange={(value) => {
          if (value === "proceed") {
            onProceed();
            return;
          }
          onCancel();
        }}
      />
    </Box>
  );
}
