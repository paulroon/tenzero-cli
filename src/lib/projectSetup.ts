import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { callShell } from "./shell";
import { TZ_PROJECT_CONFIG_FILENAME } from "./paths";
import {
  getProjectReleaseConfigPath,
  saveProjectConfig,
  type ProjectOpenWith,
  type ProjectType,
} from "./config";
import type { ProjectBuilderAnswers } from "./steps/types";
import { bootstrapGithubRepoVariables } from "@/lib/github/repoVariables";
import { ensureGithubOriginForProject } from "@/lib/github/repoLifecycle";

const INITIAL_COMMIT_MESSAGE = "Initial Tz Project setup";
const FINALIZE_STATUS_PATH = [".tz", "finalize-status.json"];
const TENZERO_GITIGNORE_ENTRIES = [
  TZ_PROJECT_CONFIG_FILENAME,
  ".tz/finalize-status.json",
  ".tz/infra/",
] as const;

function isDockerizedValue(value: unknown): boolean {
  return value === "yes" || value === "true";
}

function resolveOpenWith(config: {
  type: ProjectType;
  builderAnswers?: ProjectBuilderAnswers;
}): ProjectOpenWith | undefined {
  if (config.type !== "nextjs") return undefined;

  const dockerized = isDockerizedValue(config.builderAnswers?.dockerize);
  return {
    type: "browser",
    url: dockerized ? "http://localhost:9000" : "http://localhost:3000",
  };
}

/**
 * Finalizes a newly generated project: removes .git, updates .gitignore,
 * writes .tzconfig.json, inits git, and makes initial commit.
 */
