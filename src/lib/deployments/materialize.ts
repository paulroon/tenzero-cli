import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadProjectBuilderConfig } from "@/lib/config/projectBuilder";
import { loadProjectConfig } from "@/lib/config/project";
import { planEnvironmentDeployment } from "@/lib/deployments/capabilityPlanner";

type SupportedOutputType = "string" | "number" | "boolean" | "json" | "secret_ref";

export type MaterializeInfraResult = {
  directoryPath: string;
  filePaths: string[];
};

export type MaterializeInfraOptions = {
  backendRegion?: string;
};

function jsonLiteral(value: unknown): string {
  return JSON.stringify(value);
}

function outputExpression(type: SupportedOutputType, defaultValue: unknown): string {
  if (typeof defaultValue === "undefined") return "null";
  if (type === "string" || type === "secret_ref") {
    return typeof defaultValue === "string" ? jsonLiteral(defaultValue) : "null";
  }
  if (type === "number") {
    return typeof defaultValue === "number" ? `${defaultValue}` : "null";
  }
  if (type === "boolean") {
    return typeof defaultValue === "boolean" ? `${defaultValue}` : "null";
  }
  return `jsondecode(${jsonLiteral(JSON.stringify(defaultValue))})`;
}

function slugify(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.length > 0 ? normalized : "app";
}

