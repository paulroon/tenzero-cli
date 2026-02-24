import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { Alert, Select, StatusMessage, TextInput } from "@inkjs/ui";
import { saveConfig, syncProjects, type TzConfig } from "@/lib/config";
import { evaluateDeploymentsEnablementGate } from "@/lib/deployments/gate";
import { getErrorMessage } from "@/lib/errors";
import { callShell } from "@/lib/shell";
import { ensureGithubOidcRoleForDeployments } from "@/lib/github/oidcRole";
import { useBackKey } from "@/hooks/useBackKey";
import {
  OptionLoadingPanel,
  OptionStatusPanel,
} from "@/ui/menu/options/screens/OptionPanels";

type BackendField = "bucket" | "region" | "profile" | "statePrefix";
type EditPhase = "edit-bucket" | "edit-region" | "edit-profile" | "edit-prefix";
const SCREEN_TITLE = "Deployments";

const BACKEND_FIELD_META: Record<
  BackendField,
  {
    prompt: string;
    placeholder: string;
    phase: EditPhase;
  }
> = {
  bucket: {
    prompt: "Set AWS backend bucket:",
    placeholder: "tz-state-123456789012-eu-west-1",
    phase: "edit-bucket",
  },
  region: {
    prompt: "Set AWS backend region:",
    placeholder: "eu-west-1",
    phase: "edit-region",
  },
  profile: {
    prompt: "Set AWS backend profile:",
    placeholder: "default",
    phase: "edit-profile",
  },
  statePrefix: {
    prompt: "Set backend state prefix:",
    placeholder: "tz/v1/default/my-app",
    phase: "edit-prefix",
  },
};

function getBackendFieldFromPhase(phase: string): BackendField | null {
  for (const [field, meta] of Object.entries(BACKEND_FIELD_META) as Array<[BackendField, (typeof BACKEND_FIELD_META)[BackendField]]>) {
    if (meta.phase === phase) return field;
  }
  return null;
}