export async function finalizeTzProjectSetup(
  projectPath: string,
  config: {
    name: string;
    type: ProjectType;
    builderAnswers?: ProjectBuilderAnswers;
    bootstrapReleaseConfig?: boolean;
    bootstrapReleaseWorkflow?: boolean;
    awsRegionForReleaseWorkflow?: string;
  }
): Promise<void> {
  const finalizeStatus: {
    githubOrigin?: {
      status: "configured" | "skipped" | "error";
      message: string;
    };
    githubRepoVariables?: {
      status: "configured" | "skipped" | "error";
      message: string;
    };
  } = {};

  const gitDir = join(projectPath, ".git");
  if (existsSync(gitDir)) {
    rmSync(gitDir, { recursive: true });
  }

  const gitignorePath = join(projectPath, ".gitignore");
  const tenZeroIgnoreBlock = `\n###> TenZero ###\n${TENZERO_GITIGNORE_ENTRIES.join("\n")}\n###< TenZero ###\n`;
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    const hasAllEntries = TENZERO_GITIGNORE_ENTRIES.every((entry) => content.includes(entry));
    if (!hasAllEntries) {
      const entry = content.endsWith("\n")
        ? `${tenZeroIgnoreBlock}\n`
        : `\n${tenZeroIgnoreBlock}\n`;
      writeFileSync(gitignorePath, content + entry, "utf-8");
    }
  } else {
    writeFileSync(gitignorePath, `${TENZERO_GITIGNORE_ENTRIES.join("\n")}\n`, "utf-8");
  }

  saveProjectConfig(projectPath, {
    ...config,
    openWith: resolveOpenWith(config),
  });
  if (config.bootstrapReleaseConfig) {
    const releaseConfigPath = getProjectReleaseConfigPath(projectPath);
    const releaseDir = join(projectPath, ".tz");
    mkdirSync(releaseDir, { recursive: true });
    if (!existsSync(releaseConfigPath)) {
      writeFileSync(releaseConfigPath, "version: 0.1.0\ntagPrefix: v\n", "utf-8");
    }
  }
  if (config.bootstrapReleaseWorkflow) {
    const workflowDir = join(projectPath, ".github", "workflows");
    const workflowPath = join(workflowDir, "release.yml");
    mkdirSync(workflowDir, { recursive: true });
    if (!existsSync(workflowPath)) {
      writeFileSync(
        workflowPath,
        `name: Release Image

on:
  push:
    tags:
      - "v*"

permissions:
  contents: read
  id-token: write

env:
  AWS_REGION: \${{ vars.AWS_REGION }}
  AWS_ACCOUNT_ID: \${{ vars.AWS_ACCOUNT_ID }}
  AWS_OIDC_ROLE_ARN: \${{ vars.AWS_OIDC_ROLE_ARN }}
  ECR_REPOSITORY: \${{ vars.ECR_REPOSITORY }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Validate release vars
        id: vars
        shell: bash
        run: |
          set -euo pipefail
          missing=()
          for key in AWS_REGION AWS_ACCOUNT_ID AWS_OIDC_ROLE_ARN ECR_REPOSITORY; do
            value="\${!key:-}"
            if [ -z "$value" ]; then
              missing+=("$key")
            fi
          done
          if [ "\${#missing[@]}" -gt 0 ]; then
            echo "Missing repo variables: \${missing[*]}"
            {
              echo "## Release workflow configuration error"
              echo ""
              echo "Missing required repository variables:"
              for key in "\${missing[@]}"; do
                echo "- $key"
              done
            } >> "$GITHUB_STEP_SUMMARY"
            exit 1
          fi

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ env.AWS_OIDC_ROLE_ARN }}
          aws-region: \${{ env.AWS_REGION }}

      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push release image
        id: push
        shell: bash
        run: |
          set -euo pipefail
          IMAGE_URI="\${AWS_ACCOUNT_ID}.dkr.ecr.\${AWS_REGION}.amazonaws.com/\${ECR_REPOSITORY}"
          RELEASE_TAG="\${GITHUB_REF_NAME}"
          SHORT_SHA="\${GITHUB_SHA::12}"

          docker build -t "\${IMAGE_URI}:\${RELEASE_TAG}" -t "\${IMAGE_URI}:\${SHORT_SHA}" .
          docker push "\${IMAGE_URI}:\${RELEASE_TAG}"
          docker push "\${IMAGE_URI}:\${SHORT_SHA}"

          DIGEST="$(aws ecr describe-images \\
            --repository-name "\${ECR_REPOSITORY}" \\
            --image-ids imageTag="\${RELEASE_TAG}" \\
            --query 'imageDetails[0].imageDigest' \\
            --output text)"

          echo "image_uri=\${IMAGE_URI}" >> "$GITHUB_OUTPUT"
          echo "image_tag=\${RELEASE_TAG}" >> "$GITHUB_OUTPUT"
          echo "image_digest=\${DIGEST}" >> "$GITHUB_OUTPUT"
          echo "image_ref=\${IMAGE_URI}@\${DIGEST}" >> "$GITHUB_OUTPUT"

          {
            echo "## Release image published"
            echo ""
            echo "- Tag: \${RELEASE_TAG}"
            echo "- Digest ref: \${IMAGE_URI}@\${DIGEST}"
          } >> "$GITHUB_STEP_SUMMARY"
`,
        "utf-8"
      );
    }
  }

  await runGit(projectPath, ["init"]);
  await runGit(projectPath, ["add", "."]);
  await runGit(projectPath, ["commit", "-m", INITIAL_COMMIT_MESSAGE]);

  if (config.bootstrapReleaseWorkflow) {
    try {
      const originResult = await ensureGithubOriginForProject({
        projectPath,
        projectName: config.name,
      });
      finalizeStatus.githubOrigin = {
        status: originResult.configured ? "configured" : "skipped",
        message: originResult.message,
      };

      const result = await bootstrapGithubRepoVariables({
        projectPath,
        projectName: config.name,
        awsRegion: config.awsRegionForReleaseWorkflow,
      });
      finalizeStatus.githubRepoVariables = {
        status: result.configured ? "configured" : "skipped",
        message:
          result.message ??
          (result.configured
            ? "Configured GitHub Actions repo variables."
            : "Skipped GitHub Actions repo variable bootstrap."),
      };
    } catch (error) {
      finalizeStatus.githubOrigin = {
        status: "error",
        message:
          error instanceof Error
            ? `Failed to configure GitHub origin: ${error.message}`
            : "Failed to configure GitHub origin.",
      };
      finalizeStatus.githubRepoVariables = {
        status: "error",
        message:
          error instanceof Error
            ? `Failed to configure GitHub Actions repo variables: ${error.message}`
            : "Failed to configure GitHub Actions repo variables.",
      };
    }
  }
  if (config.bootstrapReleaseConfig || config.bootstrapReleaseWorkflow) {
    const finalizeStatusPath = join(projectPath, ...FINALIZE_STATUS_PATH);
    const finalizeStatusDir = join(projectPath, ".tz");
    mkdirSync(finalizeStatusDir, { recursive: true });
    writeFileSync(finalizeStatusPath, JSON.stringify(finalizeStatus, null, 2), "utf-8");
  }

}

async function runGit(cwd: string, args: string[]): Promise<void> {
  await callShell("git", args, {
    cwd,
    stdin: "inherit",
    throwOnNonZero: true,
  });
}
