# Manual: Build VPC, Subnets, RDS, ALB, ASG (AWS Console)

Purpose: step-by-step GUI instructions using the AWS Management Console only (no CLI). Replace example names/CIDRs with values appropriate for your account and environment.

Last reviewed: 2026-05-28

## Overview
- VPC with three subnet types in two AZs: Public, PrivateApp, PrivateDB
- Internet Gateway for public subnets
- NAT Gateway(s) for private app subnets
- DB subnet group for RDS (private DB subnets)
- Security Groups wired by least-privilege (ALB → App → RDS)
- Secrets Manager for DB credentials
 - RDS PostgreSQL (single-AZ recommended for AWS Academy labs)
 - Note: use SSM Parameter Store as a fallback if Secrets Manager is restricted in your lab
- Application Load Balancer (internet-facing) → Target Group → Auto Scaling Group running app instances
- IAM roles: EC2 instance role with minimal permissions (SecretsManager read, SSM)

---

## Before you begin
- Choose the AWS Region where you'll create resources.
- Decide CIDR blocks and AZs (example VPC 10.0.0.0/16; Public/PrivateApp/PrivateDB per AZ).
- Identify an AMI for your app instances and an SSH keypair (if needed).

## 1) Create the VPC
1. Open the AWS Console and go to the VPC service.
2. In the left menu choose "Your VPCs" and click **Create VPC**.
3. Fill in:
   - Name tag: `my-vpc`
   - IPv4 CIDR block: e.g. `10.0.0.0/16`
   - Tenancy: Default
4. Click **Create VPC**.
5. Select the new VPC, choose **Actions → Edit DNS hostnames**, enable hostnames if you need internal DNS names.

## 2) Create Subnets (Public, PrivateApp, PrivateDB) in two AZs
1. In the VPC console left menu select **Subnets** → **Create subnet**.
2. For each subnet create one per AZ (repeat for AZ A and AZ B):
   - VPC: select `my-vpc`
   - Subnet name: e.g. `my-vpc-public-a`, `my-vpc-public-b`, `my-vpc-privateapp-a`, `my-vpc-privateapp-b`, `my-vpc-privatedb-a`, `my-vpc-privatedb-b`
   - Availability Zone: choose AZ (AZ A or AZ B)
   - IPv4 CIDR block: assign e.g. `10.0.0.0/24`, `10.0.1.0/24`, `10.0.10.0/24`, `10.0.11.0/24`, `10.0.20.0/24`, `10.0.21.0/24`
3. After creation, select each public subnet and **Actions → Modify auto-assign IP settings** and enable Auto-assign public IPv4.

## 3) Create Internet Gateway and public routing
1. In the VPC console left menu select **Internet Gateways** → **Create internet gateway**. Name it `my-vpc-igw` and create.
2. Select the IGW and choose **Actions → Attach to VPC** and attach to `my-vpc`.
3. In left menu select **Route tables** → create a route table named `public-rt` attached to `my-vpc`.
4. Select `public-rt` → **Routes** → **Edit routes** → **Add route**: Destination `0.0.0.0/0`, Target: the IGW you created. Save routes.
5. With `public-rt` selected choose **Subnet associations** → **Edit subnet associations** and select both public subnets.

## 4) Create NAT Gateway(s) for PrivateApp subnets
Note: for AZ-fault tolerance create a NAT Gateway in each public subnet (one per AZ). NAT Gateways are charged per hour.
1. In the VPC console choose **NAT Gateways** → **Create NAT gateway**.
2. For each AZ: select the Public subnet in that AZ and allocate a new Elastic IP, name `nat-a` / `nat-b`. Create.
3. Create one private route table per AZ for PrivateApp subnets (or a shared one with NAT target if AZ affinity not required):
   - Create `app-rt-a` and `app-rt-b` in VPC `my-vpc`.
   - For `app-rt-a` add route `0.0.0.0/0` → NAT Gateway in AZ A; associate `my-vpc-privateapp-a`.
   - For `app-rt-b` add route `0.0.0.0/0` → NAT Gateway in AZ B; associate `my-vpc-privateapp-b`.
4. For DB subnets create a route table `db-rt` and associate both privatedb subnets but do NOT add an internet route.

## 5) (Optional) Create VPC Endpoints
1. For private access to services create VPC Endpoints:
   - VPC Console → Endpoints → Create endpoint
   - Create an interface endpoint for `com.amazonaws.<region>.secretsmanager` and attach to the PrivateApp subnets; choose or create a small security group for the endpoint.
   - Create a gateway endpoint for S3 and add the route tables you want to access S3 privately.

