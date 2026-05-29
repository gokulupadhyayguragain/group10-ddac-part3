# AWS Academy Serverless GUI Console Build

Use this for **Phase B / Task 2 full serverless** when the lecturer expects AWS Management Console screenshots. Do not use CloudFormation for this version.

Region: `us-east-1`

## Final Architecture

```text
Browser
-> S3 frontend static website bucket
-> API Gateway HTTP API
-> my-api-function Lambda
-> DynamoDB my-app-table
-> private S3 photo bucket
-> SQS my-app-queue
-> my-worker-function Lambda
-> SNS my-app-topic
```

CloudWatch logs/metrics and X-Ray tracing must be enabled for both Lambda functions.

## 0. Build Files Locally

Run this from the repo before opening the AWS Console:

```bash
cd ~/ddac/code
bash scripts/package_lambdas.sh
```

You will upload these files in the Lambda console:

```text
build/lambdas/serverless-api.zip
build/lambdas/alert-dispatcher.zip
```

Do not upload raw `index.mjs` files.

## 1. S3 Frontend Bucket

S3 -> Buckets -> Create bucket:

```text
Bucket name: group10-alzheimer-frontend-<account-id>
Region: us-east-1
Block all public access: OFF
Bucket versioning: optional
Default encryption: SSE-S3
```

After creation:

```text
Properties -> Static website hosting -> Enable
Index document: index.html
Error document: 404.html
```

Permissions -> Bucket policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadStaticFrontend",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::group10-alzheimer-frontend-<account-id>/*"
    }
  ]
}
```

If the policy is rejected, check the account-level S3 Block Public Access setting in AWS Academy.

## 2. S3 Photo Bucket

S3 -> Buckets -> Create bucket:

```text
Bucket name: group10-alzheimer-photos-<account-id>
Region: us-east-1
Block all public access: ON
Default encryption: SSE-S3
```

No public bucket policy. This bucket stores patient, avatar, and sighting images written by Lambda.

## 3. DynamoDB Table

DynamoDB -> Tables -> Create table:

```text
Table name: my-app-table
Partition key: PK    String
Sort key: SK         String
Table settings: Customize settings
Capacity mode: On-demand
Encryption: AWS owned key
```

Create global secondary index:

```text
Index name: GSI1
Partition key: GSI1PK    String
Sort key: GSI1SK         String
Projection: All
```

After table is created:

```text
Additional settings -> Time to Live -> Enable
TTL attribute name: expires_at_epoch
```

Schema mapping:

```text
USER#<id>      META
PERSON#<id>    META
SIGHTING#<id>  META
ALERT#<id>     META
RATE#...       WINDOW#... for rate limiting
```

## 4. SQS Queue

SQS -> Queues -> Create queue:

```text
Type: Standard
Name: my-app-dlq
Visibility timeout: 30 seconds
Message retention: 14 days
```

Create main queue:

```text
Type: Standard
Name: my-app-queue
Visibility timeout: 30 seconds
Receive message wait time: 5 seconds
Dead-letter queue: Enabled
DLQ: my-app-dlq
Maximum receives: 5
```

Copy the queue URL and ARN.

## 5. SNS Topic

SNS -> Topics -> Create topic:

```text
Type: Standard
Name: my-app-topic
Display name: SafeTrace Alerts
```

Create subscription:

```text
Protocol: Email
Endpoint: your demo email address
```

Open the email and confirm the subscription before testing.

## 6. Secrets Manager

Secrets Manager -> Store a new secret:

```text
Secret type: Other type of secret
Secret name: safetrace/serverless/app
```

Secret JSON:

```json
{
  "TABLE_NAME": "my-app-table",
  "PHOTO_BUCKET": "group10-alzheimer-photos-<account-id>",
  "SQS_QUEUE_URL": "https://sqs.us-east-1.amazonaws.com/<account-id>/my-app-queue",
  "SNS_TOPIC_ARN": "arn:aws:sns:us-east-1:<account-id>:my-app-topic",
  "AWS_REGION": "us-east-1",
  "CORS_ORIGIN": "*",
  "AUTH_DEV_EXPOSE_VERIFICATION_CODE": "true",
  "RESEND_API_KEY": "",
  "RESEND_FROM_EMAIL": "",
  "JWT_SECRET": "<openssl rand -base64 48>"
}
```

For real email verification, fill `RESEND_API_KEY`, fill `RESEND_FROM_EMAIL`, and change `AUTH_DEV_EXPOSE_VERIFICATION_CODE` to `false`.

## 7. IAM Roles

If AWS Academy restricts IAM, use `LabRole`. If custom IAM is allowed, create these two roles.

### API Lambda Role

IAM -> Roles -> Create role:

```text
Trusted entity: AWS service
Use case: Lambda
Role name: my-api-function-role
Managed policies:
  AWSLambdaBasicExecutionRole
  AWSXRayDaemonWriteAccess
```

Inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:us-east-1:<account-id>:secret:safetrace/serverless/app-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Scan",
        "dynamodb:Query",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:<account-id>:table/my-app-table",
        "arn:aws:dynamodb:us-east-1:<account-id>:table/my-app-table/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::group10-alzheimer-photos-<account-id>/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:SendMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:us-east-1:<account-id>:my-app-queue"
    },
    {
      "Effect": "Allow",
      "Action": "cloudwatch:GetMetricStatistics",
      "Resource": "*"
    }
  ]
}
```

### Worker Lambda Role

IAM -> Roles -> Create role:

