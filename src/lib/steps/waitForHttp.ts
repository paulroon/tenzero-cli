import type { StepContext, StepExecutor } from "./types";
import { resolveStepConfig } from "./types";

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export const waitForHttp: StepExecutor = async (ctx: StepContext, config) => {
  const resolved = resolveStepConfig(config, ctx);
  const url = resolved.url;
  const timeoutMs =
    typeof resolved.timeoutMs === "number" ? resolved.timeoutMs : 120_000;
  const intervalMs =
    typeof resolved.intervalMs === "number" ? resolved.intervalMs : 2_000;

  if (typeof url !== "string" || url.trim().length === 0) {
    throw new Error("waitForHttp step requires 'url' string");
  }
  if (timeoutMs <= 0) {
    throw new Error("waitForHttp step requires 'timeoutMs' > 0");
  }
  if (intervalMs <= 0) {
    throw new Error("waitForHttp step requires 'intervalMs' > 0");
  }

  const deadline = Date.now() + timeoutMs;
  const errors: string[] = [];

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) return;
      errors.push(`HTTP ${response.status}`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "request failed");
    }
    await wait(intervalMs);
  }

  const tailErrors = errors.slice(-3).join(" | ");
  throw new Error(
    `Timed out waiting for ${url} after ${timeoutMs}ms${
      tailErrors ? ` (${tailErrors})` : ""
    }`
  );
};
