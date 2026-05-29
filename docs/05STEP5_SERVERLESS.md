# STEP 5 - Full Serverless Architecture (Task 2)

Task 2 is a separate Phase B architecture. Do not replace or break the working Phase A EC2/RDS app. Phase B proves the required AWS serverless services with a separate deployment path.

## Required Services

Use all of these:

1. **S3 frontend bucket** - hosts exported Next.js static files from `frontend_next/out`.
2. **S3 photo bucket** - stores patient, avatar, and sighting images that were previously kept as local/data URL content.
3. **Lambda API backend** - `lambdas/serverless-api`, called by API Gateway.
4. **Lambda worker** - `lambdas/alert-dispatcher`, triggered by SQS.
5. **DynamoDB** - single-table NoSQL replacement for PostgreSQL in Phase B.
6. **API Gateway** - HTTP API routing browser requests to the API Lambda.
7. **CloudWatch** - Lambda logs, API access logs, metrics, and SQS queue metrics.
8. **X-Ray** - active tracing on the API and worker Lambda functions.
9. **SQS** - queues alert events.
10. **SNS** - sends caregiver/community alert notifications.
11. **Secrets Manager** - stores Lambda runtime values such as `JWT_SECRET`, `TABLE_NAME`, `PHOTO_BUCKET`, and `SQS_QUEUE_URL`.

## Phase B Flow

```text
Browser
-> S3 frontend bucket static website
-> API Gateway HTTP API
-> serverless-api Lambda
-> DynamoDB single-table data store
-> S3 photo bucket for images
-> SQS alert queue
-> alert-dispatcher Lambda worker
-> SNS alert topic
-> email/SMS subscribers
```

CloudWatch captures API/Lambda/SQS/SNS logs and metrics. X-Ray traces Lambda calls.

## Code Folders

```text
frontend_next/                         Next.js UI; static export for S3
lambdas/serverless-api/                API Gateway backend using DynamoDB/S3/SQS/Secrets
lambdas/alert-dispatcher/              SQS worker that publishes SNS and updates DynamoDB alert status
docs/AWS_ACADEMY_SERVERLESS_GUI_CONSOLE.md  AWS Console click-by-click build sheet
scripts/package_lambdas.sh             Builds Lambda zip files for console upload
scripts/build_serverless_frontend.sh   Builds S3 static frontend output
tools/postgres-to-dynamodb/            RDS PostgreSQL -> DynamoDB/S3 migration tool
```

## DynamoDB Schema Conversion

Phase A PostgreSQL tables are converted into one DynamoDB table:

```text
users            -> PK USER#<id>,     SK META, entityType USER
missing_persons  -> PK PERSON#<id>,   SK META, entityType PERSON
sightings        -> PK SIGHTING#<id>, SK META, entityType SIGHTING
alerts           -> PK ALERT#<id>,    SK META, entityType ALERT
```

Each item also stores:

```text
GSI1PK = entity type
GSI1SK = created_at#id
```

This supports listing each entity type and keeps the Task 2 DynamoDB model simple enough for AWS Academy while still being a real NoSQL schema.

## Deployment

Use the AWS Console GUI runbook for Academy submission screenshots:

```text
docs/AWS_ACADEMY_SERVERLESS_GUI_CONSOLE.md
```

Local commands are only used to prepare upload files:

```bash
cd code
bash scripts/package_lambdas.sh
```

Upload these in Lambda console:

```text
build/lambdas/serverless-api.zip
build/lambdas/alert-dispatcher.zip
```

## Seed Data

After creating API Gateway in the Console, copy its invoke URL and seed:

```bash
API_BASE_URL="https://<api-id>.execute-api.us-east-1.amazonaws.com"
curl -i -X POST "$API_BASE_URL/api/admin/seed"
curl -i "$API_BASE_URL/api/health"
```

Login in the frontend with:

```text
admin@example.com
password
```

## Migrate Phase A RDS Data

Run this only when you want to copy Phase A data into Phase B:

```bash
cd code/tools/postgres-to-dynamodb
npm install

export AWS_REGION=us-east-1
export DATABASE_URL="postgresql://postgres:<password>@<rds-endpoint>:5432/safetrace?sslmode=require"
export TABLE_NAME="my-app-table"
export PHOTO_BUCKET="group10-alzheimer-photos-<account-id>"

npm run migrate
```

The tool copies users, missing persons, sightings, and alerts to DynamoDB. If `photo_url` contains a data URI, it uploads the image to the photo S3 bucket and stores the S3 URL in DynamoDB.

## Queue Demonstration

Normal operation can show zero visible SQS messages because Lambda drains the queue quickly.

For evidence:

1. Temporarily disable the SQS trigger on `alert-dispatcher`, or set worker reserved concurrency to `0`.
2. Submit a sighting in the frontend.
3. Show SQS visible messages increasing in AWS Console and Admin cloud status.
4. Re-enable the worker.
5. Show messages moving to in-flight, then returning to zero.
6. Show SNS delivery and Lambda CloudWatch logs.

Expected visible queue wait for demo is normally `0-5 seconds` after the worker is enabled. That is a demo observation, not a guaranteed SLA.

## Evidence Screenshots

Capture:

- S3 frontend bucket with exported `_next` assets and `index.html`.
- S3 photo bucket with uploaded patient/sighting images.
- DynamoDB table items for `USER`, `PERSON`, `SIGHTING`, and `ALERT`.
- API Gateway route invoking Lambda.
- Lambda API function and worker function with X-Ray active tracing enabled.
- SQS queue metrics: visible, in-flight, delayed, oldest message age.
- SNS topic subscription and publish metrics.
- CloudWatch Lambda logs and API access logs.
- X-Ray service map or trace details.
