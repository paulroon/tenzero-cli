import { Box, Text, useInput } from "ink";
import { useInputMode } from "../contexts/InputModeContext";
import { useCurrentProject } from "../contexts/CurrentProjectContext";

type Props = {
  onBack: () => void;
};

export default function ProjectScreen({ onBack }: Props) {
  const { currentProject, clearCurrentProject } = useCurrentProject();
  const { inputMode } = useInputMode();

  useInput(
    (input, key) => {
      const isBack = key.escape || (!inputMode && (input === "b" || input === "B"));
      if (isBack) {
        clearCurrentProject();
        onBack();
      }
    },
    { isActive: true }
  );

  if (!currentProject) return null;

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">{currentProject.name}</Text>
      {/* Space for more content */}
    </Box>
  );
}