## 6) Create DB Subnet Group (RDS)
1. Open the RDS console → left menu **Subnet groups** (or **Parameter groups & subnet groups**) → **Create DB subnet group**.
2. Name: `my-db-subnetgroup`.
3. Description: `Private DB subnets`.
4. VPC: select `my-vpc` and add the two privatedb subnets (AZ A and AZ B).
5. Create the group.

## 7) Create Security Groups (least-privilege)
1. Open the EC2 console → left menu **Security Groups** → **Create security group**.
2. Create `alb-sg` (VPC `my-vpc`):
   - Inbound: HTTP 80 and/or HTTPS 443 from `0.0.0.0/0` (or restricted CIDR)
   - Outbound: allow default (or restrict to `app-sg`)
3. Create `app-sg` (VPC `my-vpc`):
   - Inbound: allow HTTP `80` from `alb-sg` only (use a security group reference)
   - Outbound: allow TCP `443` to the internet through NAT for bootstrap/API calls, and TCP `5432` to `rds-sg`
4. Create `rds-sg` (VPC `my-vpc`):
   - Inbound: allow TCP 5432 from `app-sg` only
   - Outbound: leave default or restrict as required

## 8) Store DB credentials in AWS Secrets Manager
1. Open the Secrets Manager console → **Store a new secret**.
2. Select **Other type of secrets** (or Database credentials if you want rotation integration) and add key/value pairs: `username`, `password` (and optionally `dbname`, `port`).
3. Encryption: choose default KMS key or a customer-managed key for stricter control.
4. Name the secret `my/app/db` and add a description.
5. Optionally enable automatic rotation using a Lambda template (if enabled, choose rotation interval and accept the template changes).
6. Finish and note the Secret ARN.

## 9) Create RDS PostgreSQL (single-AZ for Academy labs)
1. Open the RDS console → **Databases** → **Create database**.
2. Choose **Standard Create**.
3. Engine options: select **PostgreSQL** and choose the version you require.
4. Templates: choose **Dev/Test** for labs unless you require production features.
5. Settings: DB instance identifier `mydb`, master username and either use a secret (if integrated) or enter the password (recommended: reference the Secrets Manager secret).
6. DB instance class: choose a small instance type allowed in AWS Academy (for example `db.t3.micro`).
7. Storage: configure storage (keep small for lab budgets) and enable autoscaling only if you understand cost implications.
8. Availability & durability: **DO NOT enable Multi-AZ** in AWS Academy sandbox labs — choose Single-AZ only.
9. Connectivity:
   - Virtual private cloud (VPC): select `my-vpc`.
   - Subnet group: select `my-db-subnetgroup`.
   - Public accessibility: **No**.
   - VPC security groups: select `rds-sg`.
10. Additional configuration: backup retention, maintenance window, deletion protection.
   IMPORTANT: **Disable Enhanced Monitoring** in Academy labs if the option is present.
11. Click **Create database** and wait for it to become available.

## 10) Create Target Group for the application
1. Open the EC2 console → under **Load Balancing** choose **Target Groups** → **Create target group**.
2. Choose target type **Instances**, protocol HTTP, port `80`, and VPC `my-vpc`.
3. Health checks: Protocol HTTP and path `/api/health`. Set success code matcher `200`.
4. Name the target group `my-app-tg` and create.

## 11) Create Application Load Balancer (ALB)
1. EC2 console → **Load Balancers** → **Create Load Balancer** → **Application Load Balancer**.
2. Name: `my-alb`, Scheme: **internet-facing**, IP address type: IPv4.
3. Listeners: add HTTP (80) and optionally HTTPS (443). For HTTPS you must have an ACM certificate.
4. Availability Zones: select `my-vpc` and add the public subnets for AZ A and AZ B.
5. Security groups: choose `alb-sg`.
6. Default action: forward to target group `my-app-tg` (or create listener first then attach TG).
7. Create the ALB.
8. If using HTTPS: request or import a certificate in AWS Certificate Manager (ACM) and attach it to the ALB listener.

## 12) Create IAM role for EC2 instances (least privilege)
1. Open the IAM console → **Roles** → **Create role**.
2. Choose **AWS service** → **EC2** as the trusted entity.
3. Attach required managed policies:
   - `AmazonSSMManagedInstanceCore` (for Session Manager access)
4. Add an inline or customer-managed policy that allows `secretsmanager:GetSecretValue` on the specific Secret ARN you created. Scope to the secret ARN only.
5. Name the role `EC2AppRole` and create.
6. In **Instance profile** this role will be available to attach from the EC2 Launch Template wizard.

