import { useInput } from "ink";
import { useInputMode } from "@/contexts/InputModeContext";

export function useBackKey(onBack: () => void) {
  const { inputMode } = useInputMode();
  useInput(
    (input, key) => {
      const isBack =
        key.escape || (!inputMode && (input === "b" || input === "B"));
      if (isBack) onBack();
    },
    { isActive: true }
  );
}
