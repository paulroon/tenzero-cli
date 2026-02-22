# IAM State Backend Policy v1 (Least Privilege)

## Purpose

Define the minimum AWS IAM permissions required for `tz` Deployments mode to access OpenTofu state and lock resources.

Scope in this document is limited to state backend and locking only. It does not include AWS deploy resource permissions (compute, database, networking, etc).

## Assumptions

- State bucket naming convention: `tz-state-<aws-account-id>-<region>`
- State key convention: `tz/v1/<user-profile>/<app-install-id>/<env>/tofu.tfstate`
- Primary lock strategy: OpenTofu S3 lockfile
- Optional fallback lock strategy: DynamoDB lock table (`tz-state-locks`)
- Encryption at rest enabled on state bucket (SSE-S3 for v1 default)

## Runtime Principal (Least Privilege)

Use a dedicated IAM principal for deployment runtime with read/write access only to the state prefix.

### Required S3 Permissions

- Bucket-level:
  - `s3:ListBucket` on the state bucket, restricted to `tz/v1/*` prefix
- Object-level on state prefix:
  - `s3:GetObject`
  - `s3:GetObjectVersion`
  - `s3:PutObject`
  - `s3:DeleteObject`

### Runtime Policy Example (S3 Lockfile Primary)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListStatePrefixOnly",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::tz-state-<aws-account-id>-<region>",
      "Condition": {
        "StringLike": {
          "s3:prefix": ["tz/v1/*"]
        }
      }
    },
    {
      "Sid": "ReadWriteStateObjectsOnly",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::tz-state-<aws-account-id>-<region>/tz/v1/*"
    }
  ]
}
```

## Optional DynamoDB Fallback Lock Permissions

Only required if DynamoDB locking fallback is enabled.

- `dynamodb:DescribeTable`
- `dynamodb:GetItem`
- `dynamodb:PutItem`
- `dynamodb:UpdateItem`
- `dynamodb:DeleteItem`

Scope to a single table ARN:
- `arn:aws:dynamodb:<region>:<aws-account-id>:table/tz-state-locks`

## Bootstrap vs Runtime Permissions

To keep runtime least-privilege, separate one-time setup from day-to-day deployment:

- Bootstrap permissions (one-time):
  - create/configure bucket
  - enable bucket versioning
  - configure public access block
  - create lock table (if DynamoDB fallback used)
- Runtime permissions (recurring):
  - only state prefix read/write and lock operations

## Guardrails

- No wildcard resources in runtime policy.
- No broad `s3:*` or `dynamodb:*` actions.
- Restrict to one bucket and one prefix root (`tz/v1/*`).
- Rotate credentials per normal AWS security policy.

## Out of Scope

- Cross-account role strategy
- KMS CMK-based encryption policy (v1 uses SSE-S3 default)
- Deployment provider permissions for provisioning resources
