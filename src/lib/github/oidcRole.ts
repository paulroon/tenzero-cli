import { callShell } from "@/lib/shell";
import { getSecretValue } from "@/lib/secrets";

type GithubUserResponse = {
  login?: string;
};

function sanitizeRoleSuffix(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

async function runAws(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await callShell("aws", args, {
    collect: true,
    quiet: true,
    throwOnNonZero: false,
    stdin: "ignore",
  });
  return {
    exitCode: result.exitCode,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

export async function ensureGithubOidcRoleForDeployments(args: {
  profile: string;
  region: string;
}): Promise<{ ok: true; roleArn: string; message: string } | { ok: false; message: string }> {
  const token = getSecretValue("GITHUB_TOKEN");
  if (!token) {
    return { ok: false, message: "Missing GITHUB_TOKEN. Cannot infer GitHub owner for OIDC role trust." };
  }

  const meResponse = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!meResponse.ok) {
    const body = await meResponse.text();
    return {
      ok: false,
      message: `Failed to resolve GitHub owner from token (${meResponse.status}): ${body || meResponse.statusText}`,
    };
  }
  const me = (await meResponse.json()) as GithubUserResponse;
  const owner = me.login?.trim();
  if (!owner) {
    return { ok: false, message: "GitHub token login is empty; cannot build OIDC role trust policy." };
  }

  const account = await runAws([
    "sts",
    "get-caller-identity",
    "--profile",
    args.profile,
    "--region",
    args.region,
    "--query",
    "Account",
    "--output",
    "text",
  ]);
  if (account.exitCode !== 0 || !account.stdout) {
    return {
      ok: false,
      message:
        account.stderr || account.stdout || "Failed to resolve AWS account ID for OIDC role setup.",
    };
  }

  const roleName = `tz-gha-release-${sanitizeRoleSuffix(owner) || "owner"}`;
  const trustPolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Federated: `arn:aws:iam::${account.stdout}:oidc-provider/token.actions.githubusercontent.com`,
        },
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          },
          StringLike: {
            "token.actions.githubusercontent.com:sub": `repo:${owner}/*`,
          },
        },
      },
    ],
  });

  const getRole = await runAws([
    "iam",
    "get-role",
    "--role-name",
    roleName,
    "--query",
    "Role.Arn",
    "--output",
    "text",
    "--profile",
    args.profile,
    "--region",
    args.region,
  ]);

  if (getRole.exitCode !== 0) {
    const missingRole =
      getRole.stderr.includes("NoSuchEntity") || getRole.stderr.includes("cannot be found");
    if (!missingRole) {
      return {
        ok: false,
        message: getRole.stderr || getRole.stdout || `Failed checking IAM role '${roleName}'.`,
      };
    }
    const createRole = await runAws([
      "iam",
      "create-role",
      "--role-name",
      roleName,
      "--assume-role-policy-document",
      trustPolicy,
      "--profile",
      args.profile,
      "--region",
      args.region,
    ]);
    if (createRole.exitCode !== 0) {
      return {
        ok: false,
        message:
          createRole.stderr || createRole.stdout || `Failed creating IAM role '${roleName}'.`,
      };
    }
  } else {
    const updateTrust = await runAws([
      "iam",
      "update-assume-role-policy",
      "--role-name",
      roleName,
      "--policy-document",
      trustPolicy,
      "--profile",
      args.profile,
      "--region",
      args.region,
    ]);
    if (updateTrust.exitCode !== 0) {
      return {
        ok: false,
        message:
          updateTrust.stderr ||
          updateTrust.stdout ||
          `Failed updating IAM trust policy for '${roleName}'.`,
      };
    }
  }

  const attachEcrPolicy = await runAws([
    "iam",
    "attach-role-policy",
    "--role-name",
    roleName,
    "--policy-arn",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser",
    "--profile",
    args.profile,
    "--region",
    args.region,
  ]);
  if (attachEcrPolicy.exitCode !== 0) {
    return {
      ok: false,
      message:
        attachEcrPolicy.stderr ||
        attachEcrPolicy.stdout ||
        `Failed attaching ECR policy to '${roleName}'.`,
    };
  }

  const roleArnResult = await runAws([
    "iam",
    "get-role",
    "--role-name",
    roleName,
    "--query",
    "Role.Arn",
    "--output",
    "text",
    "--profile",
    args.profile,
    "--region",
    args.region,
  ]);
  if (roleArnResult.exitCode !== 0 || !roleArnResult.stdout) {
    return {
      ok: false,
      message:
        roleArnResult.stderr || roleArnResult.stdout || `Failed reading IAM role ARN for '${roleName}'.`,
    };
  }
  return {
    ok: true,
    roleArn: roleArnResult.stdout,
    message: `Ensured IAM OIDC role '${roleName}' for GitHub Actions.`,
  };
}
