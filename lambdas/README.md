# SafeTrace Lambda Functions

Lambda code is used only in Task 2. Task 1 EC2/RDS does not need Lambda.

Package all functions from the repo root:

```bash
bash scripts/package_lambdas.sh
```

Upload these zip files in the Lambda console:

```text
build/lambdas/alert-dispatcher.zip
build/lambdas/serverless-api.zip
```

By default, `scripts/package_lambdas.sh` now creates only those two required zips. To also package the legacy adapter, run:

```bash
INCLUDE_LEGACY_INGEST=true bash scripts/package_lambdas.sh
```

## serverless-api

Full Phase B backend for API Gateway. It reads Secrets Manager, stores data in DynamoDB, uploads data-URI photos to S3, and sends alert events to SQS.

Deployment outline:

1. Create the Lambda with Node.js 20.x runtime.
2. Set environment variable `SAFETRACE_SECRET_ID=safetrace/serverless/app`.
3. Attach IAM permissions for Secrets Manager read, DynamoDB CRUD, S3 object put/get, SQS send/get attributes, CloudWatch metric read, CloudWatch Logs, and X-Ray.
4. Create an API Gateway HTTP API `$default` route to this Lambda.

## alert-dispatcher

Consumes messages from the SafeTrace SQS queue, publishes caregiver/community notifications to SNS, and updates the DynamoDB alert item to `sent`.

Deployment outline:

1. Create or reuse the SNS topic referenced by `SNS_TOPIC_ARN`.
2. Create the Lambda with Node.js 20.x runtime.
3. Set environment variables:
   - `AWS_REGION`
   - `SNS_TOPIC_ARN`
   - `TABLE_NAME`
4. Attach IAM policy allowing SQS consume, SNS publish, DynamoDB alert status update, CloudWatch Logs, and X-Ray.
5. Add the SQS queue as the Lambda event source mapping.
6. Enable partial batch response failures for safer retries.

## sighting-ingest Legacy Adapter

This zip is kept only for old EC2 extension experiments. It is not part of the required Phase B full serverless submission. Use `serverless-api` for API Gateway traffic.