## 13) Create Launch Template (for ASG)
1. EC2 console → **Launch Templates** → **Create launch template**.
2. Template name: `my-app-lt`.
3. AMI: choose the Linux/Windows AMI you selected.
4. Instance type: choose e.g. `t3.micro` or `t3.small`.
5. Key pair: select if you need SSH access (optional if using SSM only).
6. Network settings: assign no public IP (instances run in privateapp subnets). Attach security group `app-sg`.
7. IAM Instance Profile: select the instance role `EC2AppRole` created earlier.
8. Advanced details: paste `User data` bootstrap script that installs the app and reads DB credentials from Secrets Manager using the instance role.
   - If instances are in private app subnets, those subnets must route `0.0.0.0/0` to NAT Gateway. Without NAT, user data cannot install packages, clone GitHub, pull Docker images, or run npm builds.
9. Create the launch template.

## 14) Create Auto Scaling Group (ASG) and attach to Target Group
1. EC2 console → **Auto Scaling Groups** → **Create Auto Scaling group**.
2. Select **Create an Auto Scaling group from a launch template** and choose `my-app-lt`.
3. Name the ASG `my-app-asg`.
4. Choose VPC `my-vpc` and select the two PrivateApp subnets (AZ A and AZ B).
5. Attach the previously created target group `my-app-tg` so instances register with the ALB.
6. Set desired capacity, minimum and maximum sizes (e.g., min 2, desired 2, max 4).
7. Configure scaling policies if desired (target tracking by CPU or request count).
8. Create the ASG.

## 15) Verify and test
1. ALB → Target Groups → select `my-app-tg` → check **Targets** to confirm instances register and show healthy.
2. RDS → Databases → select `mydb` → note the endpoint.
3. Open an SSM Session Manager session to one of the app instances (IAM/SSM must be configured), and test DB connectivity with `psql` using the Secret's credentials.
4. Access the ALB DNS name in a browser to hit the app; confirm `/api/health` returns healthy through the ALB.
5. Test AZ failover scenarios carefully (stop instances in one AZ) and observe traffic shifting and DB Multi-AZ failover only in a controlled test.

## 16) Backups, monitoring and logging
- RDS automated backups: configure retention and preferred backup window in RDS console.
- Enable Enhanced monitoring and CloudWatch alarms for CPU, disk, connections, replica lag.
- Enable ALB access logs (ALB → Attributes → Access logs) to an S3 bucket with proper bucket policy.
- Push app logs to CloudWatch Logs (using CloudWatch agent or structured logging library).

## 17) Cleanup notes (reverse order)
1. Delete or scale down ASG and ensure instances are terminated.
2. Delete Launch Template.
3. Delete ALB and Target Group.
4. Delete Auto Scaling Group resources and target registrations.
5. Delete RDS (take final snapshot if needed) and DB subnet group.
6. Delete Secrets Manager secret (or rotate to blank) and IAM inline policies/roles.
7. Delete NAT Gateways (release Elastic IPs), Internet Gateway, route tables, subnets, and finally the VPC.

---

Security reminders
- Use Secrets Manager + KMS with a customer-managed key and restrict key policy to necessary principals.
- Use SSM Session Manager instead of SSH; do not open SSH to 0.0.0.0/0.
- Restrict IAM policies to specific ARNs and least-privilege actions.

Academy tip: prefer the provided `LabRole` / `LabInstanceProfile` and SSM Session Manager if IAM or Secrets Manager creation is blocked by the sandbox.

## 18) EC2 CLI commands & sample app checkout
The following are minimal AWS CLI/EC2 commands for launching a simple app instance and cloning sample frontend/backend repos. Replace placeholders.

1. Launch an EC2 instance in a private app subnet (uses existing key, security group, and instance profile):

```bash
aws ec2 run-instances \
   --image-id ami-0123456789abcdef0 \
   --count 1 \
   --instance-type t3.micro \
   --subnet-id <PRIVATEAPP_SUBNET_ID> \
   --security-group-ids <APP_SG_ID> \
   --iam-instance-profile Name=EC2AppInstanceProfile \
   --associate-public-ip-address false \
   --key-name my-keypair \
   --user-data file://user-data.sh
```

2. Example `user-data.sh` bootstrap (install git, clone sample repos and start app):

```bash
#!/bin/bash
yum update -y
yum install -y git
cd /home/ec2-user
git clone https://github.com/example/sample-frontend.git frontend
git clone https://github.com/example/sample-backend.git backend
# bootstrap backend (example)
cd backend
# install deps and run (adjust for your runtime)
./start.sh &

# bootstrap frontend
cd ../frontend
./start.sh &
```

3. To fetch DB credentials from Secrets Manager in your app code (example, Python boto3):

