import { useEffect, useState } from "react";
import { loadConfig, saveConfig, type TzConfig } from "@/lib/config";

export type ConfigState =
  | { status: "loading" }
  | { status: "ready"; config: TzConfig }
  | { status: "missing" };

export function useConfig(): [ConfigState, (config: TzConfig) => void] {
  const [state, setState] = useState<ConfigState>({ status: "loading" });

  useEffect(() => {
    const loaded = loadConfig();
    if (loaded) {
      saveConfig(loaded);
      setState({ status: "ready", config: loaded });
    } else {
      setState({ status: "missing" });
    }
  }, []);

  const setConfig = (config: TzConfig) => setState({ status: "ready", config });

  return [state, setConfig];
}
