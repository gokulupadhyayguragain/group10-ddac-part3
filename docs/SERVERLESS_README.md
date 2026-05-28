AWS Academy Cloud Developing 2.x — Serverless Application README
=================================================================

Overview
--------
This guide provides a full, detailed, Console-only walkthrough to build a production-like serverless application appropriate for AWS Academy Cloud Developing 2.x labs and the Academy Sandbox constraints.

Goals
- Deploy a static frontend (S3 + CloudFront)
- Expose a REST API (API Gateway HTTP API) backed by Lambda
- Use DynamoDB as the primary data store (DynamoDB-first)
- Add asynchronous processing using SQS, SNS, and Lambda workers
- Orchestrate more complex flows with Step Functions
- Secure access using Cognito and least-privilege IAM (use `LabRole` when sandbox limits apply)

Notes about Console-only and Academy sandbox
- These steps use the AWS Management Console only — no CLI or IaC required.
- Labs are frequently permission-restricted: if a step is blocked, the guide documents an Academy-friendly alternative (use `LabRole`, SSM Parameter Store, or request instructor assistance).

Architecture Overview
---------------------
Main architecture diagram (logical):

Frontend (S3 + CloudFront)
↓
API Gateway (HTTP API)
↓
Lambda (API handlers)
↓
DynamoDB (primary storage)
↓
SQS (durable background queue)
↓
Lambda Worker (background processor)
↓
SNS (notifications)
↓
Step Functions (optional orchestration)


Prerequisites and conventions
-----------------------------
- Region: use one of the supported Academy regions (`us-east-1` recommended).
- Naming conventions used in examples (change to match your account):
  - S3 static bucket: `my-app-frontend-<your-suffix>`
  - DynamoDB table: `my-app-table`
  - API Lambda: `my-api-function`
  - Worker Lambda: `my-worker-function`
  - SQS queue: `my-app-queue`
  - SNS topic: `my-app-topic`
- IAM: prefer `LabRole` or the Console-created execution roles. If your lab allows creating a role, scope policies to specific ARNs.
- Cost: DynamoDB on-demand, Lambda, SQS, and SNS are low-cost for small demos, but CloudFront and high request volumes may increase charges.


Part A — Frontend: S3 + CloudFront (Console)
-------------------------------------------
1) Create S3 bucket for static hosting
- Console → Services → S3 → Create bucket
- Settings:
  - Bucket name: `my-app-frontend-<your-suffix>` (must be globally unique)
  - Region: `us-east-1`
  - Block Public Access: UNCHECK "Block all public access" only if you want public website access; for CloudFront origin you may keep the bucket private and grant Origin Access later.
  - Leave other settings default for a lab.
- Click Create bucket.

2) Upload static assets
- Visit the bucket → Upload → add `index.html`, `styles.css`, `app.js`, and any assets.

3) Configure static website hosting (optional public site)
- Bucket → Properties → Static website hosting → Enable
- Index document: `index.html`
- Save changes and copy the website endpoint for quick tests.

4) (Recommended) Create an Origin Access Control (OAC) and CloudFront distribution
- Open CloudFront → Create distribution → Web
- Origin: select your S3 bucket (use the bucket's REST endpoint or S3 static endpoint)
- Viewer protocol policy: Redirect HTTP to HTTPS
- If you want the bucket private, configure Origin Access (OAC) to restrict access to CloudFront only.
- Create the distribution and note the domain name (it may take several minutes to deploy).

Testing frontend
- Open the CloudFront domain or S3 website endpoint in a browser and verify `index.html` loads.


Part B — Data Layer: DynamoDB (Console)
---------------------------------------
1) Create DynamoDB table
- Console → Services → DynamoDB → Create table
- Settings:
  - Table name: `my-app-table`
  - Partition key: `id` (String)
  - Sort key: optional (e.g., `createdAt` if you want time-ordered items)
  - Capacity mode: On-demand (recommended for labs)
  - Encryption: AWS owned CMK is fine for labs
  - Streams: Enable if you plan to trigger Lambda from data changes (Optional: New and old images)
- Click Create table.

2) Example item design
- For a simple items API, use a schema like:
  - `id` (PK, UUID string)
  - `ownerId` (user id)
  - `title` (string)
  - `body` (string)
  - `createdAt` (ISO timestamp)