```python
import boto3, json
sm = boto3.client('secretsmanager')
sec = sm.get_secret_value(SecretId='my/app/db')
creds = json.loads(sec['SecretString'])
user = creds['username']
pw = creds['password']
```

## 19) Serverless: GUI steps (AWS Console)
Use these GUI steps to deploy serverless functions (Lambda) and expose them with API Gateway.

1. Open the AWS Console → Lambda → Create function.
    - Choose **Author from scratch**.
    - Name: `my-func`.
    - Runtime: choose (e.g., Python 3.11, Node.js 18).
    - Permissions: create new role from template or attach existing role that allows `secretsmanager:GetSecretValue`, VPC access (if needed), and CloudWatch Logs.

2. Configure VPC access (if Lambda needs RDS):
    - In Function configuration, under **Network**, choose VPC `my-vpc` and the **PrivateApp** subnets, and security group `app-sg` (or a dedicated lambda-sg that can reach RDS via `rds-sg`).

3. Add environment variables referencing Secrets Manager ARN or secret name; prefer retrieving secret at runtime with SDK.

4. Create an API in API Gateway (HTTP API or REST API):
    - API Gateway → Create API → HTTP API (simpler) or REST API.
    - Add an integration: choose Lambda function and select `my-func`.
    - Configure routes (e.g., POST /items) and deploy.

5. Test from the API Gateway Console or curl against the API endpoint.

## 20) Serverless: CLI options (SAM / Serverless Framework)
If you prefer CLI automation, use AWS SAM or the Serverless Framework.

- AWS SAM (install `aws-sam-cli`):
   - Initialize: `sam init` and follow prompts (choose runtime, app template).
   - Build: `sam build`
   - Deploy: `sam deploy --guided` (provides interactive prompts to create an S3 bucket, stack name, and permissions).

- Serverless Framework (install `serverless`):
   - `npm install -g serverless`
   - Create service: `serverless create --template aws-nodejs --path my-service`
   - Add functions in `serverless.yml` and define IAM role statements for least-privilege.
   - Deploy: `serverless deploy`

CLI considerations:
- If Lambda needs DB access, place the function in the same VPC private subnets and attach a security group that allows outbound to RDS.
- Use environment variables for secret name/ARN and get the secret at runtime via SDK; attach IAM policy to Lambda role allowing `secretsmanager:GetSecretValue` for that secret ARN.
- For rotation-safe access, avoid baking credentials into environment variables.

## Serverless (DynamoDB-first) — Console-only deep walkthrough (start-to-finish)
Purpose: full GUI instructions for a purely serverless architecture using DynamoDB as the primary data store (no Aurora). Includes Academy-friendly alternatives and optional relational notes.

Assumptions and prerequisites
- You have access to the AWS Management Console and the Lambda, API Gateway, S3, SQS, SNS, and DynamoDB consoles.
- No VPC is required for this architecture (Lambda functions will run outside a VPC for lower cold-start overhead). Only add a VPC if you have specific private resource requirements.

High-level architecture (console flows)
- API Gateway (HTTP API) → Lambda (stateless) → DynamoDB (primary data store)
- S3 for static hosting and file storage; S3 events can trigger Lambda workers
- SQS for durable background jobs and retries
- SNS for notifications and fan-out
- Secrets Manager (or SSM Parameter Store) for any credentials or external API keys
- CloudFront for CDN in front of S3 (optional)
- CloudWatch and X-Ray for logging, monitoring and tracing

Detailed console steps

1) S3 for static assets
 - S3 → Create bucket → Name `my-app-static` → enable static website hosting if needed → configure CORS and lifecycle rules.

2) DynamoDB tables (Console)
 - DynamoDB → Create table → Name `my-app-table` → choose partition key (e.g., `id`) and optional sort key → Capacity mode: On-demand recommended for labs.
 - Enable DynamoDB Streams if you want Lambda workers to react to table changes.

3) Secrets (Console) — optional for external services
 - Secrets Manager → Store a new secret → API keys or external credentials. If blocked, use SSM Parameter Store `SecureString`.

4) Create Lambda functions (API handlers) — Console
 - Lambda → Create function → Author from scratch → Runtime Node.js/Python.
 - Permissions: choose **Create a new role from AWS policy templates** (basic) to avoid manual IAM creation; later attach a policy granting `dynamodb:*` on the specific table.
 - Environment: set `TABLE_NAME` and any secret/parameter names.
 - Code: upload a zip or use the inline editor for small handlers. For dependencies, create a Lambda Layer or upload a deployment package.

5) API Gateway (Console)
 - API Gateway → Create API → HTTP API → Add integration → Lambda → choose your function → define routes (GET/POST/PUT) and deploy.

