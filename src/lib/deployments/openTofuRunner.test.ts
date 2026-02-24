import { describe, expect, test } from "bun:test";
import {
  OpenTofuDockerRunner,
  buildOpenTofuDockerArgs,
  type OpenTofuRunInput,
} from "@/lib/deployments/openTofuRunner";

const runInput: OpenTofuRunInput = {
  projectPath: "/tmp/demo",
  environmentId: "uat",
  backend: {
    bucket: "acme-state",
    region: "ap-southeast-2",
    profile: "default",
    statePrefix: "tz/user-123/app-demo",
    lockStrategy: "s3-lockfile",
  },
};

describe("open tofu docker runner", () => {
  test("builds docker args with backend wiring", () => {
    const args = buildOpenTofuDockerArgs("ghcr.io/opentofu/opentofu:1.8.8", "plan", runInput);
    const joined = args.join(" ");

    expect(joined.includes("TZ_AWS_BACKEND_BUCKET=acme-state")).toBe(true);
    expect(joined.includes("TZ_AWS_BACKEND_STATE_PREFIX=tz/user-123/app-demo")).toBe(true);
    expect(joined.includes("TZ_AWS_BACKEND_STATE_KEY=tz/user-123/app-demo/uat/tofu.tfstate")).toBe(
      true
    );
    expect(joined.includes("plan -input=false -no-color")).toBe(true);
    expect(joined.includes("TF_IN_AUTOMATION=1")).toBe(true);
  });

  test("invokes docker via injected shell executor", async () => {
    let captured: { cmd: string; args: string[] } | undefined;
    const runner = new OpenTofuDockerRunner({
      shellExecutor: async (cmd, args) => {
        captured = { cmd, args };
        return {
          exitCode: 0,
          stdout: "Plan: 1 to add, 0 to change, 0 to destroy.",
          stderr: "",
        };
      },
    });

    const result = await runner.run("plan", runInput);
    expect(captured?.cmd).toBe("docker");
    expect(captured?.args.includes("ghcr.io/opentofu/opentofu:1.8.8")).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.includes("Plan: 1 to add")).toBe(true);
  });
});
