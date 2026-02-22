import { useCallback, useEffect, useState } from "react";
import { Box, Text } from "ink";
import {
  Alert,
  ConfirmInput,
  MultiSelect,
  Select,
  Spinner,
  TextInput,
} from "@inkjs/ui";
import {
  type TzConfig,
  listProjectConfigs,
  loadProjectBuilderConfig,
  getApplicableQuestionNodes,
  getApplicableSteps,
  getApplicablePipelineSteps,
  saveConfig,
  syncProjects,
  type BuilderQuestionNode,
  type ProjectBuilderConfig,
  type ProjectConfigMeta,
} from "@/lib/config";
import { useBackKey } from "@/hooks/useBackKey";
import { generateProject } from "@/lib/projectGenerator";
import { getStepLabel } from "@/lib/projectGenerator/stepLabels";
import { GenerationError } from "@/lib/projectGenerator/GenerationError";
import {
  getProjectDependencyStatus,
  getProjectSecretStatus,
} from "@/lib/dependencies";
import GenerationOutput, {
  type GenerationStep,
} from "@/ui/components/GenerationOutput";
import { join } from "node:path";

type Phase =
  | "config-select"
  | "questions"
  | "confirm"
  | "generating"
  | "generation-error"
  | "done";

type Props = {
  config: TzConfig;
  onBack: () => void;
  projectDirectory: string;
  onConfigUpdate?: (config: TzConfig) => void;
  onProjectSelect?: (projectPath: string) => void;
};

const CONFIG_PLACEHOLDER_VALUE = "__select_project_config__";

