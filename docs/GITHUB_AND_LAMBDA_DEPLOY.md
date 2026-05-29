# GitHub And Lambda Deploy

One repository should contain everything:

```text
group10-ddac-part3/
  backend_ts/            Express TypeScript API
  frontend_next/         Next.js frontend
  lambdas/
    serverless-api/      API Gateway -> DynamoDB/S3/SQS Lambda backend
    alert-dispatcher/    SQS -> SNS Lambda
  docker-compose.yml     EC2 app runtime
  aws-user-data.sh       EC2 bootstrap
  docs/                  deployment guides
  assignments/           generated report, presentation, workload
  scripts/               assignment and package helper scripts
```

## GitHub Push

Run from repo root:

```bash
git init
git branch -M main
git remote add origin https://github.com/gokulupadhyayguragain/group10-ddac-part3.git
git add .
git status
git commit -m "Prepare SafeTrace production deployment"
git push -u origin main
```

If `git remote add origin` says origin already exists:

```bash
git remote set-url origin https://github.com/gokulupadhyayguragain/group10-ddac-part3.git
```

Do not commit `.env`; it is ignored. Commit `.env.example` only.

## How Backend And Frontend Work On EC2

Task 1 uses EC2/ASG behind ALB:

```text
Browser
-> ALB
-> EC2 private app instance
-> Docker Compose
-> EC2 host port 80 mapped to frontend container on 3000
-> backend container on 5000
-> RDS PostgreSQL in private DB subnet
```

The backend loads runtime values from AWS Secrets Manager:

```text
AWS_REGION=us-east-1
SAFETRACE_SECRET_ID=safetrace/prod/app
```

Everything else is inside the secret JSON:

```text
DATABASE_URL
JWT_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
FRONTEND_PUBLIC_URL
Task 2 full serverless values live in a separate Secrets Manager secret
```

## How To Upload Lambda JS

Lambda JS is only for Task 2. The full serverless deployment uses `serverless-api` and `alert-dispatcher`.

Source folders:

```text
lambdas/alert-dispatcher/index.mjs
lambdas/serverless-api/index.mjs
```

Package locally:

```bash
bash scripts/package_lambdas.sh
```

Generated zip files:

```text
build/lambdas/alert-dispatcher.zip
build/lambdas/serverless-api.zip
```

Upload `serverless-api.zip` and `alert-dispatcher.zip`, not raw `index.mjs` files.

### Recommended: AWS Console Full Serverless

Use the GUI guide for AWS Academy screenshots:

```text
docs/AWS_ACADEMY_SERVERLESS_GUI_CONSOLE.md
```

It creates S3 frontend, S3 photos, DynamoDB, API Gateway, Lambda API, Lambda worker, SQS, SNS, Secrets Manager, CloudWatch logs, and X-Ray tracing through the AWS Management Console.

### Console Upload: serverless-api

AWS Console -> Lambda -> Create function:

```text
Function name: my-api-function
Runtime: Node.js 20.x
Architecture: x86_64
Code source: upload build/lambdas/serverless-api.zip
Handler: index.handler
```

Environment:

```text
SAFETRACE_SECRET_ID=safetrace/serverless/app
AWS_REGION=us-east-1
TABLE_NAME=my-app-table
PHOTO_BUCKET=group10-alzheimer-photos-<account-id>
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/<account-id>/my-app-queue
CORS_ORIGIN=*
```

IAM permissions:

```text
secretsmanager:GetSecretValue
dynamodb:GetItem/PutItem/Scan/Query/UpdateItem/DeleteItem
s3:PutObject/GetObject on photo bucket
sqs:SendMessage/GetQueueAttributes
cloudwatch:GetMetricStatistics
CloudWatch Logs
X-Ray
```

API Gateway:

```text
HTTP API
Route: $default
Integration: my-api-function
CORS origin: S3 frontend website URL
```

### Console Upload: alert-dispatcher

AWS Console -> Lambda -> Create function:

```text
Function name: my-worker-function
Runtime: Node.js 20.x
Architecture: x86_64
Code source: upload build/lambdas/alert-dispatcher.zip
Handler: index.handler
```

Environment:

```text
AWS_REGION=us-east-1
SNS_TOPIC_ARN=<my-app-topic-arn>
TABLE_NAME=my-app-table
```

IAM permissions:

```text
sqs:ReceiveMessage
sqs:DeleteMessage
sqs:GetQueueAttributes
sns:Publish on my-app-topic
CloudWatch Logs
```

Trigger:

```text
SQS queue: my-app-queue
Batch size: 1 or 5
Enable partial batch response if available
```

AWS CLI option:

```bash
aws lambda update-function-code \
  --function-name my-worker-function \
  --zip-file fileb://build/lambdas/alert-dispatcher.zip
```

## Full Serverless Secret

Do not update the Phase A `safetrace/prod/app` secret for the full serverless path. Create a separate `safetrace/serverless/app` secret in the Secrets Manager console:

```json
{
  "TABLE_NAME": "<DynamoDB table>",
  "PHOTO_BUCKET": "<private photo bucket>",
  "SQS_QUEUE_URL": "<alert queue URL>",
  "SNS_TOPIC_ARN": "<alert topic ARN>",
  "AWS_REGION": "us-east-1",
  "CORS_ORIGIN": "*",
  "AUTH_DEV_EXPOSE_VERIFICATION_CODE": "true",
  "RESEND_API_KEY": "<optional-resend-key>",
  "RESEND_FROM_EMAIL": "<optional-resend-sender>",
  "JWT_SECRET": "<generated>"
}
```

The Lambda API reads this through `SAFETRACE_SECRET_ID`. Set `AUTH_DEV_EXPOSE_VERIFICATION_CODE=false` when you configure real Resend delivery.