6) SQS for background processing
 - SQS → Create queue → Standard (or FIFO when ordering needed) → configure visibility timeout and dead-letter queue (DLQ).
 - Lambda → Add trigger: select the SQS queue to invoke a worker Lambda for background jobs.

7) SNS for notifications
 - SNS → Create topic → Name `my-app-notifications` → Create subscriptions (email, SMS, Lambda) as required.

8) S3 event-driven workers
 - In the S3 bucket properties, add Event notifications for object create → target Lambda or SQS for asynchronous processing.

9) CloudFront and caching (optional)
 - CloudFront → Create distribution → Origin: S3 bucket or API endpoint → configure caching, behaviors, and optionally WAF for protection.

10) Monitoring & tracing
 - CloudWatch → ensure Lambda functions write logs and set retention.
 - X-Ray → enable active tracing on Lambda functions (Configuration → Monitoring tools → Active tracing).
 - CloudWatch Alarms: create alarms for Lambda errors, duration, and SQS queue depth.

11) Testing and validation
 - Test API endpoints via API Gateway console or `curl`.
 - Verify DynamoDB reads/writes from Lambda (CloudWatch logs).
 - Test S3 uploads trigger the worker and SQS processing and DLQ behavior.

12) Cost and cleanup
 - DynamoDB on-demand and Lambda are cost-effective for serverless labs; watch for high request volumes.
 - Clean up in reverse order: API Gateway → Lambda → SQS → SNS → DynamoDB → S3 → CloudFront.

Optional relational note (if you later require SQL):
- If you later need relational features, you can provision Aurora Serverless v2 or RDS; that requires VPC configuration and may need Secrets Manager/SSM for credentials. Keep relational components separate from the pure serverless DynamoDB path.

---

I will not use SAM or CLI in these steps — this section is strictly GUI Console actions. Would you like me to now:
- A) Produce a single consolidated `step-by-step` checklist you can follow in the AWS Console, or
- B) Add GUI screenshots and exact Console menu screenshots (I can describe where to capture them) to the `docs/INFRA_MANUAL_AWS_CONSOLE.md` for inclusion in your submission? 

## 21) AWS Academy restrictions & recommended adjustments
Note: AWS Academy (educational sandbox) often restricts creating account-wide credentials, IAM policies/roles, and some managed services (Secrets Manager, KMS, service-linked roles). Before attempting any step below, check the Academy lab guidance and your lab permissions. If a step is blocked, follow the suggested alternatives.

- Common restrictions and quick workarounds:
  - Cannot create IAM roles or policies: Use the console flow that auto-creates an execution role for Lambda/EC2 where allowed, or request instructor to provision a role. Avoid manual role creation steps in the guide if blocked.
  - Cannot create Secrets Manager secrets or KMS keys: Use SSM Parameter Store (SecureString) if allowed, or store test credentials in the Lambda/EC2 environment only for lab purposes (not for production). Ask instructor for a safe secret injection method.
  - No external network egress or limited services: use DynamoDB or other fully-managed AWS services that don’t require VPC configuration.

- Recommended for AWS Academy labs:
  - Prefer DynamoDB for serverless data storage — it avoids VPC/Lambda ENI cold-start complexity and often works without additional privileges.
  - If you need relational features, prefer Aurora Serverless v2 **only if** your lab permits creating RDS/Aurora and Secrets Manager; otherwise use a small RDS instance if provided by the lab.
  - Use the console's default auto-created roles and limit manual IAM steps. If an instructor-provided role exists, use that role.

## 22) Serverless architecture choices — full overview
Below are two complete serverless architectures with GUI-friendly steps and notes about Academy constraints.

Option A — Aurora Serverless v2 (Postgres) (SQL, transactions)
- Architecture: API Gateway → Lambda (in VPC) → Aurora Serverless v2 (Private DB Subnet) [+ optional RDS Proxy]
- Pros: full SQL support, familiar tooling, transactional operations.
- Cons: Lambda in VPC requires ENIs (cold-start), needs Secrets Manager/RDS Proxy for safe credential handling, and requires DB subnet group and VPC resources. Possibly blocked in restricted accounts.

GUI Steps (high level, console):
1. Ensure VPC and Private DB subnets exist (see earlier VPC steps).
2. RDS Console → Create database → choose **Amazon Aurora** → engine compatible with PostgreSQL → choose Serverless v2 capacity settings.
   - Ensure **Subnet group** uses the privatedb subnets and **Public accessibility** is No.
