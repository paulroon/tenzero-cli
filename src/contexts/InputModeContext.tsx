import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

type InputModeContextValue = {
  inputMode: boolean;
  setInputMode: (value: boolean) => void;
};

const InputModeContext = createContext<InputModeContextValue | null>(null);

export function InputModeProvider({ children }: { children: ReactNode }) {
  const [inputMode, setInputMode] = useState(false);
  return (
    <InputModeContext.Provider value={{ inputMode, setInputMode }}>
      {children}
    </InputModeContext.Provider>
  );
}

export function useInputMode() {
  const ctx = useContext(InputModeContext);
  return ctx ?? { inputMode: false, setInputMode: () => {} };
}
