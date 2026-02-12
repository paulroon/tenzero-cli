import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { Alert, ConfirmInput, Select, TextInput } from "@inkjs/ui";
import {
  type TzConfig,
  listProjectConfigs,
  loadProjectBuilderConfig,
  getApplicableSteps,
  getApplicablePipelineSteps,
  saveConfig,
  syncProjects,
  type ProjectBuilderConfig,
  type ProjectConfigMeta,
} from "@/lib/config";
import { useBackKey } from "@/hooks/useBackKey";
import { generateProject } from "@/lib/projectGenerator";
import { getStepLabel } from "@/lib/projectGenerator/stepLabels";
import { GenerationError } from "@/lib/projectGenerator/GenerationError";
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

  useEffect(() => {
    const configs = listProjectConfigs();
    setAvailableConfigs(configs);
    if (configs.length === 1) {
      const loaded = loadProjectBuilderConfig(configs[0].id);
      if (loaded) {
        setBuilderConfig(loaded);
        setAnswers(loaded.defaultAnswers ?? {});
        setPhase("questions");
      }
    }
  }, []);

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
      const steps = builderConfig ? getApplicableSteps(builderConfig, answers) : [];
      const prevStep = steps[stepIndex - 1];
      if (prevStep) {
        const newAnswers = { ...answers };
        delete newAnswers[prevStep.id];
        setAnswers(newAnswers);
        setStepIndex(stepIndex - 1);
      }
    } else if (phase === "questions" && stepIndex === 0) {
      setPhase("config-select");
    } else if (phase === "confirm") {
      setPhase("questions");
      setStepIndex(
        builderConfig ? getApplicableSteps(builderConfig, answers).length - 1 : 0
      );
    } else {
      onBack();
    }
  });

  const steps = builderConfig ? getApplicableSteps(builderConfig, answers) : [];
  const currentStep = steps[stepIndex];

  const handleConfigSelect = (id: string) => {
    const loaded = loadProjectBuilderConfig(id);
    if (loaded) {
      setBuilderConfig(loaded);
      setAnswers(loaded.defaultAnswers ?? {});
      setStepIndex(0);
      setPhase("questions");
    }
  };

  const handleAnswer = (value: string) => {
    if (!currentStep) return;
    const newAnswers = { ...answers, [currentStep.id]: value };
    setError(null);

    const stepsAfterAnswer = builderConfig
      ? getApplicableSteps(builderConfig, newAnswers)
      : [];
    const completedIndex = stepsAfterAnswer.findIndex(
      (s) => s.id === currentStep.id
    );
    const hasNextStep =
      completedIndex >= 0 && completedIndex < stepsAfterAnswer.length - 1;

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
            No project configurations found in config/projects/
          </Alert>
        </Box>
      );
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">New Project</Text>
        <Text>Select project type:</Text>
        <Box marginTop={1}>
          <Box>
            <Select
              options={availableConfigs.map((c) => ({
                label: c.label,
                value: c.id,
              }))}
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
          Could not load project configuration
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

  if (!currentStep) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">New Project</Text>
        <Text>No steps to display.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">{builderConfig.label}</Text>
      <Text>
        {currentStep.prompt} ({stepIndex + 1}/{steps.length})
      </Text>
      <Box marginTop={1}>
        {currentStep.type === "text" ? (
          <TextInput
            key={currentStep.id}
            placeholder="Enter value"
            onSubmit={handleAnswer}
          />
        ) : (
          <Box>
            <Select
              options={currentStep.options.map((o) => ({
                label: o.label,
                value: o.value,
              }))}
              onChange={handleAnswer}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