export default function ProjectBuilder({
  config,
  onBack,
  projectDirectory,
  onConfigUpdate,
  onProjectSelect,
}: Props) {
  const [availableConfigs, setAvailableConfigs] = useState<ProjectConfigMeta[]>(
    []
  );
  const [builderConfig, setBuilderConfig] =
    useState<ProjectBuilderConfig | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("config-select");
  const [error, setError] = useState<string | null>(null);
  const [generationSteps, setGenerationSteps] = useState<GenerationStep[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationLastOutput, setGenerationLastOutput] = useState<{
    stdout?: string;
    stderr?: string;
  } | null>(null);
  const [checkingDependencies, setCheckingDependencies] = useState(false);
  const [failedDeps, setFailedDeps] = useState<
    Array<{ name: string; instructions: readonly string[] }>
  >([]);
  const [failedConfigLabel, setFailedConfigLabel] = useState<string | null>(null);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [selectionRequest, setSelectionRequest] = useState(0);

  const getNodeKey = (node: BuilderQuestionNode): string =>
    node.kind === "step" ? `step:${node.step.id}` : `group:${node.id}`;

  const getQuestionNodes = (
    cfg: ProjectBuilderConfig | null,
    currentAnswers: Record<string, string>
  ): BuilderQuestionNode[] =>
    cfg ? getApplicableQuestionNodes(cfg, currentAnswers) : [];

  const selectConfig = useCallback(async (id: string) => {
    const loaded = loadProjectBuilderConfig(id);
    if (!loaded) return;
    const configLabel = loaded.label;
    setCheckingDependencies(true);
    setFailedDeps([]);
    setFailedConfigLabel(null);

    try {
      const [dependencyStatuses, secretStatuses] = await Promise.all([
        getProjectDependencyStatus(loaded.dependencies, loaded.defaultAnswers ?? {}),
        getProjectSecretStatus(
          loaded.secretDependencies ?? [],
          loaded.defaultAnswers ?? {}
        ),
      ]);
      const statuses = [...dependencyStatuses, ...secretStatuses];
      const missing = statuses.filter((d) => !d.installed);
      if (missing.length > 0) {
        setFailedDeps(
          missing.map((d) => ({ name: d.name, instructions: d.instructions }))
        );
        setFailedConfigLabel(configLabel);
        setBuilderConfig(null);
        setAnswers({});
        setStepIndex(0);
        setPhase("config-select");
        return;
      }

      setBuilderConfig(loaded);
      setAnswers(loaded.defaultAnswers ?? {});
      setStepIndex(0);
      setPhase("questions");
    } finally {
      setCheckingDependencies(false);
    }
  }, []);

  useEffect(() => {
    const configs = listProjectConfigs();
    setAvailableConfigs(configs);
    if (configs.length === 1) {
      setSelectedConfigId(configs[0].id);
      setSelectionRequest((prev) => prev + 1);
    }
  }, []);

  useEffect(() => {
    if (!selectedConfigId) return;
    void selectConfig(selectedConfigId);
  }, [selectedConfigId, selectionRequest, selectConfig]);

  useBackKey(() => {
    if (phase === "config-select") {
      onBack();
    } else if (phase === "generating") {
      // Cannot go back while generating
    } else if (phase === "generation-error") {
      setPhase("confirm");
      setGenerationError(null);
      setGenerationLastOutput(null);
    } else if (phase === "questions" && stepIndex > 0) {
      const nodes = getQuestionNodes(builderConfig, answers);
      const prevNode = nodes[stepIndex - 1];
      if (!prevNode) return;
      const newAnswers = { ...answers };
      if (prevNode.kind === "step") {
        delete newAnswers[prevNode.step.id];
      } else {
        for (const groupedStep of prevNode.steps) {
          delete newAnswers[groupedStep.id];
        }
      }
      setAnswers(newAnswers);
      setStepIndex(stepIndex - 1);
    } else if (phase === "questions" && stepIndex === 0) {
      setPhase("config-select");
    } else if (phase === "confirm") {
      setPhase("questions");
      setStepIndex(
        builderConfig ? getQuestionNodes(builderConfig, answers).length - 1 : 0
      );
    } else {
      onBack();
    }
  });

  const questionNodes = getQuestionNodes(builderConfig, answers);
  const steps = builderConfig ? getApplicableSteps(builderConfig, answers) : [];
  const currentNode = questionNodes[stepIndex];

  const handleConfigSelect = useCallback((id: string) => {
    if (checkingDependencies) return;
    if (id === CONFIG_PLACEHOLDER_VALUE) return;
    setSelectedConfigId((prev) => {
      if (prev === id) return prev;
      setSelectionRequest((count) => count + 1);
      return id;
    });
  }, [checkingDependencies]);

  const handleStepAnswer = (value: string) => {
    if (!currentNode || currentNode.kind !== "step") return;
    const nodeKey = getNodeKey(currentNode);
    const newAnswers = { ...answers, [currentNode.step.id]: value };
    setError(null);

    const nodesAfterAnswer = getQuestionNodes(builderConfig, newAnswers);
    const completedIndex = nodesAfterAnswer.findIndex(
      (node) => getNodeKey(node) === nodeKey
    );
    const hasNextStep =
      completedIndex >= 0 && completedIndex < nodesAfterAnswer.length - 1;

    setAnswers(newAnswers);
    if (hasNextStep) {
      setStepIndex(completedIndex + 1);
    } else {
      setPhase("confirm");
    }
  };

  const handleBooleanGroupSubmit = (selectedIds: string[]) => {
    if (!currentNode || currentNode.kind !== "boolean-group") return;
    const nodeKey = getNodeKey(currentNode);
    const selected = new Set(selectedIds);
    const newAnswers = { ...answers };
    for (const step of currentNode.steps) {
      newAnswers[step.id] = selected.has(step.id) ? "true" : "false";
    }
    setError(null);

    const nodesAfterAnswer = getQuestionNodes(builderConfig, newAnswers);
    const completedIndex = nodesAfterAnswer.findIndex(
      (node) => getNodeKey(node) === nodeKey
    );
    const hasNextStep =
      completedIndex >= 0 && completedIndex < nodesAfterAnswer.length - 1;

    setAnswers(newAnswers);
    if (hasNextStep) {
      setStepIndex(completedIndex + 1);
    } else {
      setPhase("confirm");
    }
  };

  const handleConfirm = () => {
    setError(null);
    if (!builderConfig) return;

    const projectName = answers.projectName?.trim() ?? "";
    const projectPath = join(projectDirectory, projectName);
    const ctx = {
      projectDirectory,
      projectPath,
      projectName,
      answers,
      profile: { name: config.name, email: config.email ?? "" },
      configDir: builderConfig._configDir,
    };

    const applicableSteps = getApplicablePipelineSteps(
      builderConfig.pipeline,
      answers
    );
    const allSteps = [
      ...applicableSteps,
      { type: "finalize", config: { projectType: builderConfig.type } },
    ];
    const initialSteps: GenerationStep[] = allSteps.map((step) => ({
      label: getStepLabel(
        step as Parameters<typeof getStepLabel>[0],
        ctx as Parameters<typeof getStepLabel>[1]
      ),
      status: "pending",
    }));
    setGenerationSteps(initialSteps);
    setGenerationError(null);
    setGenerationLastOutput(null);
    setPhase("generating");

    const runCreate = async () => {
      try {
        await generateProject(projectDirectory, answers, {
          pipeline: builderConfig.pipeline,
          configDir: builderConfig._configDir,
          projectType: builderConfig.type,
          profile: { name: config.name, email: config.email ?? "" },
          onProgress: (progress) => {
            setGenerationSteps((prev) =>
              prev.map((s, i) => ({
                ...s,
                status:
                  i < progress.index
                    ? "done"
                    : i === progress.index
                      ? progress.status
                      : "pending",
              }))
            );
          },
        });
        const updatedConfig = syncProjects(config);
        saveConfig(updatedConfig);
        onConfigUpdate?.(updatedConfig);
        setPhase("done");
        onProjectSelect?.(projectPath);
      } catch (err) {
        const errMessage =
          err instanceof Error ? err.message : "Failed to create project";
        const lastOutput =
          err instanceof GenerationError ? err.lastOutput : null;
        setGenerationError(errMessage);
        setGenerationLastOutput(lastOutput ?? null);
        setPhase("generation-error");
      }
    };

    void runCreate();
  };

  if (phase === "config-select") {
    if (availableConfigs.length === 0) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="yellow">New Project</Text>
          <Alert variant="error" title="No configs found">
            No app templates found in config/projects/
          </Alert>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">New Project</Text>
        <Text>Select project type:</Text>
        {checkingDependencies && (
          <Box marginTop={1}>
            <Spinner label="Checking template requirements" />
          </Box>
        )}
        {failedDeps.length > 0 && (
          <Box flexDirection="column" marginTop={1} gap={1}>
            <Alert variant="error" title="Missing requirements">
              {failedConfigLabel
                ? `${failedConfigLabel} is missing required dependencies/secrets.`
                : "Selected template is missing required dependencies/secrets."}
            </Alert>
            {failedDeps.map((dep) => (
              <Box key={dep.name} flexDirection="column" gap={0}>
                <Text color="red">{dep.name} not found</Text>
                {dep.instructions.map((line, index) => (
                  <Text key={`${dep.name}-${index}`} dimColor={!!line}>
                    {line || " "}
                  </Text>
                ))}
              </Box>
            ))}
          </Box>
        )}
        <Box marginTop={1}>
          <Box>
            <Select
              isDisabled={checkingDependencies}
              defaultValue={CONFIG_PLACEHOLDER_VALUE}
              options={[
                { label: "Select a project template...", value: CONFIG_PLACEHOLDER_VALUE },
                ...availableConfigs.map((c) => ({
                  label: c.label,
                  value: c.id,
                })),
              ]}
              onChange={handleConfigSelect}
            />
          </Box>
        </Box>
      </Box>
    );
  }

  if (!builderConfig) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">New Project</Text>
        <Alert variant="error" title="Config not found">
          Could not load app template
        </Alert>
      </Box>
    );
  }

  if (phase === "done") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="green">Project created successfully!</Text>
        <Text dimColor>Press Esc to go back.</Text>
      </Box>
    );
  }

  if (phase === "generating" || phase === "generation-error") {
    return (
      <GenerationOutput
        steps={generationSteps}
        error={generationError ?? undefined}
        lastOutput={generationLastOutput ?? undefined}
      />
    );
  }

  if (phase === "confirm") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Confirm</Text>
        <Text>
          Create {builderConfig.label} with these options?
        </Text>
        <Box flexDirection="column" padding={1} marginTop={1}>
          {steps.map((step) => (
            <Text key={step.id}>
              <Text bold>{step.prompt} </Text>
              {answers[step.id] ?? "(empty)"}
            </Text>
          ))}
        </Box>
        {error && (
          <Box marginTop={1}>
            <Alert variant="error">{error}</Alert>
          </Box>
        )}
        <Box marginTop={1}>
          <ConfirmInput
            defaultChoice="confirm"
            onConfirm={handleConfirm}
            onCancel={() => setPhase("questions")}
          />
        </Box>
      </Box>
    );
  }

  if (!currentNode) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">New Project</Text>
        <Text>No steps to display.</Text>
      </Box>
    );
  }

  if (currentNode.kind === "boolean-group") {
    const defaultValue = currentNode.steps
      .filter((step) => answers[step.id] === "true")
      .map((step) => step.id);
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">{builderConfig.label}</Text>
        <Text>
          {currentNode.label} ({stepIndex + 1}/{questionNodes.length})
        </Text>
        <Box marginTop={1}>
          <MultiSelect
            options={currentNode.steps.map((step) => ({
              label: step.prompt,
              value: step.id,
            }))}
            defaultValue={defaultValue}
            onSubmit={handleBooleanGroupSubmit}
          />
        </Box>
      </Box>
    );
  }

  const currentStep = currentNode.step;
  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">{builderConfig.label}</Text>
      <Text>
        {currentStep.prompt} ({stepIndex + 1}/{questionNodes.length})
      </Text>
      <Box marginTop={1}>
        {currentStep.type === "text" ? (
          <TextInput
            key={currentStep.id}
            placeholder="Enter value"
            onSubmit={handleStepAnswer}
          />
        ) : currentStep.type === "select" ? (
          <Box>
            <Select
              options={currentStep.options.map((o) => ({
                label: o.label,
                value: o.value,
              }))}
              onChange={handleStepAnswer}
            />
          </Box>
        ) : (
          <Box>
            <Select
              options={[
                { label: currentStep.trueLabel ?? "Yes", value: "true" },
                { label: currentStep.falseLabel ?? "No", value: "false" },
              ]}
              onChange={handleStepAnswer}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
