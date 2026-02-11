import { useInput } from "ink";
import type { TzConfig } from "../../../lib/config";
import { useInputMode } from "../../../contexts/InputModeContext";
import NotYetImplemented from "../../NotYetImplemented";

type Props = {
  config: TzConfig;
  onBack: () => void;
  projectDirectory: string;
};

export default function NextJsHandler({ onBack, projectDirectory }: Props) {
  const { inputMode } = useInputMode();

  useInput(
    (input, key) => {
      const isBack = key.escape || (!inputMode && (input === "b" || input === "B"));
      if (isBack) onBack();
    },
    { isActive: true }
  );

  return <NotYetImplemented message="Not yet implemented" />;
}
