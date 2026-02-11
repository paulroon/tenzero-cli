import { useEffect, useState } from "react";
import { loadConfig, saveConfig, type TzConfig } from "../lib/config";

export function useConfig() {
  const [config, setConfig] = useState<TzConfig | null | "loading">("loading");

  useEffect(() => {
    const loaded = loadConfig();
    if (loaded) {
      saveConfig(loaded); // persist synced projects
      setConfig(loaded);
    } else {
      setConfig(null);
    }
  }, []);

  return [config, setConfig] as const;
}
