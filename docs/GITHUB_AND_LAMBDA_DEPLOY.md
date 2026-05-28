# GitHub And Lambda Deploy

One repository should contain everything:

```text
group10-ddac-part3/
  backend_ts/            Express TypeScript API
  frontend_next/         Next.js frontend
  lambdas/
    sighting-ingest/     API Gateway -> SQS Lambda
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
Task 2 S3/SQS/SNS/API Gateway values later
```

## How To Upload Lambda JS

Lambda JS is only for Task 2.

Source folders:

```text
lambdas/sighting-ingest/index.mjs
lambdas/alert-dispatcher/index.mjs
```

Package locally:

```bash
bash scripts/package_lambdas.sh
```

Generated zip files:

```text
build/lambdas/sighting-ingest.zip
build/lambdas/alert-dispatcher.zip
```

Upload the zip file, not the raw `index.mjs` file. Lambda needs the handler file plus `package.json`, lockfile, and `node_modules`.

### Console Upload: sighting-ingest

AWS Console -> Lambda -> Create function:

```text
Function name: my-api-function
Runtime: Node.js 20.x
Architecture: x86_64
Code source: upload build/lambdas/sighting-ingest.zip
Handler: index.handler
```

Environment:

```text
AWS_REGION=us-east-1
SQS_QUEUE_URL=<my-app-queue-url>
SIGHTING_EVENT_API_KEY=<optional-shared-key>
```

IAM permissions:

```text
sqs:SendMessage on my-app-queue
CloudWatch Logs
```

Then create API Gateway HTTP API:

```text
Route: POST /sighting-events
Integration: my-api-function
CORS origin: ALB DNS or final domain
```

Copy API invoke URL into Secrets Manager:

```text
SIGHTING_EVENT_API_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com/sighting-events
```

AWS CLI option:

```bash
aws lambda update-function-code \
  --function-name my-api-function \
  --zip-file fileb://build/lambdas/sighting-ingest.zip
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

## Backend Secret Values After Lambda Is Ready

Update `safetrace/prod/app`:

```json
{
  "S3_BUCKET": "group10-alzheimer-photos-<account-id>",
  "SIGHTING_EVENT_API_URL": "https://<api-id>.execute-api.us-east-1.amazonaws.com/sighting-events",
  "SIGHTING_EVENT_API_KEY": "<same-key-used-in-lambda>",
  "SQS_QUEUE_URL": "https://sqs.us-east-1.amazonaws.com/<account-id>/my-app-queue",
  "SNS_TOPIC_ARN": "arn:aws:sns:us-east-1:<account-id>:my-app-topic"
}
```

Restart backend after updating secret:

```bash
docker compose restart backend
```
