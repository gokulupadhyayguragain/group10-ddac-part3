# SafeTrace Lambda Functions

Lambda code is used only in Task 2. Task 1 EC2/RDS does not need Lambda.

Package both functions from the repo root:

```bash
bash scripts/package_lambdas.sh
```

Upload these zip files in the Lambda console:

```text
build/lambdas/sighting-ingest.zip
build/lambdas/alert-dispatcher.zip
```

## sighting-ingest

API Gateway compatible Lambda that accepts a sighting alert event and sends it to SQS.

Deployment outline:

1. Create the Lambda with Node.js 20.x runtime.
2. Set environment variables:
   - `AWS_REGION`
   - `SQS_QUEUE_URL`
   - `SIGHTING_EVENT_API_KEY` if API key protection is required.
3. Attach an IAM policy allowing `sqs:SendMessage` on the SafeTrace queue.
4. Create an API Gateway HTTP API route: `POST /sighting-events`.
5. Point `SIGHTING_EVENT_API_URL` in Secrets Manager to the deployed API Gateway URL.

If `SIGHTING_EVENT_API_URL` is configured, the EC2 backend posts alert events to API Gateway. If it is not configured, the backend sends directly to SQS.

## alert-dispatcher

Consumes messages from the SafeTrace SQS queue and publishes caregiver/community notifications to SNS.

Deployment outline:

1. Create or reuse the SNS topic referenced by `SNS_TOPIC_ARN`.
2. Create the Lambda with Node.js 20.x runtime.
3. Set environment variables:
   - `AWS_REGION`
   - `SNS_TOPIC_ARN`
4. Attach an IAM policy allowing `sns:Publish` on the SafeTrace topic.
5. Add the SQS queue as the Lambda event source mapping.
6. Enable partial batch response failures for safer retries.

The web backend or `sighting-ingest` Lambda writes sighting alert events to SQS when `SQS_QUEUE_URL` is configured. This Lambda is the Task 2 worker that drains the queue and fans out alerts through SNS.