3) Indexes (optional)
- Create a Global Secondary Index (GSI) if you need queries on `ownerId`:
  - Index name: `ownerId-index`
  - Partition key: `ownerId`
  - Projection: `All` (small lab workloads ok)


Part C — API Lambda (Console) — create API handler
-------------------------------------------------
1) Create a Lambda function (API)
- Console → Services → Lambda → Create function
- Choose "Author from scratch"
- Function name: `my-api-function`
- Runtime: Node.js 18.x or Python 3.11
- Permissions: Choose "Use existing role" → select `LabRole` if available. If not available, choose "Create new role from AWS policy templates" with basic Lambda permissions and later attach a tightly scoped policy for DynamoDB access.

2) Add environment variables
- Configuration → Environment variables → Add:
  - `TABLE_NAME` = `my-app-table`
  - `REGION` = `us-east-1`

3) Example minimal handler code (Node.js) — use the inline editor or upload a zip for dependencies
```javascript
// index.mjs
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = process.env.TABLE_NAME;

export const handler = async (event) => {
  const method = event.requestContext.http.method;
  const path = event.rawPath;
  if (method === 'POST' && path === '/items') {
    const body = JSON.parse(event.body || '{}');
    const id = Date.now().toString();
    await ddb.send(new PutCommand({ TableName: TABLE, Item: { id, ...body, createdAt: new Date().toISOString() } }));
    return { statusCode: 201, body: JSON.stringify({ id }) };
  }
  return { statusCode: 400, body: 'Bad request' };
};
```

4) Permissions for Lambda to access DynamoDB
- If using `LabRole`, ask instructor to attach a policy like below scoped to your table ARN.
- Example minimal IAM policy (attach to the Lambda execution role):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:<account-id>:table/my-app-table"
    }
  ]
}
```


Part D — API Gateway (HTTP API) — Console
----------------------------------------
1) Create an HTTP API
- Console → Services → API Gateway → Create API → HTTP API → Build

2) Add Lambda integration
- Integrations → Add integration → Lambda
- Select: `my-api-function` and add integration

3) Add routes
- Routes → Create route → e.g., POST /items, GET /items/{id}
- Attach integration to each route

4) Deploy and obtain invoke URL
- Deploy the stage (default: `$default`) and note the invoke URL — use it in frontend or backend tests.

5) CORS
- If calling from browser-based frontend, enable CORS on the route and allow the CloudFront/S3 origin domain.


Part E — Asynchronous processing: SQS + Worker Lambda
---------------------------------------------------
1) Create SQS queue
- Console → Services → SQS → Create queue
- Name: `my-app-queue`
- Type: Standard
- Configure visibility timeout: 30 seconds (match worker processing time)
- Configure DLQ (dead-letter queue): create another queue `my-app-dlq` and set redrive policy (e.g., maxReceiveCount=5)

2) Create worker Lambda
- Lambda → Create function → `my-worker-function`
- Runtime: Node.js 18.x or Python 3.11
- Permissions: use `LabRole` or create role with `sqs:ReceiveMessage`, `sqs:DeleteMessage` and `sns:Publish` if the worker publishes notifications

3) Add SQS trigger to the worker
- Open `my-worker-function` → Configuration → Add trigger → select SQS → `my-app-queue`

4) Example worker pseudocode (Node.js)
```javascript
export const handler = async (event) => {
  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    // process and publish to SNS, or write back to DynamoDB
  }
};
```


Part F — SNS notifications
--------------------------
1) Create SNS topic
- Console → Services → SNS → Create topic → Standard → `my-app-topic`

2) Add subscription
- Topic → Create subscription → Protocol: Email, Endpoint: you@example.com
- Confirm the subscription via the email sent to the endpoint

3) Grant the worker Lambda permission to publish to the topic
- Attach `sns:Publish` permission scoped to the topic ARN to the worker Lambda role


Part G — Step Functions (optional orchestration)
-----------------------------------------------
1) Create a State Machine
- Console → Services → Step Functions → Create state machine → Standard

2) Example minimal ASL (JSON)
```json
{
  "Comment": "Simple ingest workflow",
  "StartAt": "Validate",
  "States": {
    "Validate": {"Type": "Pass", "Next": "Store"},
    "Store": {"Type": "Task", "Resource": "arn:aws:states:::lambda:invoke","Next":"Notify"},
    "Notify": {"Type": "Task", "Resource": "arn:aws:states:::sns:publish","End": true}
  }
}
```


Part H — Authentication: Amazon Cognito (optional)
-------------------------------------------------
1) Create a user pool
- Console → Services → Cognito → Create a user pool
- Choose email as a sign-in option and configure required attributes

2) Configure App client and authorizer in API Gateway
- API Gateway → Authorizers → Create a new Cognito authorizer and attach to routes


Part I — Testing, Monitoring, and Tracing
-----------------------------------------
1) Test API endpoints
- Use the API Gateway console's "Test" feature or `curl` to POST to `/items` and GET items

2) View logs
- Lambda → View function → Monitor → View logs in CloudWatch

3) Create CloudWatch alarms
- CloudWatch → Alarms → Create alarm for Lambda errors or throttle metrics and SQS ApproximateAgeOfOldestMessage

4) Enable X-Ray
- Lambda → Configuration → Edit monitoring → Enable active tracing


Part J — Cost control and cleanup
---------------------------------
1) Cost considerations
- DynamoDB on-demand and Lambda have low baseline costs. Monitor CloudFront, DynamoDB read/write capacity (if provisioned), and SQS usage.

2) Cleanup order (reverse of creation)
- API Gateway → Delete API
- Lambda → Remove functions
- SQS → Delete queues
- SNS → Delete topic and subscriptions
- DynamoDB → Delete table (consider exporting if you need data)
- S3 → Empty and delete buckets
- CloudFront → Delete distribution (wait until it disables)


Troubleshooting (Common issues)
-------------------------------
- Lambda permission errors: ensure the Lambda execution role has the required `dynamodb:*`, `sqs:*`, or `sns:*` permissions scoped to your resources.
- CORS errors from browser: enable CORS on API Gateway routes and allow CloudFront/S3 origin.
- Slow cold starts: keep Lambda functions small, prefer not to place Lambdas in a VPC unless necessary (ENI cold-start overhead).


Appendix A — Sample IAM snippets
--------------------------------
1) Minimal DynamoDB policy (attach to API Lambda role):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect":"Allow","Action":["dynamodb:PutItem","dynamodb:GetItem","dynamodb:Query","dynamodb:UpdateItem","dynamodb:DeleteItem"],"Resource":"arn:aws:dynamodb:us-east-1:ACCOUNT_ID:table/my-app-table"}
  ]
}
```

