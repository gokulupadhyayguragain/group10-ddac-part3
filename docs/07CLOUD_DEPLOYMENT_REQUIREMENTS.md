# SafeTrace Cloud Deployment & Integration Requirements

SafeTrace is the Scenario 3 application for Alzheimer wandering and missing elderly persons. This runbook explains what must be configured for the real AWS deployment and what evidence to capture for the report.

## 1. Required Services By Stage

Task 1 and Task 2 are separate deployment stages. Start with Task 1. Add Task 2 only after the EC2/RDS server app is already running.

### Task 1: Server-Based Application

| Area | AWS service | Purpose |
|---|---|---|
| Compute | EC2 with Docker Compose | Runs the Next.js frontend and Express backend |
| Database | RDS PostgreSQL | Stores users, missing-person reports, sightings, and alerts |
| Secrets | AWS Secrets Manager | Stores `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, and optional Google OAuth values |
| Email verification | Resend API | Sends 6-digit account verification codes during registration |
| Monitoring | CloudWatch | EC2/application logs and basic health evidence |

### Task 2: Serverless Extension

| Area | AWS service | Purpose |
|---|---|---|
| Photos | S3 | Stores patient and sighting images outside the database |
| API | API Gateway | Public event-ingestion endpoint for alert events |
| Worker | Lambda | Ingests API Gateway events and consumes SQS messages |
| Queue | SQS | Buffers sighting alert events |
| Notifications | SNS | Sends email/SMS alert broadcasts |
| Monitoring | CloudWatch and X-Ray | Serverless logs, metrics, traces, and report screenshots |

## 2. Secrets Manager Values

Create one JSON secret, for example `safetrace/prod/app`. Set `SAFETRACE_SECRET_ID=safetrace/prod/app` on EC2. The backend loads this secret during startup before connecting to RDS or registering routes. Use `docs/10SECRETS_MANAGER_VALUES.md` as the final source of truth for every value.

Task 1 minimum secret:

```json
{
  "DATABASE_URL": "postgresql://safetrace:<password>@<rds-endpoint>:5432/safetrace",
  "JWT_SECRET": "<strong-random-secret>",
  "AWS_REGION": "us-east-1",
  "FRONTEND_PUBLIC_URL": "https://<public-domain>",
  "RESEND_API_KEY": "re_xxxxxxxxx",
  "RESEND_FROM_EMAIL": "verify@<verified-domain>",
  "AUTH_VERIFICATION_TTL_MINUTES": "10",
  "TRUST_PROXY": "false"
}
```

Task 2 adds these values to the same secret:

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

Google login values should live in the same secret if Google OAuth is enabled. If those keys are missing, the backend starts normally and disables Google login.

For Resend, verify a sending domain in the Resend dashboard before production. Keep `RESEND_API_KEY` only in Secrets Manager; never expose it to the frontend.

## 3. Runtime Environment

Local Docker can run without `.env` by clearing `SAFETRACE_SECRET_ID` in the shell command. Production should set only:

```env
SAFETRACE_SECRET_ID=safetrace/prod/app
AWS_REGION=us-east-1
```

Task 1 EC2 role only needs `secretsmanager:GetSecretValue`. For Task 2, add `s3:PutObject`, `s3:GetObject`, `sqs:SendMessage`, `sqs:GetQueueAttributes`, and `cloudwatch:GetMetricStatistics`. Lambda/SNS permissions belong to the Lambda execution roles, not the basic Task 1 server deployment.

## 4. Application Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Backend health check |
| `POST /api/auth/register` | Creates an unverified account and sends the verification code |
| `POST /api/auth/verify-email` | Verifies the account with the 6-digit code |
| `POST /api/auth/resend-verification` | Rate-limited resend for pending accounts |
| `POST /api/persons` | Creates a missing Alzheimer patient report |
| `POST /api/sightings` | Creates a community sighting and enqueues an alert |
| `POST /api/uploads/photo` | Multipart S3 photo upload endpoint, field name `file` |
| `GET /api/admin/cloud-status` | Admin-only SQS/S3/SNS/Secrets status for demonstrations |
| `POST /sighting-events` | API Gateway route to the `sighting-ingest` Lambda |

The report and sighting forms can send photo data URLs; the backend converts them to S3 objects when `S3_BUCKET` is configured. The upload endpoint exists for direct multipart uploads and returns `{ key, url }`.

## 5. Task 2 Queue Demonstration

Use the Admin page to show real queue data. Login as admin, open Admin, and capture the AWS queue status panel. It displays:

- visible messages
- in-flight messages
- delayed messages
- oldest message age from CloudWatch
- SQS receive wait time
- SQS visibility timeout
- S3, SNS, and Secrets Manager configuration state
- Resend email configuration state

For a live demo:

1. Submit a sighting from the Search page.
2. Confirm the backend creates the database sighting and alert row.
3. Confirm API Gateway receives the event if `SIGHTING_EVENT_API_URL` is configured.
4. Confirm SQS receives the event.
5. Confirm the Lambda `alert-dispatcher` function consumes the message.
6. Confirm SNS publishes the notification.

Normal queues may show `0` visible messages because Lambda drains them quickly. To show backlog clearly, temporarily disable the Lambda event source mapping or set Lambda reserved concurrency to `0`, submit a sighting, refresh Admin until visible messages increase, then re-enable the Lambda trigger and show the queue returning to `0`.

The `0-5 seconds` target is a demonstration expectation for a healthy demo queue, not a hard production SLA. Do not add artificial sleeps to production code.

## 6. Evidence Checklist

Capture these screenshots for the final report:

- EC2 instance running Docker containers
- RDS endpoint and private security group rule
- S3 bucket containing uploaded patient/sighting photos
- API Gateway route `POST /sighting-events` integrated with Lambda
- SQS queue metrics: visible messages, in-flight messages, and oldest message age
- Lambda trigger connected to SQS and Lambda logs showing processed message IDs
- SNS topic subscriptions and publish metric
- Admin page AWS queue status panel
- CloudWatch dashboard or metric graphs
- X-Ray service map if active tracing is enabled

## 7. Optional Nginx and HTTPS

For a cleaner public URL, use the ALB in front of the containers:

- ALB listener `80/443` forwards to target group port `80`
- Docker maps EC2 host port `80` to the frontend container port `3000`
- The Next.js frontend proxies `/api/*` to the backend container on `5000`
- Use ACM on the ALB for HTTPS

This is optional for coursework, but it makes the public demo URL cleaner and avoids exposing raw container ports.