export default function DeploymentsScreen({
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
    | "working"
    | EditPhase
    | "done"
    | "error"
  >("menu");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [awsCliInstalled, setAwsCliInstalled] = useState<boolean | null>(null);

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
  const statusRows: Array<{
    label: string;
    value: string;
    color: "green" | "red";
  }> = [
    {
      label: "Deployments mode",
      value: config.deployments?.enabled ? "Enabled" : "Disabled",
      color: config.deployments?.enabled ? "green" : "red",
    },
    {
      label: "AWS integration",
      value: aws?.connected ? "Connected" : "Disconnected",
      color: aws?.connected ? "green" : "red",
    },
    {
      label: "Backend",
      value: backend?.bucket ? `${backend.bucket} (${backend.region || "no-region"})` : "Not configured",
      color: backend?.bucket ? "green" : "red",
    },
    {
      label: "OIDC role",
      value:
        aws?.oidcRoleArn && aws.oidcRoleArn.trim().length > 0
          ? aws.oidcRoleArn
          : "Not configured",
      color: aws?.oidcRoleArn && aws.oidcRoleArn.trim().length > 0 ? "green" : "red",
    },
    {
      label: "Gate status",
      value: gate.allowed ? "Ready" : "Blocked",
      color: gate.allowed ? "green" : "red",
    },
  ];

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
    }) as const;

  const ensureOidcRole = async (): Promise<{ ok: true; roleArn: string; message: string } | { ok: false; message: string }> => {
    const current = ensureBackend();
    if (!current.profile || !current.region) {
      return {
        ok: false,
        message: "Backend profile and region are required before ensuring GitHub OIDC role.",
      };
    }
    return ensureGithubOidcRoleForDeployments({
      profile: current.profile,
      region: current.region,
    });
  };

  const setBackendField = (field: BackendField, value: string) => {
    const current = ensureBackend();
    const next: TzConfig = {
      ...config,
      integrations: {
        ...(config.integrations ?? {}),
        aws: {
          connected: aws?.connected === true,
          oidcRoleArn: aws?.oidcRoleArn,
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

  const runValidationChecks = async () => {
    const current = ensureBackend();
    const hasBackendDetails =
      current.bucket.length > 0 &&
      current.region.length > 0 &&
      current.profile.length > 0 &&
      current.statePrefix.length > 0;
    if (!hasBackendDetails) {
      setErrorMessage("Backend validation failed. Complete all backend config fields and retry.");
      setPhase("error");
      return;
    }

    const oidcResult = await ensureOidcRole();
    if (!oidcResult.ok) {
      setErrorMessage(oidcResult.message);
      setPhase("error");
      return;
    }

    const next: TzConfig = {
      ...config,
      integrations: {
        ...(config.integrations ?? {}),
        aws: {
          connected: aws?.connected === true,
          oidcRoleArn: oidcResult.roleArn,
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
    setStatusMessage(`Backend validation checks passed.\nOIDC role: ${oidcResult.roleArn}`);
    setPhase("done");
  };

  const setAwsConnected = async (connected: boolean) => {
    const currentBackend = ensureBackend();
    const baseNext: TzConfig = {
      ...config,
      integrations: {
        ...(config.integrations ?? {}),
        aws: {
          connected,
          oidcRoleArn: aws?.oidcRoleArn,
          backend: currentBackend,
          backendChecks: aws?.backendChecks,
        },
      },
    };
    if (!connected) {
      updateConfig(baseNext);
      setStatusMessage("AWS integration disconnected.");
      setPhase("done");
      return;
    }

    setPhase("working");
    const oidcResult = await ensureOidcRole();
    if (!oidcResult.ok) {
      updateConfig(baseNext);
      setErrorMessage(`${oidcResult.message} AWS integration is connected, but OIDC role was not ensured.`);
      setPhase("error");
      return;
    }

    const next: TzConfig = {
      ...baseNext,
      integrations: {
        ...(baseNext.integrations ?? {}),
        aws: {
          ...(baseNext.integrations?.aws ?? { connected: true }),
          oidcRoleArn: oidcResult.roleArn,
          backend: currentBackend,
          backendChecks: aws?.backendChecks,
        },
      },
    };
    updateConfig(next);
    setStatusMessage(`AWS integration marked connected.\nOIDC role: ${oidcResult.roleArn}`);
    setPhase("done");
  };

  const runAwsQuickCheck = async () => {
    const current = ensureBackend();
    if (awsCliInstalled === false) {
      setErrorMessage("AWS CLI is not installed. Install it first, then retry AWS quick check.");
      setPhase("error");
      return;
    }
    if (!current.profile || !current.region) {
      setErrorMessage("Backend profile and region are required before running AWS quick check.");
      setPhase("error");
      return;
    }

    const parseCount = (raw?: string): number => {
      const parsed = Number.parseInt((raw ?? "").trim(), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    setPhase("working");
    try {
      const commonArgs = ["--profile", current.profile, "--region", current.region];
      const runAws = async (args: string[], fallbackError: string) => {
        const result = await callShell("aws", args, {
          collect: true,
          quiet: true,
          stdin: "ignore",
          throwOnNonZero: false,
        });
        if (result.exitCode !== 0) {
          throw new Error((result.stderr || result.stdout || fallbackError).trim());
        }
        return result;
      };

      const identityResult = await runAws(
        ["sts", "get-caller-identity", ...commonArgs, "--query", "join(':',[Account,Arn])", "--output", "text"],
        "AWS identity check failed."
      );

      const ec2Result = await runAws(
        ["ec2", "describe-instances", ...commonArgs, "--query", "length(Reservations[].Instances[])", "--output", "text"],
        "AWS EC2 check failed."
      );

      const rdsResult = await runAws(
        ["rds", "describe-db-instances", ...commonArgs, "--query", "length(DBInstances)", "--output", "text"],
        "AWS RDS check failed."
      );

      setStatusMessage(
        [
          `AWS quick check (${current.region} / ${current.profile})`,
          `Identity: ${(identityResult.stdout ?? "").trim()}`,
          `EC2 instances: ${parseCount(ec2Result.stdout)}`,
          `RDS instances: ${parseCount(rdsResult.stdout)}`,
        ].join("\n")
      );
      setPhase("done");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "AWS quick check failed."));
      setPhase("error");
    }
  };

  const enableDeploymentsMode = () => {
    if (!aws?.oidcRoleArn || aws.oidcRoleArn.trim().length === 0) {
      setErrorMessage(
        "Deployments mode requires AWS_OIDC_ROLE_ARN. Run backend validation checks to ensure and capture the role ARN."
      );
      setPhase("error");
      return;
    }
    const latestGate = evaluateDeploymentsEnablementGate(config);
    if (!latestGate.allowed) {
      setErrorMessage(latestGate.issues[0]?.message ?? "Deployments mode gate failed.");
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

  const editField = getBackendFieldFromPhase(phase);
  if (editField) {
    const meta = BACKEND_FIELD_META[editField];
    const defaultValue = backend?.[editField] ?? "";
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">{SCREEN_TITLE}</Text>
        <Text>{meta.prompt}</Text>
        <TextInput
          defaultValue={defaultValue}
          placeholder={meta.placeholder}
          onSubmit={(value) => setBackendField(editField, value)}
        />
      </Box>
    );
  }
  if (phase === "working") {
    return (
      <OptionLoadingPanel
        title={SCREEN_TITLE}
        spinnerLabel="Running AWS quick check..."
        note="Checking identity, EC2 instances, and RDS instances."
      />
    );
  }
  if (phase === "done") {
    return (
      <OptionStatusPanel
        title={SCREEN_TITLE}
        variant="success"
        alertTitle="Completed"
        message={statusMessage ?? "Done"}
        options={[
          { label: "Back to deployments", value: "menu" },
          { label: "Back to options", value: "back" },
        ]}
        onSelect={(value) => {
          if (value === "menu") setPhase("menu");
          else onBack();
        }}
      />
    );
  }
  if (phase === "error") {
    return (
      <OptionStatusPanel
        title={SCREEN_TITLE}
        variant="error"
        alertTitle="Action failed"
        message={errorMessage ?? "Could not complete action."}
        options={[
          { label: "Back to deployments", value: "menu" },
          { label: "Back to options", value: "back" },
        ]}
        onSelect={(value) => {
          if (value === "menu") setPhase("menu");
          else onBack();
        }}
      />
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">{SCREEN_TITLE}</Text>
      <Box flexDirection="column">
        {statusRows.map((row) => (
          <Box key={row.label}>
            <Box width={20}>
              <Text dimColor>{row.label}</Text>
            </Box>
            <Text color={row.color}>{row.value}</Text>
          </Box>
        ))}
      </Box>

      <StatusMessage variant="success">
        <Text dimColor>Deployment actions are performed in the App Dashboard.</Text>
      </StatusMessage>

      {gate.issues.length > 0 && (
        <Box flexDirection="column">
          {gate.issues.map((issue) => (
            <Text key={issue.check} dimColor>
              - {issue.message}
            </Text>
          ))}
        </Box>
      )}
      {awsCliInstalled === false && (
        <Alert variant="warning" title="AWS CLI not installed">
          Recommended for setup/troubleshooting
        </Alert>
      )}
      <Box marginTop={1}>
        <Select
          options={[
            {
              label: aws?.connected ? "Disconnect AWS integration" : "Connect AWS integration",
              value: "toggleAws",
            },
            { label: "Set backend bucket", value: "bucket" },
            { label: "Set backend region", value: "region" },
            { label: "Set backend profile", value: "profile" },
            { label: "Set backend state prefix", value: "prefix" },
            { label: "Run backend validation checks", value: "validate" },
            { label: "AWS quick check (identity, EC2, RDS)", value: "aws-quick-check" },
            { label: "Enable deployments mode", value: "enable" },
            { label: "Back to options", value: "back" },
          ]}
          onChange={(value) => {
            if (value === "toggleAws") {
              void setAwsConnected(!(aws?.connected === true));
              return;
            }
            if (value === "bucket") {
              setPhase(BACKEND_FIELD_META.bucket.phase);
              return;
            }
            if (value === "region") {
              setPhase(BACKEND_FIELD_META.region.phase);
              return;
            }
            if (value === "profile") {
              setPhase(BACKEND_FIELD_META.profile.phase);
              return;
            }
            if (value === "prefix") {
              setPhase(BACKEND_FIELD_META.statePrefix.phase);
              return;
            }
            if (value === "validate") {
              runValidationChecks();
              return;
            }
            if (value === "aws-quick-check") {
              void runAwsQuickCheck();
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
    </Box>
  );
}
