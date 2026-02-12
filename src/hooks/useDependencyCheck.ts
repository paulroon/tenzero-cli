import { useEffect, useState } from "react";
import { getDependencyStatus } from "@/lib/dependencies";

export type DependencyCheckStatus = "loading" | "failed" | "ok";

export type FailedDep = {
  name: string;
  instructions: readonly string[];
};

export function useDependencyCheck(): {
  status: DependencyCheckStatus;
  failedDeps: FailedDep[];
} {
  const [status, setStatus] = useState<DependencyCheckStatus>("loading");
  const [failedDeps, setFailedDeps] = useState<FailedDep[]>([]);

  useEffect(() => {
    getDependencyStatus().then((results) => {
      const failed = results.filter((r) => !r.installed);
      setStatus(failed.length === 0 ? "ok" : "failed");
      setFailedDeps(
        failed.map((r) => ({ name: r.name, instructions: r.instructions }))
      );
    });
  }, []);

  return { status, failedDeps };
}
