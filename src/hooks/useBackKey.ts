import { useInput } from "ink";

export function useBackKey(onBack: () => void) {
  useInput(
    (_input, key) => {
      if (key.escape) onBack();
    },
    { isActive: true }
  );
}