3. Configure database credentials: if Secrets Manager is available, enable and store credentials there. If not, note the username/password for lab use (store securely outside account).
4. Create a Lambda function:
   - In Console → Lambda → Create function → Author from scratch.
   - Runtime: Node/Python.
   - In **Network** configure VPC: select `my-vpc` and the **PrivateApp** subnets and a security group that allows outbound to RDS.
   - Use the console's role creation to avoid needing to create IAM roles manually.
5. In Lambda code, fetch DB credentials from Secrets Manager (preferred) or from an environment variable (lab-only). Use a connection pool and prefer RDS Proxy if available.
6. Create API Gateway and integrate with Lambda.

Important Academy notes for Aurora option:
- If Secrets Manager or IAM role creation is blocked, request instructor support or use DynamoDB option instead.
- RDS Proxy helps reduce DB connection count and cold-start issues, but it requires additional resources and permissions.

Option B — Fully serverless with DynamoDB (recommended for Academy labs)
- Architecture: API Gateway → Lambda (no VPC required) → DynamoDB
- Pros: no VPC, no ENI cold-starts, simple scaling, lower permission needs, easy to test in restricted accounts.
- Cons: different data model (NoSQL), eventual consistency unless you choose strongly consistent reads; transactions available via TransactWrite when needed.

GUI Steps (console, Academy-friendly):
1. Create DynamoDB table:
   - AWS Console → DynamoDB → Create table.
   - Table name: `my-app-table`.
   - Primary key: choose suitable partition key (e.g., `id`).
   - Configure capacity mode: On-demand (recommended for lab) or provisioned.
2. Create Lambda function:
   - Lambda → Create function → Author from scratch.
   - Runtime: Node.js or Python.
   - Execution role: let the console create a role with basic Lambda permissions (this avoids manual IAM creation). After creation, attach a managed policy or inline policy granting `dynamodb:PutItem/GetItem/Query` on the specific table (console can add basic DynamoDB permissions during creation in many accounts).
3. In Lambda code use AWS SDK (boto3/aws-sdk) to call DynamoDB. Store the table name in an environment variable.
4. Create API Gateway and integrate with Lambda. Deploy and test.

Example minimal Lambda (Node.js) using DynamoDB:
```javascript
const AWS = require('aws-sdk');
const db = new AWS.DynamoDB.DocumentClient();
const TABLE = process.env.TABLE_NAME;
exports.handler = async (evt) => {
  const id = Date.now().toString();
  await db.put({ TableName: TABLE, Item: { id, body: evt.body } }).promise();
  return { statusCode: 200, body: JSON.stringify({ id }) };
};
```

Academy-friendly recommendations
- Use DynamoDB for serverless labs unless your instructor explicitly enables RDS/Aurora/Secrets Manager.
- Use the console flows that auto-create minimal execution roles for Lambda/EC2 rather than creating IAM roles yourself.
- If you must use relational DBs but cannot store secrets in Secrets Manager, coordinate with your instructor to provision credentials or use temporary lab secrets.

## Final: Complete Serverless Architecture (Console-only)
This is the final, consolidated serverless design you requested. It uses API Gateway, S3, Lambda (and Lambda workers), Aurora Serverless v2 (Postgres), SQS, SNS, Secrets Manager, and supporting services — all deployable via the AWS Console. Follow the steps below from top-to-bottom in the Console to implement.

Architecture summary (primary components)
- API Gateway (HTTP API) — public ingress, routes to Lambda (sync API handlers).
- S3 — static frontend hosting (website hosting) and durable object storage for uploads.
- Lambda (stateless) — handles API requests, short-lived compute.
- Lambda Workers (async) — background processing triggered by SQS or S3 events.
- SQS — durable queue for decoupling and reliable background jobs.
- SNS — fan-out notifications to email/SMS/Lambda subscriptions.
- Aurora Serverless v2 (Postgres) — managed relational DB for transactional workloads.
- RDS Proxy — optional connection pooling for serverless DB connections.
- Secrets Manager (preferred) or SSM Parameter Store (fallback) — secure credential storage.
- CloudFront — CDN in front of S3 and API (optional for global performance).
- CloudWatch, X-Ray — monitoring, tracing, and logs.
- IAM — use console-created roles; limit permissions to specific resources (least privilege).
- VPC, subnets, NAT, endpoints — only required when Lambda needs private DB access (Aurora + RDS Proxy). For DynamoDB option, VPC is not required.