2) Minimal SQS publish/receive policy (attach to worker role):
```json
{
  "Version":"2012-10-17",
  "Statement":[{"Effect":"Allow","Action":["sqs:ReceiveMessage","sqs:DeleteMessage","sqs:GetQueueAttributes"],"Resource":"arn:aws:sqs:us-east-1:ACCOUNT_ID:my-app-queue"}]
}
```

Appendix B — Academy sandbox tips
--------------------------------
- If Secrets Manager creation is blocked, use SSM Parameter Store with `SecureString` (Console → Systems Manager → Parameter Store → Create parameter).
- If you cannot create IAM roles, use the Console's auto-generated roles where allowed, or request the course instructor to attach the minimal policy to the `LabRole`.
- Prefer DynamoDB-first designs in Academy labs to avoid VPC/Lambda ENI issues.

Last reviewed: 2026-05-28

Amazon Cognito | Authentication
AWS IAM | Access management
AWS CloudWatch | Monitoring and logs
AWS X-Ray | Application tracing
AWS Elastic Beanstalk | Managed application deployment
Amazon ECS | Container orchestration
AWS CloudFormation | Infrastructure deployment
AWS SAM | Serverless deployment
AWS CodePipeline | CI/CD automation


Course Module Alignment
-----------------------
Module | Topic | AWS Services
---|---|---
Module 3 | Storage Solutions | S3
Module 4 | Securing Access | IAM, Cognito
Module 5 | NoSQL Development | DynamoDB
Module 6 | REST APIs | API Gateway
Module 7 | Serverless Solutions | Lambda
Module 8 | Containers | Docker, ECS, Elastic Beanstalk
Module 9 | Caching | CloudFront, ElastiCache
Module 10 | Messaging | SQS, SNS
Module 11 | Workflows | Step Functions
Module 12 | Secure Applications | Cognito, STS
Module 13 | CI/CD | CodePipeline, CloudFormation, SAM


