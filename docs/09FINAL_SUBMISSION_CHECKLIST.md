# SafeTrace Final Submission Checklist

Use this as the final runbook before recording videos or submitting the ZIP/report.

## 1. Assignment Requirement Mapping

| Requirement | SafeTrace evidence |
|---|---|
| Selected one problem statement | Scenario 3: Alzheimer wandering and missing elderly persons |
| Interactive responsive frontend | Next.js/Tailwind UI in `frontend_next` |
| Backend workflows | Express/TypeScript API in `backend_ts` |
| AWS cloud database | RDS PostgreSQL using `DATABASE_URL` from Secrets Manager |
| AWS compute deployment | EC2 running the single `docker-compose.yml` stack |
| Secure account verification | Resend API key loaded from Secrets Manager and rate-limited verification endpoints |
| Task 2 storage integration | S3 upload through patient/sighting images and `/api/uploads/photo` |
| Task 2 serverless/microservice integration | API Gateway -> `sighting-ingest` Lambda -> SQS -> `alert-dispatcher` Lambda -> SNS |
| Monitoring | CloudWatch metrics/logs and optional X-Ray service map |
| Workload matrix | `assignments/WORKLOAD.docx` and generator scripts |
| Final report | `assignments/NP069584-NP069822-NP069596-NP069840-CT071-3-3-DDAC-REPORT.docx` |

## 2. Local Verification

Run from the repository root:

```bash
docker compose build
SAFETRACE_SECRET_ID= docker compose --profile test up --build --abort-on-container-exit --exit-code-from e2e
docker compose down -v
```

Expected result: Playwright reports `1 passed`.

If npm registry access times out inside the Playwright container, rebuild the frontend image first, prefill the e2e dependency volume from that image, and rerun:

```bash
docker compose build frontend
docker volume create safetrace_e2e_node_modules
docker run --rm -v safetrace_e2e_node_modules:/target safetrace-frontend sh -lc 'cp -a /app/node_modules/. /target/'
SAFETRACE_SECRET_ID= docker compose --profile test up --no-build --abort-on-container-exit --exit-code-from e2e
docker compose --profile test down -v --remove-orphans
```

## 3. AWS Deployment Steps

Deploy in two separate phases. Do not present Task 1 as serverless.

### Phase A: Task 1 Server Deployment

1. Create RDS PostgreSQL.
   - PostgreSQL 15 or 16.
   - Private access only.
   - Security group allows port `5432` only from the EC2 security group.

2. Create Secrets Manager JSON secret.
   - Recommended name: `safetrace/prod/app`.
   - Include only the Task 1 values first from `docs/10SECRETS_MANAGER_VALUES.md`: `DATABASE_URL`, `JWT_SECRET`, `AWS_REGION`, `FRONTEND_PUBLIC_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `AUTH_VERIFICATION_TTL_MINUTES`, and `TRUST_PROXY`.
   - Add Google OAuth values only if Google login will be demonstrated.

3. Launch EC2.
   - Attach IAM instance role with `secretsmanager:GetSecretValue`.
   - Install Docker and Docker Compose.
   - Set only `AWS_REGION` and `SAFETRACE_SECRET_ID` in `.env`.
   - Run `docker compose up --build -d`.
   - Register a new account, confirm the verification email arrives, and verify the code before login.

4. Seed and verify.
   - `curl -fsS http://localhost:5000/api/health`
   - Open frontend.
   - Login as admin after seeding.
   - Demonstrate report, search, sightings, alerts, admin, profile.

### Phase B: Task 2 Serverless Extension

1. Create S3 bucket.
   - Bucket for patient and sighting photos.
   - Use least-privilege IAM for `s3:PutObject` and `s3:GetObject`.
   - Use CloudFront or `S3_PUBLIC_BASE_URL` if public object URLs need a cleaner domain.

2. Create SQS queue.
   - Standard queue is enough for the demo.
   - Add a dead-letter queue if time allows.
   - Recommended visibility timeout: `30` seconds.

3. Create SNS topic.
   - Add email/SMS subscriptions.
   - Confirm email subscriptions before demo.

4. Deploy Lambda functions.
   - `lambdas/sighting-ingest`: API Gateway event ingestion to SQS.
   - `lambdas/alert-dispatcher`: SQS consumer to SNS.
   - Runtime: Node.js 20.x.
   - Enable CloudWatch Logs.
   - Enable X-Ray active tracing if X-Ray screenshots are required.

5. Create API Gateway HTTP API.
   - Route: `POST /sighting-events`.
   - Integration: `safetrace-sighting-ingest` Lambda.
   - Enable CORS for the frontend domain.

6. Add Task 2 values to Secrets Manager.
   - Add `S3_BUCKET`, `SIGHTING_EVENT_API_URL`, `SQS_QUEUE_URL`, and `SNS_TOPIC_ARN`.
   - Restart the backend container so it reloads the secret.

7. Verify the extension.
   - Submit a sighting and verify queue/Lambda/SNS.

## 4. Screenshot Evidence Required

Capture screenshots for the final report:

- Running EC2 instance and public URL.
- Docker containers running on EC2.
- RDS endpoint with private security group rule.
- Secrets Manager secret name and key list, without exposing secret values. Include `RESEND_API_KEY`, but do not show its value.
- S3 bucket objects after uploading patient/sighting photos.
- API Gateway route `POST /sighting-events`.
- Lambda functions and environment variable names, without exposing values.
- Lambda CloudWatch log stream showing processed event IDs.
- SQS queue metrics: visible, in-flight, delayed, oldest message age.
- SNS topic subscriptions and publish metric.
- SafeTrace Admin AWS queue status panel.
- CloudWatch dashboard or metric graphs.
- X-Ray service map if enabled.

## 5. Queue Demonstration Script

Normal operation may show zero visible SQS messages because Lambda drains quickly.

For a clear live demo:

1. Disable the `alert-dispatcher` SQS event source mapping or set reserved concurrency to `0`.
2. Submit a sighting from SafeTrace.
3. Open Admin and show visible messages or oldest message age increasing.
4. Re-enable Lambda.
5. Refresh Admin and show the queue draining back to zero.
6. Open Lambda logs and SNS topic metrics to prove dispatch.

The `0-5 seconds` queue wait is a healthy demo target, not a guaranteed production SLA.

## 6. Report Structure

Follow the Task 2 document:

1. Cover page: problem statement number, project title, group number, team members.
2. Design and implementation: architecture diagram, Task 1 vs Task 2 changes, code screenshots, functionality screenshots.
3. Results and discussion: CloudWatch/X-Ray metrics, latency/error/resource discussion.
4. Reflection from each member.
5. New workload matrix for Task 1 and Task 2.
6. References in APA style.

Keep the report under 40 pages and 4000 words.

## 7. Do Not Claim

Do not claim DynamoDB, Cognito, RDS Data API, FastAPI, Vite, PM2, or unmeasured latency numbers unless those services are actually deployed and screenshots are available.

The truthful architecture is split by task:

- Task 1: Next.js + Express + EC2 + RDS PostgreSQL + Secrets Manager.
- Task 2: S3 + API Gateway + Lambda + SQS + SNS + CloudWatch/X-Ray added on top of the Task 1 app.

## 8. Secret Hygiene

- Do not commit `.env`.
- Do not store production Resend API keys, Google OAuth secrets, JWT secrets, RDS passwords, or AWS access keys in local files.
- Keep production values in AWS Secrets Manager and set only `AWS_REGION` plus `SAFETRACE_SECRET_ID` on EC2.
- If an OAuth client secret or cloud key was previously stored in a local `.env`, rotate it before the final cloud deployment.
