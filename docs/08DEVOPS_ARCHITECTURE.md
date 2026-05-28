# SafeTrace DevOps Architecture

This is the recommended production path for a coursework-grade but professionally defensible AWS deployment.

## 1. Secret Strategy

Use AWS Secrets Manager for values that are credentials, tokens, OAuth client secrets, database URLs, or webhook-style endpoints. SafeTrace loads one JSON secret at backend startup through `SAFETRACE_SECRET_ID`. Use `docs/10SECRETS_MANAGER_VALUES.md` as the final source of truth.

Put these in Secrets Manager:

Task 1 minimum:

```json
{
  "DATABASE_URL": "postgresql://safetrace:<password>@<rds-endpoint>:5432/safetrace",
  "JWT_SECRET": "<strong-random-secret>",
  "AWS_REGION": "us-east-1",
  "FRONTEND_PUBLIC_URL": "https://<app-domain>",
  "RESEND_API_KEY": "re_xxxxxxxxx",
  "RESEND_FROM_EMAIL": "verify@<verified-domain>",
  "AUTH_VERIFICATION_TTL_MINUTES": "10",
  "TRUST_PROXY": "false"
}
```

Task 2 extension values:

```json
{
  "S3_BUCKET": "safetrace-photo-uploads-bucket",
  "S3_PUBLIC_BASE_URL": "https://<optional-cloudfront-domain>",
  "SIGHTING_EVENT_API_URL": "https://<api-id>.execute-api.us-east-1.amazonaws.com/sighting-events",
  "SIGHTING_EVENT_API_KEY": "<optional-shared-demo-key>",
  "SQS_QUEUE_URL": "https://sqs.us-east-1.amazonaws.com/<account>/SafeTraceSightingQueue",
  "SNS_TOPIC_ARN": "arn:aws:sns:us-east-1:<account>:SafeTraceAlertsTopic"
}
```

Optional Google OAuth values:

```json
{
  "GOOGLE_CLIENT_ID": "<google-oauth-client-id>",
  "GOOGLE_CLIENT_SECRET": "<google-oauth-client-secret>",
  "GOOGLE_OAUTH_CALLBACK_URL": "https://<api-domain>/api/auth/google/callback"
}
```

Keep only these as normal EC2 bootstrap/environment values:

- `SAFETRACE_SECRET_ID`
- `AWS_REGION`

Docker keeps safe defaults for `FRONTEND_PORT`, `BACKEND_PORT`, `BACKEND_URL`, and `NEXT_TELEMETRY_DISABLED`; these are not application secrets.

Use Systems Manager Parameter Store for non-secret configuration only, such as deployment names, AMI IDs, or feature flags that do not grant access.

## 2. CI/CD Recommendation

For a clean AWS-native pipeline, split build and deployment by stage:

1. **Source**: GitHub or CodeCommit.
2. **Build**: AWS CodeBuild.
   - Use a managed Linux image with Docker enabled.
   - Enable privileged mode so CodeBuild can run `docker build`.
   - Use the root `buildspec.yml` in this repository.
   - Do not place application secrets in CodeBuild variables; the running backend loads them from Secrets Manager.
3. **Images**: Amazon ECR repositories:
   - `safetrace-backend`
   - `safetrace-frontend`
4. **Task 1 Runtime**: EC2 with Docker Compose for the full server-based app, or ECS/Fargate if you want the more production-native option.
5. **Deploy**:
   - simple coursework path: SSM Run Command to the EC2 host, then `docker compose pull && docker compose up -d`
   - stronger production path: ECS service deployment using image definitions
6. **Task 2 Lambda deploy**: package `lambdas/alert-dispatcher` and update the Lambda code through CodeBuild or CodePipeline.
   Also package `lambdas/sighting-ingest` if API Gateway is used for event ingestion.

## 3. IAM Roles

Use IAM roles, not static access keys.

Task 1 EC2 instance role needs:

- `secretsmanager:GetSecretValue`

Task 2 EC2 additions need:

- `s3:PutObject`
- `s3:GetObject`
- `sqs:SendMessage`
- `sqs:GetQueueAttributes`
- `cloudwatch:GetMetricStatistics`

Lambda role needs:

- for `sighting-ingest`: `sqs:SendMessage`
- `sqs:ReceiveMessage`
- `sqs:DeleteMessage`
- `sqs:GetQueueAttributes`
- `sns:Publish`
- CloudWatch Logs permissions

CodeBuild role needs:

- ECR login, push, and describe permissions
- CloudWatch Logs permissions
- Lambda update permissions if deploying Lambda from the pipeline
- SSM send-command permissions if deploying to EC2

## 4. What Not To Do

- Do not commit `.env`.
- Do not put Google client secret, Resend API key, JWT secret, RDS password, or AWS access keys in Git.
- Do not bake secrets into Docker images.
- Do not pass long-lived AWS keys to EC2 containers when an instance role can be used.
- Do not expose RDS publicly.

## 5. Senior Architect Recommendation

For this assignment, deploy in two phases:

1. **Task 1 server app**: EC2 + Docker Compose + RDS PostgreSQL + Secrets Manager.
2. **Task 2 serverless extension**: S3 + API Gateway + Lambda + SQS + SNS + CloudWatch/X-Ray.

For a real production client, move the containers from EC2 Compose to **ECS Fargate behind an Application Load Balancer**, keep RDS private, put static images behind CloudFront if needed, and use CodePipeline/CodeBuild/ECR for repeatable releases.
