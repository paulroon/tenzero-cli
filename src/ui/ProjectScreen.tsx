import { Box, Text } from "ink";
import { useBackKey } from "@/hooks/useBackKey";
import { useCurrentProject } from "@/contexts/CurrentProjectContext";

type Props = {
  onBack: () => void;
};

export default function ProjectScreen({ onBack }: Props) {
  const { currentProject, clearCurrentProject } = useCurrentProject();

  useBackKey(() => {
    clearCurrentProject();
    onBack();
  });

  if (!currentProject) return null;

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">{currentProject.name}</Text>
      {/* Space for more content */}
    </Box>
  );
}
