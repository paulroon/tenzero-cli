import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import MenuBox from "@/ui/components/MenuBox";
import { Alert, ConfirmInput, Select, TextInput } from "@inkjs/ui";
import type { TzConfig } from "@/lib/config";
import { useBackKey } from "@/hooks/useBackKey";
import { useLoading } from "@/contexts/LoadingContext";
import {
  loadProjectBuilderConfig,
  getApplicableSteps,
  type ProjectBuilderConfig,
} from "@/lib/projectBuilderConfig";
import { saveConfig, syncProjects } from "@/lib/config";
import { generateProject } from "@/lib/projectGenerator";
import { join } from "node:path";

type Phase = "questions" | "confirm" | "done";

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
  const { setLoading } = useLoading();
  const [builderConfig, setBuilderConfig] = useState<ProjectBuilderConfig | null>(
    null
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("questions");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadProjectBuilderConfig();
    setBuilderConfig(loaded ?? null);
  }, []);

  useBackKey(() => {
    if (phase === "questions" && stepIndex > 0) {
      const steps = builderConfig ? getApplicableSteps(builderConfig, answers) : [];
      const prevStep = steps[stepIndex - 1];
      if (prevStep) {
        const newAnswers = { ...answers };
        delete newAnswers[prevStep.id];
        setAnswers(newAnswers);
        setStepIndex(stepIndex - 1);
      }
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

  const handleAnswer = (value: string) => {
    if (!currentStep) return;
    const newAnswers = { ...answers, [currentStep.id]: value };
    setError(null);

    // Compute steps with the NEW answer - conditional steps (e.g. symfonyAuth)
    // only appear once their "when" condition is satisfied
    const stepsAfterAnswer = builderConfig
      ? getApplicableSteps(builderConfig, newAnswers)
      : [];
    const completedIndex = stepsAfterAnswer.findIndex(
      (s) => s.id === currentStep.id
    );
    const hasNextStep = completedIndex >= 0 && completedIndex < stepsAfterAnswer.length - 1;

    setAnswers(newAnswers);
    if (hasNextStep) {
      setStepIndex(completedIndex + 1);
    } else {
      setPhase("confirm");
    }
  };

  const handleConfirm = () => {
    setError(null);
    setLoading(true);

    const runCreate = async () => {
      await new Promise<void>((resolve) => {
        setTimeout(async () => {
          try {
            await generateProject(projectDirectory, answers);
            const projectName = answers.projectName?.trim() ?? "";
            const projectPath = join(projectDirectory, projectName);
            const updatedConfig = syncProjects(config);
            saveConfig(updatedConfig);
            onConfigUpdate?.(updatedConfig);
            setPhase("done");
            onProjectSelect?.(projectPath);
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Failed to create project"
            );
          } finally {
            setLoading(false);
            resolve();
          }
        }, 0);
      });
    };

    runCreate();
  };

  if (!builderConfig) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">New Project</Text>
        <Alert variant="error" title="Config not found">
          Could not load project-builder.json
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

  if (phase === "confirm") {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="yellow">Confirm</Text>
        <Text>Create project with these options?</Text>
        <MenuBox flexDirection="column" padding={1} marginTop={1}>
          {Object.entries(answers).map(([key, value]) => (
            <Text key={key}>
              <Text bold>{key}: </Text>
              {value}
            </Text>
          ))}
        </MenuBox>
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
      <Text color="yellow">New Project</Text>
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
          <MenuBox>
            <Select
              options={currentStep.options.map((o) => ({
                label: o.label,
                value: o.value,
              }))}
              onChange={handleAnswer}
            />
          </MenuBox>
        )}
      </Box>
    </Box>
  );
}
