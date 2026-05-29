# SafeTrace Full Serverless Runbook - Phase B

This is the correct Task 2 serverless plan. It is separate from the Phase A EC2/RDS deployment.

## Mandatory Architecture

```text
S3 frontend bucket
  hosts exported Next.js files from frontend_next/out

API Gateway HTTP API
  routes all /api/* calls to Lambda

serverless-api Lambda
  implements SafeTrace API
  reads Secrets Manager
  writes DynamoDB
  writes photos to S3
  sends alert events to SQS

DynamoDB
  stores users, missing persons, sightings, and alerts

S3 photo bucket
  stores patient, avatar, and sighting images

SQS
  buffers alert events

alert-dispatcher Lambda worker
  consumes SQS messages
  publishes SNS notifications
  updates DynamoDB alert status to sent

SNS
  sends email/SMS notifications

CloudWatch + X-Ray
  logs, metrics, traces, latency, errors, queue depth
```

## Required Services Checklist

```text
[x] S3 bucket 1: frontend static hosting
[x] S3 bucket 2: photo storage
[x] Lambda API backend
[x] Lambda worker
[x] DynamoDB database
[x] API Gateway HTTP API
[x] CloudWatch logs and metrics
[x] X-Ray active tracing
[x] SQS queue and DLQ
[x] SNS topic
[x] Secrets Manager runtime secret
```

## Repo Implementation

```text
frontend_next/
  Same UI, now supports NEXT_PUBLIC_API_BASE_URL for S3 static hosting.

lambdas/serverless-api/
  Full Lambda backend for API Gateway.

lambdas/alert-dispatcher/
  SQS worker -> SNS notification dispatcher.

tools/postgres-to-dynamodb/
  Migrates Phase A PostgreSQL/RDS data into DynamoDB and moves data-URI images into S3.
```

## Deploy

For AWS Academy screenshots, use the GUI-only guide:

```text
docs/AWS_ACADEMY_SERVERLESS_GUI_CONSOLE.md
```

Local commands only prepare upload files. All AWS resources are created in the Management Console for the Academy version.

```bash
cd code
bash scripts/package_lambdas.sh
```

Upload in the Lambda console:

```text
build/lambdas/serverless-api.zip
build/lambdas/alert-dispatcher.zip
```

After creating API Gateway:

```bash
API_BASE_URL="https://<api-id>.execute-api.us-east-1.amazonaws.com"
curl -i "$API_BASE_URL/api/health"
curl -i -X POST "$API_BASE_URL/api/admin/seed"
```

Build the frontend with that API URL and upload `frontend_next/out` contents to the S3 frontend bucket.

## DynamoDB Conversion

Run the migration tool only if you want to move real Phase A data:

```bash
cd code/tools/postgres-to-dynamodb
npm install

export AWS_REGION=us-east-1
export DATABASE_URL="postgresql://postgres:<password>@<rds-endpoint>:5432/safetrace?sslmode=require"
export TABLE_NAME="my-app-table"
export PHOTO_BUCKET="group10-alzheimer-photos-<account-id>"

npm run migrate
```

The converted DynamoDB model:

```text
USER#<id>      META
PERSON#<id>    META
SIGHTING#<id>  META
ALERT#<id>     META
```

`GSI1PK` stores the entity type and `GSI1SK` stores `created_at#id` for listing.

## Report Evidence

Take screenshots of:

- S3 frontend bucket showing `index.html` and `_next` assets.
- S3 photo bucket showing uploaded patient/sighting images.
- DynamoDB table items.
- API Gateway invoke URL and route.
- Lambda API and worker configuration.
- X-Ray active tracing setting and service map/trace.
- CloudWatch logs for both Lambdas and API access logs.
- SQS queue metrics.
- SNS topic subscriptions and publish metric.
- Frontend workflow: login, seed, report missing person, submit sighting, queue/SNS notification.