High-level Console sequence (recommended order)
1. Create or reuse a VPC only if DB (Aurora) requires it; otherwise skip VPC steps for pure serverless (DynamoDB alternative avoids VPC).
2. Create Secrets (Secrets Manager) or SSM parameter for DB credentials.
3. Create Aurora Serverless v2 cluster (RDS Console) and DB subnet group (if VPC used).
4. (Optional) Create RDS Proxy and attach the secret.
5. Create S3 bucket for frontend and file uploads; enable static website hosting if required; configure CORS and lifecycle rules.
6. Create API Gateway (HTTP API) and routes for your REST endpoints.
7. Create Lambda functions (API handlers): set VPC config if accessing Aurora; attach execution role (console-created) and add SecretsManager/SSM permissions via console when allowed.
8. Create SQS queues for background work and subscribe Lambda worker functions to the queue (Lambda trigger) or configure S3 event notifications to SQS/Lambda.
9. Create SNS topics for notifications; subscribe endpoints (email/SMS/Lambda) as needed.
10. Configure CloudFront distribution for S3 + API caching (optional) and WAF protection (optional).
11. Enable monitoring and tracing: CloudWatch Alarms, X-Ray tracing for Lambdas, and RDS Performance Insights.

Console GUI details for each component

- S3 (Console)
   - S3 → Create bucket → Name `my-app-static` → Region → Uncheck public blocking if you host static website and configure bucket policy + CloudFront.
   - Properties → Static website hosting (optional) and CORS configuration for uploads.

- Secrets Manager (Console)
   - Secrets Manager → Store a new secret → choose Other type or Credentials for RDS → enter username/password JSON → Name `my/app/db` → Finish.
   - Note: if Secrets Manager blocked, use Systems Manager → Parameter Store → Create parameter → Type SecureString with JSON value.

- Aurora Serverless v2 (Console)
   - RDS → Databases → Create database → Amazon Aurora (PostgreSQL) → Capacity type: Serverless v2 → choose DB subnet group and VPC → Use Secrets Manager for credentials if available.

- RDS Proxy (Console)
   - RDS → Proxies → Create proxy → target the Aurora cluster → supply secret and create or use console-created IAM role.

- API Gateway (Console)
   - API Gateway → Create API → HTTP API → Add integration: Lambda → choose your function → Add routes and deploy.

- Lambda (Console)
   - Lambda → Create function → Author from scratch → Runtime (Node/Python) → Permissions: create new role from policy templates (basic) → After creation, attach SecretsManager/SSM read permissions via the IAM console when allowed.
   - Configuration → VPC: only set if function must access Aurora; choose `privateapp` subnets and `lambda-sg`.
   - Add triggers: API Gateway for sync, SQS or S3 events for workers.

- SQS (Console)
   - SQS → Create queue → Standard queue (or FIFO if ordering required) → configure visibility timeout and DLQ (dead-letter queue) for failed jobs.
   - Lambda → add SQS trigger (or SQS subscribe Lambda as event source mapping)

- SNS (Console)
   - SNS → Create topic → Name `my-app-notifications` → Create subscriptions for email/SMS/Lambda as needed.

- CloudFront + WAF (Console, optional)
   - CloudFront → Create distribution → Origin: S3 bucket or ALB/API Gateway (via custom origin) → Add caching rules and behaviors.
   - WAF → Create web ACL → attach to CloudFront distribution to protect against OWASP categories.

- Monitoring & tracing (Console)
   - CloudWatch → Logs: ensure Lambdas log to CloudWatch; set retention and subscriptions if needed.
   - X-Ray → Enable active tracing on Lambda functions (Configuration → Monitoring tools → Active tracing).
   - CloudWatch Alarms: create alarms for Lambda errors, throttles, RDS CPU, DB connections, and SQS queue length.

Edge cases and Academy restrictions
- If Academy disallows Secrets Manager, RDS Proxy, or IAM role updates: use SSM Parameter Store and console-created roles; ask your instructor to attach Secrets access or provide DB credentials.
- If you cannot create Aurora, use DynamoDB for the data layer and avoid VPC/Lambda ENI complexity.
- If NAT Gateways are disallowed or cost-prohibitive in lab, route Lambda to RDS via private subnets and VPC endpoints where possible; coordinate with instructor.

Final checklist (Console actions to complete)
1. Create S3 bucket for static assets and file uploads.
2. Store DB credentials: Secrets Manager (preferred) or SSM Parameter Store.
3. Create Aurora Serverless v2 cluster and DB subnet group (or use DynamoDB instead).
4. (Optional) Create RDS Proxy and attach the secret.
5. Create API Gateway (HTTP API) and define API routes.
6. Create Lambda functions (API handlers) and Lambda workers; attach triggers (API Gateway, SQS, S3).
7. Create SQS queues and DLQs; connect Lambda workers.
8. Create SNS topics and subscriptions.
9. Configure CloudFront distribution (optional) and WAF (optional).
10. Configure monitoring: CloudWatch Alarms, X-Ray tracing, and RDS Performance Insights.
11. Test end-to-end: upload to S3, invoke API, queue a job, process via worker, and verify DB writes.

