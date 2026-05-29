# SafeTrace - DDAC Case Study 3

SafeTrace is the Case Study 3 Alzheimer patient safety system. This repository contains the frontend, backend, database runtime configuration, Lambda functions, and deployment documentation in one GitHub repo.

## Folders

```text
frontend_next/       Next.js + Tailwind UI
backend_ts/          Express + TypeScript API
lambdas/             Task 2 Lambda functions
docker-compose.yml   Single compose file for EC2/local runtime
aws-user-data.sh     EC2 bootstrap script
docs/                AWS deployment and submission guides
assignments/         Report, presentation, workload, references
scripts/             Helper scripts
```

## Local Test

```bash
SAFETRACE_SECRET_ID= docker compose --profile local-db up --build -d
curl http://localhost:5000/api/health
```

Open:

```text
http://localhost:3000
```

Stop local containers:

```bash
docker compose --profile local-db down -v
```

## Public VM Smoke Test

Use this only on a throwaway public Ubuntu VM to prove the app opens without RDS/Secrets Manager:

```bash
curl -fsSL https://raw.githubusercontent.com/gokulupadhyayguragain/group10-ddac-part3/main/aws-user-data-local-test.sh | sudo bash
```

Open `http://<public-ip>`. For production, use `aws-user-data.sh` with RDS and Secrets Manager.

## Production Secrets

For EC2 production, `.env` should contain only:

```env
AWS_REGION=us-east-1
SAFETRACE_SECRET_ID=safetrace/prod/app
```

All real values go inside AWS Secrets Manager. See:

```text
docs/10SECRETS_MANAGER_VALUES.md
```

## Deployment Paths

Task 1 serverful:

```text
Browser -> ALB -> EC2 Auto Scaling Group -> Docker Compose -> Backend -> RDS PostgreSQL
```

Task 2 serverless extension:

```text
Backend/API Gateway -> Lambda -> SQS -> Lambda worker -> SNS
```

## Lambda Packaging

```bash
bash scripts/package_lambdas.sh
```

Generated zip files:

```text
build/lambdas/sighting-ingest.zip
build/lambdas/alert-dispatcher.zip
```

Upload those zip files to AWS Lambda. Do not upload raw `index.mjs` files alone.

## Main Guides

- `docs/AWS_ACADEMY_SHORT_BUILD_SHEET.md`
- `docs/CLOUDSHELL_VERSION.md`
- `docs/INFRA_MANUAL_AWS_CONSOLE.md`
- `docs/04STEP4_AWS_DEPLOY.md`
- `docs/05STEP5_SERVERLESS.md`
- `docs/GITHUB_AND_LAMBDA_DEPLOY.md`
- `docs/09FINAL_SUBMISSION_CHECKLIST.md`