AWS Academy Sandbox Restrictions
--------------------------------
This project follows AWS Academy Sandbox limitations.
Supported Regions
Only these regions are supported:
- us-east-1
- us-west-2

Important Restrictions
EC2 Restrictions
Only nano, micro, and small instances
Maximum 9 instances
Maximum 32 vCPUs
Amazon-owned AMIs only

RDS Restrictions
Multi-AZ not supported
Small instance classes only
Maximum storage: 100 GB
Enhanced monitoring must be disabled

IAM Restrictions
Cannot create IAM users or groups
Existing LabRole should be reused
Existing LabInstanceProfile should be reused

Project Components
------------------
Part 1 — Frontend Hosting with Amazon S3
- Create S3 Bucket
  - Open AWS Console → Amazon S3 → Create bucket
  - Configuration: Bucket Name `my-app-frontend`, Region `us-east-1`
  - Configure Static Website Hosting: Properties → Static website hosting
  - Upload `index.html`, CSS, JavaScript
  - Configure Public Access: disable Block all public access and add a public-read bucket policy as required for a public site

Part 2 — Create DynamoDB Database
- Create Table
  - DynamoDB → Create table
  - Table Name: `my-app-table`
  - Partition Key: `id`
  - Capacity Mode: On-demand (recommended for labs)

Part 3 — Create Lambda Functions
- Create API Lambda
  - Lambda → Create function → Author from scratch
  - Function Name: `my-api-function`
  - Runtime: Python or Node.js
  - Permissions: Use existing role → LabRole

  - Configure Environment Variables → `TABLE_NAME = my-app-table`

Part 4 — Configure API Gateway
- Create API
  - API Gateway → Create API → HTTP API → Build
  - Add Lambda integration for `my-api-function`
  - Add routes: GET /items, POST /items, PUT /items, DELETE /items
  - Deploy and copy the invoke URL

Part 5 — Configure Amazon SQS
- Create Queue
  - SQS → Create queue → Standard → `my-app-queue`

Part 6 — Create Lambda Worker
- Create Worker Function
  - Lambda → Create function → `my-worker-function` (Python/Node.js)
  - Permissions: Use existing role → LabRole
  - Add SQS trigger → select `my-app-queue`

Part 7 — Configure Amazon SNS
- Create Topic
  - SNS → Create topic → Standard → `my-app-topic`
  - Create subscription: Protocol Email, Endpoint your-email@example.com (confirm email)

Part 8 — Create Step Functions Workflow
- Create State Machine
  - Step Functions → Create state machine → Standard
  - Add Lambda workflow steps: validate input → process → store in DynamoDB → send SNS

Part 9 — Configure Amazon Cognito
- Create User Pool
  - Cognito → Create user pool → Sign-in with Email (MFA optional)
  - Configure API authentication: attach Cognito authorizer to API Gateway routes

Part 10 — Configure CloudFront
- Create Distribution
  - CloudFront → Create distribution → Origin: S3 frontend bucket → configure caching

Part 11 — Containers and Deployment
- Container options: Dockerize the app for ECS/Elastic Beanstalk

Part 12 — CI/CD Pipeline
- Create CodePipeline stages: Source → Build → Deploy
  - Use CloudFormation/SAM/Elastic Beanstalk/ECS as deployment targets

Part 13 — Monitoring and Logging
- CloudWatch: Lambda logs, Metrics, Alarms
- X-Ray: enable tracing on Lambdas for request tracing

Testing the Application
- Frontend: Verify CloudFront or S3 website loads
- API Gateway: Test endpoints and Lambda execution
- DynamoDB: Verify items inserted correctly
- SQS: Send test messages and verify worker processing
- SNS: Publish and verify email delivery

Conclusion
----------
This project demonstrates a complete AWS cloud-native serverless application aligned with AWS Academy Cloud Developing 2.x concepts. The implementation includes storage, NoSQL databases, REST APIs, event-driven architecture, messaging, authentication, containers, CI/CD, monitoring and tracing. It follows AWS managed-service and serverless best practices while remaining compatible with AWS Academy Sandbox restrictions.

Last reviewed: 2026-05-28