This completes the final console-only serverless architecture specification. If you want, I will now:
- produce a single printable checklist (one-page) for submission, or
- add short example Lambda code snippets for API handler and SQS worker (console-ready zip instructions).

## 23) Combined architecture: DynamoDB + Aurora Serverless v2
Use both DynamoDB and Aurora in a hybrid design where appropriate: DynamoDB for high-scale, low-latency, schema-flexible data and Aurora Serverless v2 for relational, transactional workloads. This section explains when to use each, how to wire them together, and console steps.

When to use which
- Use DynamoDB for: session store, caching, user preferences, event logs, high-scale key-value access, and queues (with DynamoDB Streams).
- Use Aurora Serverless v2 for: transactional data, complex joins, reporting, legacy schemas, and ACID requirements.
- Hybrid patterns:
  - Write-through cache: API writes to Aurora for canonical data and to DynamoDB for fast-read cache or denormalized views.
  - Event-driven: changes in Aurora (via application or CDC) push events to SNS/SQS which trigger Lambda to update DynamoDB materialized views.
  - Analytics: export DynamoDB/Aurora data to S3 (via Data Pipeline or DMS) for analytics.

Console wiring steps (high-level)
1. Create DynamoDB table(s) via Console: choose partition/sort key, enable Streams if using CDC for materialized views.
2. Create Aurora Serverless v2 cluster as documented earlier.
3. Create Lambda functions:
   - API handlers: read/write to DynamoDB for fast ops; for transactional writes call Aurora via RDS Proxy or direct connection (depending on latency/ACU cost).
   - Worker Lambdas: subscribe to SQS or DynamoDB Streams to reconcile writes between systems (e.g., eventually consistent denormalized views in DynamoDB).
4. Create SNS/SQS topics/queues for eventing between Aurora and Lambda workers.
5. Optionally use AWS DMS (Database Migration Service) for CDC between Aurora and an S3 landing zone, or use AWS SCT (Schema Conversion Tool) + DMS for migrations (see migration guidance below).

Example pattern — write path (Console sequence)
- API Gateway → Lambda (write handler) → put item to DynamoDB (fast) AND publish message to SNS → SNS delivers to SQS → Lambda worker consumes SQS and writes canonical record to Aurora (RDS Proxy recommended).

Example pattern — read path
- API Gateway → Lambda (read handler) → try read from DynamoDB (denormalized view) → if cache miss, query Aurora and optionally update DynamoDB view.

Operational notes
- Monitor eventual consistency windows, failure retries, and idempotency in workers.
- Use DynamoDB Streams + Lambda for near-real-time replication from DynamoDB to other systems.
- Set appropriate TTLs and lifecycle policies on DynamoDB items if used as cache.

## 24) AWS SCT (Schema Conversion Tool) and migration guidance
If you plan to migrate an existing relational schema to Aurora (or to restructure for hybrid usage), AWS provides two main tools:
- AWS SCT (Schema Conversion Tool): converts database schema (DDL), stored procedures, and generates assessment reports about incompatible features.
- AWS DMS (Database Migration Service): performs continuous data replication (CDC) from source to target.

SCT usage (desktop GUI)
1. Download and install AWS SCT from the AWS Database Migration Service console link (available for Windows, macOS, Linux).
2. Launch SCT on your machine.
3. Create a new project and add source and target endpoints:
   - Source: connection details for your existing database (MySQL/Postgres/Oracle/SQL Server etc.). Ensure network access from your workstation to the DB.
   - Target: Aurora Serverless v2 endpoint (or Aurora cluster endpoint) or an intermediate RDS instance used as migration target.
4. Run the **Assessment Report** to identify objects that cannot be automatically converted and review recommended manual changes.
5. Use SCT to convert schema and export the generated DDL scripts.
6. Apply converted DDL to the Aurora target via the RDS Query Editor or psql client connected to the Aurora endpoint.

DMS usage (Console)
1. Create source and target endpoints in the DMS console.
2. Create a replication instance (DMS) in the same VPC as your target (or with network access to both endpoints).
3. Create and start a replication task: choose Full load + CDC for minimal downtime migration.
4. Monitor replication tasks; once caught up, cut over application read/write traffic to the Aurora target.

Academy notes for SCT/DMS
- SCT is a desktop tool and requires network access to source and target DBs — may be blocked in some lab setups.
- DMS replication instances incur costs and may require permissions to create; check Academy limits and request instructor assistance if needed.

This completes the combined DynamoDB + Aurora and migration guidance additions.
