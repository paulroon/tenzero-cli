import { describe, expect, test } from "bun:test";
import type { AwsBackendSettings, OpenTofuPlanResourceChange } from "@/lib/deployments/openTofuRunner";
import { OpenTofuEngine } from "@/lib/deployments/openTofuEngine";

const backend: AwsBackendSettings = {
  bucket: "acme-state",
  region: "eu-west-2",
  profile: "default",
  statePrefix: "tz/user/demo",
  lockStrategy: "s3-lockfile",
};

describe("open tofu engine", () => {
  test("plan maps summary and drift status", async () => {
    const runner = {
      runPlanWithJson: async () => ({
        run: {
          exitCode: 0,
          stdout: "Plan: 1 to add, 2 to change, 0 to destroy.",
          stderr: "",
          logs: ["plan output"],
        },
        plannedChanges: [
          {
            address: "aws_apprunner_service.app[0]",
            actions: ["create"],
          } as OpenTofuPlanResourceChange,
        ],
      }),
    } as unknown as ConstructorParameters<typeof OpenTofuEngine>[0]["runner"];

    const engine = new OpenTofuEngine({ backend, runner });
    const result = await engine.plan({ projectPath: "/tmp/demo", environmentId: "prod" });
    expect(result.status).toBe("drifted");
    expect(result.summary.add).toBe(1);
    expect(result.summary.change).toBe(2);
    expect(result.driftDetected).toBe(true);
    expect(result.plannedChanges?.length).toBe(1);
  });

  test("apply reads provider outputs", async () => {
    const runner = {
      run: async () => ({
        exitCode: 0,
        stdout: "Apply complete! Resources: 0 added, 1 changed, 0 destroyed.",
        stderr: "",
        logs: ["apply output"],
      }),
      runOutputValues: async () => ({
        APP_BASE_URL: "https://prod.example.com",
      }),
    } as unknown as ConstructorParameters<typeof OpenTofuEngine>[0]["runner"];
    const engine = new OpenTofuEngine({ backend, runner });
    const result = await engine.apply({ projectPath: "/tmp/demo", environmentId: "prod" });
    expect(result.status).toBe("healthy");
    expect(result.summary.change).toBe(1);
    expect(result.providerOutputs?.APP_BASE_URL).toBe("https://prod.example.com");
  });

  test("report marks drifted on plan exit code 2", async () => {
    const runner = {
      run: async () => ({
        exitCode: 2,
        stdout: "Plan: 0 to add, 1 to change, 0 to destroy.",
        stderr: "",
        logs: ["report output"],
      }),
      runOutputValues: async () => ({
        APP_BASE_URL: "https://prod.example.com",
      }),
    } as unknown as ConstructorParameters<typeof OpenTofuEngine>[0]["runner"];
    const engine = new OpenTofuEngine({ backend, runner });
    const result = await engine.report({ projectPath: "/tmp/demo", environmentId: "prod" });
    expect(result.status).toBe("drifted");
    expect(result.driftDetected).toBe(true);
    expect(result.providerOutputs?.APP_BASE_URL).toBe("https://prod.example.com");
  });

  test("report returns failed with error message on non-standard exit code", async () => {
    const runner = {
      run: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "backend unavailable",
        logs: ["report failed"],
      }),
    } as unknown as ConstructorParameters<typeof OpenTofuEngine>[0]["runner"];
    const engine = new OpenTofuEngine({ backend, runner });
    const result = await engine.report({ projectPath: "/tmp/demo", environmentId: "prod" });
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("backend unavailable");
  });
});