export function materializeInfraForEnvironment(
  projectPath: string,
  environmentId: string,
  options?: MaterializeInfraOptions
): MaterializeInfraResult {
  const project = loadProjectConfig(projectPath);
  if (!project) {
    throw new Error(`Project config not found: ${projectPath}`);
  }
  const template = loadProjectBuilderConfig(project.type);
  if (!template?.infra) {
    throw new Error(
      `Template '${project.type}' has no infra definition. Add infra config before deployment.`
    );
  }
  const environment = template.infra.environments.find((entry) => entry.id === environmentId);
  if (!environment) {
    throw new Error(
      `Environment '${environmentId}' is not defined in template infra for '${project.type}'.`
    );
  }

  const plan = planEnvironmentDeployment(template.infra, environmentId);
  const backendRegion = options?.backendRegion?.trim();
  const effectiveConstraints: Record<string, unknown> = {
    ...environment.constraints,
  };
  const releaseSelection = project.releaseState?.environments?.[environmentId];
  const selectedImageRef = releaseSelection?.selectedImageRef;
  const selectedReleaseTag = releaseSelection?.selectedReleaseTag;
  if (typeof selectedImageRef === "string" && selectedImageRef.trim().length > 0) {
    effectiveConstraints.appImageIdentifier = selectedImageRef.trim();
  }
  if (typeof selectedReleaseTag === "string" && selectedReleaseTag.trim().length > 0) {
    effectiveConstraints.appImageTag = selectedReleaseTag.trim();
  }
  if (backendRegion) {
    effectiveConstraints.region = backendRegion;
  }
  const materializedModules = plan.modules.map((module) => ({
    ...module,
    constraints: effectiveConstraints,
  }));
  const dirPath = join(projectPath, ".tz", "infra", environmentId);
  mkdirSync(dirPath, { recursive: true });

  const mainTfPath = join(dirPath, "main.tf");
  const metadataPath = join(dirPath, "tz-materialized.json");

  const capabilitiesLiteral = jsonLiteral(materializedModules.map((module) => module.capability));
  const constraintsLiteral = jsonLiteral(effectiveConstraints);
  const projectSlug = slugify(project.name || basename(projectPath));
  const appBaseUrlDefault =
    typeof effectiveConstraints.domain === "string" && effectiveConstraints.domain.trim().length > 0
      ? `https://${effectiveConstraints.domain.trim()}`
      : `https://${projectSlug}-${environmentId}.example.com`;
  const hasAppRuntime = materializedModules.some((module) => module.capability === "appRuntime");
  const hasEnvConfig = materializedModules.some((module) => module.capability === "envConfig");
  const hasPostgres = materializedModules.some((module) => module.capability === "postgres");

  const providerExpressionByOutputKey: Record<string, string> = {};
  if (hasEnvConfig) {
    providerExpressionByOutputKey.APP_BASE_URL =
      hasAppRuntime
        ? `try("https://\${aws_apprunner_service.app[0].service_url}", nonsensitive(aws_ssm_parameter.app_base_url.value))`
        : "nonsensitive(aws_ssm_parameter.app_base_url.value)";
  }
  if (hasPostgres) {
    providerExpressionByOutputKey.DATABASE_URL = "aws_secretsmanager_secret.database_url.arn";
  }
  if (hasEnvConfig) {
    providerExpressionByOutputKey.NEXTAUTH_SECRET = "aws_secretsmanager_secret.nextauth_secret.arn";
  }
  const outputBlocks = environment.outputs
    .map((output) => {
      const expression =
        providerExpressionByOutputKey[output.key] ??
        outputExpression(output.type as SupportedOutputType, output.default);
      const descriptionLine =
        typeof output.description === "string" && output.description.length > 0
          ? `  description = ${jsonLiteral(output.description)}\n`
          : "";
      return `output "${output.key}" {\n${descriptionLine}  value = ${expression}\n}`;
    })
    .join("\n\n");

  const resourceBlocks = `
terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0"
    }
  }
}

provider "aws" {
  region = local.tz_region
}

resource "random_id" "suffix" {
  byte_length = 3
}

${hasAppRuntime ? `resource "aws_ecr_repository" "app" {
  count                = local.tz_manage_ecr_repository ? 1 : 0
  name                 = "tz-\${local.tz_project_slug}-\${local.tz_environment_id}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}` : ""}

${hasAppRuntime ? `resource "aws_iam_role" "apprunner_ecr_access" {
  count = local.tz_enable_app_runner ? 1 : 0
  name  = "tz-\${local.tz_project_slug}-\${local.tz_environment_id}-apprunner-ecr"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "build.apprunner.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr_access" {
  count      = local.tz_enable_app_runner ? 1 : 0
  role       = aws_iam_role.apprunner_ecr_access[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

resource "aws_apprunner_auto_scaling_configuration_version" "app" {
  count             = local.tz_enable_app_runner ? 1 : 0
  auto_scaling_configuration_name = "tz-\${local.tz_project_slug}-\${local.tz_environment_id}"
  min_size          = try(tonumber(local.tz_constraints.appRunnerMinSize), 1)
  max_size          = try(tonumber(local.tz_constraints.appRunnerMaxSize), 2)
}

resource "aws_apprunner_service" "app" {
  count        = local.tz_enable_app_runner ? 1 : 0
  service_name = "tz-\${local.tz_project_slug}-\${local.tz_environment_id}"

  source_configuration {
    auto_deployments_enabled = false

    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access[0].arn
    }

    image_repository {
      image_repository_type = "ECR"
      image_identifier      = length(trimspace(local.tz_app_image_identifier_override)) > 0 ? local.tz_app_image_identifier_override : "\${aws_ecr_repository.app[0].repository_url}:\${local.tz_app_image_tag}"
      image_configuration {
        port = tostring(try(local.tz_constraints.appPort, 3000))
        runtime_environment_variables = {
          NODE_ENV = "production"
        }
        runtime_environment_secrets = merge(
          ${hasPostgres ? `{ DATABASE_URL = aws_secretsmanager_secret.database_url.arn }` : "{}"},
          ${hasEnvConfig ? `{ NEXTAUTH_SECRET = aws_secretsmanager_secret.nextauth_secret.arn }` : "{}"}
        )
      }
    }
  }

  instance_configuration {
    cpu    = tostring(try(local.tz_constraints.appRunnerCpu, "1024"))
    memory = tostring(try(local.tz_constraints.appRunnerMemory, "2048"))
  }

  health_check_configuration {
    path                = tostring(try(local.tz_constraints.appHealthPath, "/"))
    healthy_threshold   = 1
    unhealthy_threshold = 5
    interval            = 10
    timeout             = 5
    protocol            = "HTTP"
  }

  network_configuration {
    egress_configuration {
      egress_type = "DEFAULT"
    }
    ingress_configuration {
      is_publicly_accessible = true
    }
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.app[0].arn

  depends_on = [aws_iam_role_policy_attachment.apprunner_ecr_access]
}` : ""}

${hasEnvConfig ? `resource "aws_ssm_parameter" "app_base_url" {
  name      = "/tz/\${local.tz_project_slug}/\${local.tz_environment_id}/APP_BASE_URL"
  type      = "String"
  value     = local.tz_default_app_base_url
}` : ""}

${hasEnvConfig ? `resource "random_password" "nextauth_secret_value" {
  length           = 48
  special          = false
  override_special = ""
}

resource "aws_secretsmanager_secret" "nextauth_secret" {
  name                    = "tz/\${local.tz_project_slug}/\${local.tz_environment_id}/NEXTAUTH_SECRET-\${random_id.suffix.hex}"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "nextauth_secret" {
  secret_id     = aws_secretsmanager_secret.nextauth_secret.id
  secret_string = random_password.nextauth_secret_value.result
}` : ""}

${hasPostgres ? `resource "aws_secretsmanager_secret" "database_url" {
  name                    = "tz/\${local.tz_project_slug}/\${local.tz_environment_id}/DATABASE_URL-\${random_id.suffix.hex}"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = jsonencode({
    connection = "postgresql://postgres:change-me@localhost:5432/\${local.tz_project_slug}"
    note       = "Replace with managed Postgres connection details before production use."
  })
}` : ""}
`;

  const mainTf = `# v1 materialization scaffold generated by tz-cli.
# This file establishes a deterministic infra workspace per environment.
variable "tz_environment_id" {
  type        = string
  description = "Environment id passed by tz deploy runner."
  default     = ${jsonLiteral(environment.id)}
}

locals {
  tz_environment_id = var.tz_environment_id
  tz_project_slug   = ${jsonLiteral(projectSlug)}
  tz_default_app_base_url = ${jsonLiteral(appBaseUrlDefault)}
  tz_region         = try(tostring(local.tz_constraints.region), "us-east-1")
  tz_capabilities   = jsondecode(${jsonLiteral(capabilitiesLiteral)})
  tz_constraints    = jsondecode(${jsonLiteral(constraintsLiteral)})
  tz_app_image_identifier_override = try(tostring(local.tz_constraints.appImageIdentifier), "")
  tz_app_image_tag = try(tostring(local.tz_constraints.appImageTag), "")
  tz_manage_ecr_repository = length(trimspace(local.tz_app_image_identifier_override)) == 0
  tz_enable_app_runner    = try(tobool(local.tz_constraints.enableAppRunner), false) && (length(trimspace(local.tz_app_image_identifier_override)) > 0 || length(trimspace(local.tz_app_image_tag)) > 0)
}

${resourceBlocks}

output "TZ_ENVIRONMENT_ID" {
  value = local.tz_environment_id
}

output "TZ_CAPABILITIES" {
  value = local.tz_capabilities
}

output "TZ_REGION" {
  value = local.tz_region
}

${outputBlocks}
`;

  writeFileSync(mainTfPath, mainTf, "utf-8");
  writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        environmentId,
        modules: materializedModules,
      },
      null,
      2
    ),
    "utf-8"
  );

  return {
    directoryPath: dirPath,
    filePaths: [mainTfPath, metadataPath],
  };
}
