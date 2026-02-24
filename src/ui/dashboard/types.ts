export type DeploymentStepId = "plan" | "drift-check" | "apply";
export type DeploymentStepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export type DeploymentStep = {
  id: DeploymentStepId;
  label: string;
  status: DeploymentStepStatus;
};

export type PlannedChange = {
  address: string;
  actions: string[];
  providerName?: string;
  resourceType?: string;
};

export type ReleaseBuildMonitorState = {
  tag: string;
  stage: "pushing" | "waiting" | "running" | "completed" | "failed";
  message: string;
  runUrl?: string;
  preflightSummary?: string;
};

export type ReleaseSelection = {
  selectedImageRef?: string;
  selectedReleaseTag?: string;
};