```text
Trusted entity: AWS service
Use case: Lambda
Role name: my-worker-function-role
Managed policies:
  AWSLambdaBasicExecutionRole
  AWSXRayDaemonWriteAccess
```

Inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
        "sqs:ChangeMessageVisibility"
      ],
      "Resource": "arn:aws:sqs:us-east-1:<account-id>:my-app-queue"
    },
    {
      "Effect": "Allow",
      "Action": "sns:Publish",
      "Resource": "arn:aws:sns:us-east-1:<account-id>:my-app-topic"
    },
    {
      "Effect": "Allow",
      "Action": "dynamodb:UpdateItem",
      "Resource": "arn:aws:dynamodb:us-east-1:<account-id>:table/my-app-table"
    }
  ]
}
```

## 8. Lambda API Backend

Lambda -> Create function:

```text
Function name: my-api-function
Runtime: Node.js 20.x
Architecture: x86_64
Execution role: my-api-function-role or LabRole
```

Upload:

```text
Code -> Upload from -> .zip file
File: build/lambdas/serverless-api.zip
Handler: index.handler
```

Configuration:

```text
Memory: 512 MB
Timeout: 30 seconds
Runtime environment variables:
  AWS_REGION=us-east-1
  SAFETRACE_SECRET_ID=safetrace/serverless/app
  TABLE_NAME=my-app-table
  PHOTO_BUCKET=group10-alzheimer-photos-<account-id>
  SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/<account-id>/my-app-queue
  CORS_ORIGIN=*
Monitoring and operations tools:
  X-Ray active tracing: ON
```

Do not put this Lambda in a VPC. DynamoDB, S3, SQS, SNS, Secrets Manager, and API Gateway are public AWS service endpoints; leaving Lambda outside a VPC avoids NAT problems.

## 9. Lambda Worker

Lambda -> Create function:

```text
Function name: my-worker-function
Runtime: Node.js 20.x
Architecture: x86_64
Execution role: my-worker-function-role or LabRole
```

Upload:

```text
Code -> Upload from -> .zip file
File: build/lambdas/alert-dispatcher.zip
Handler: index.handler
```

Configuration:

```text
Memory: 256 MB
Timeout: 30 seconds
Runtime environment variables:
  AWS_REGION=us-east-1
  SNS_TOPIC_ARN=arn:aws:sns:us-east-1:<account-id>:my-app-topic
  TABLE_NAME=my-app-table
Monitoring and operations tools:
  X-Ray active tracing: ON
```

Add trigger:

```text
Trigger source: SQS
Queue: my-app-queue
Batch size: 10
Batch window: 5 seconds
Report batch item failures: ON if visible
```

## 10. API Gateway

API Gateway -> Create API:

```text
API type: HTTP API
Integration: Lambda
Lambda function: my-api-function
API name: safetrace-http-api
```

Routes:

```text
Route: $default
Integration target: my-api-function
```

CORS:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: content-type, authorization, x-api-key
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
```

Stages:

```text
Stage: $default
Auto-deploy: ON
Access logs: ON if the console allows it
Log group: /aws/apigateway/safetrace-http-api
```

Copy the API invoke URL:

```text
https://<api-id>.execute-api.us-east-1.amazonaws.com
```

Test:

```bash
curl -i https://<api-id>.execute-api.us-east-1.amazonaws.com/api/health
curl -i -X POST https://<api-id>.execute-api.us-east-1.amazonaws.com/api/admin/seed
```

## 11. Build And Upload Frontend

Build the static frontend with the API Gateway URL:

```bash
cd ~/ddac/code
NEXT_PUBLIC_API_BASE_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com \
SAFETRACE_STATIC_EXPORT=true \
bash scripts/build_serverless_frontend.sh
```

S3 -> frontend bucket -> Upload:

```text
Upload all files and folders inside:
frontend_next/out/

Important:
Upload the contents of out, not the out folder itself.
```

Open the S3 static website endpoint from bucket Properties.

## 12. Migration Statement

No custom migration script is required for this assignment demo.

For the report, state this:

```text
If Phase A RDS PostgreSQL data must be moved into Phase B DynamoDB, the project would use AWS Database Migration Service (AWS DMS) for data movement and AWS Schema Conversion Tool / DMS Schema Conversion for migration assessment and conversion planning. Because DynamoDB is NoSQL, the target table is designed from application access patterns rather than copied as a one-to-one relational schema.
```

For the demo, use `POST /api/admin/seed` to create DynamoDB sample data.

## 13. Queue Demo

Normal queue wait time can be `0-5 seconds` because the worker consumes quickly.

For screenshots:

```text
1. Lambda -> my-worker-function -> disable SQS trigger.
2. Submit a sighting in the frontend.
3. SQS -> my-app-queue should show visible messages.
4. Enable the trigger again.
5. Show visible messages returning to zero.
6. Show SNS email and CloudWatch worker logs.
```

## 14. Evidence Screenshots

Capture:

```text
S3 frontend bucket: index.html and _next assets
S3 photo bucket: uploaded patient/sighting images
DynamoDB table: USER, PERSON, SIGHTING, ALERT items
Secrets Manager: safetrace/serverless/app keys, hide secret values
Lambda my-api-function: zip code, env vars, X-Ray active
Lambda my-worker-function: SQS trigger, env vars, X-Ray active
API Gateway: HTTP API invoke URL and $default route
SQS: queue metrics visible/in-flight/delayed
SNS: topic subscription confirmed
CloudWatch: Lambda log streams and API access logs
X-Ray: trace or service map
Frontend: S3 website working login/report/sighting workflow
```
