# AWS Academy Short Build Sheet

Use `us-east-1`.

## Phase A: Task 1 Server App

### 1. VPC

```text
my-vpc
10.0.0.0/16

public-a       us-east-1a   10.0.0.0/24
public-b       us-east-1b   10.0.1.0/24
privateapp-a   us-east-1a   10.0.10.0/24
privateapp-b   us-east-1b   10.0.11.0/24
privatedb-a    us-east-1a   10.0.20.0/24
privatedb-b    us-east-1b   10.0.21.0/24
```

Enable DNS hostnames on `my-vpc`.

### 2. Gateways And Routes

```text
my-vpc-igw
attach to my-vpc

public-rt
0.0.0.0/0 -> my-vpc-igw
associate public-a, public-b

nat-a
public-a
Elastic IP

nat-b
public-b
Elastic IP

app-rt-a
0.0.0.0/0 -> nat-a
associate privateapp-a

app-rt-b
0.0.0.0/0 -> nat-b
associate privateapp-b

db-rt
no internet route
associate privatedb-a, privatedb-b
```

If AWS Academy budget is tight, use one NAT only. For HA, use `nat-a` and `nat-b`.

### 3. Security Groups

```text
alb-sg
inbound:
  HTTP 80 from 0.0.0.0/0
  HTTPS 443 from 0.0.0.0/0 optional
outbound:
  TCP 3000 to app-sg

app-sg
inbound:
  TCP 3000 from alb-sg
outbound:
  TCP 443 to 0.0.0.0/0
  TCP 5432 to rds-sg

rds-sg
inbound:
  TCP 5432 from app-sg
outbound:
  default
```

Do not open PostgreSQL to `0.0.0.0/0`.

### 4. Secrets Manager

```text
secret name:
safetrace/prod/app
```

Task 1 JSON:

```json
{
  "DATABASE_URL": "postgresql://postgres:<rds-password>@<rds-endpoint>:5432/safetrace",
  "JWT_SECRET": "<openssl rand -base64 48>",
  "AWS_REGION": "us-east-1",
  "FRONTEND_PUBLIC_URL": "http://<alb-dns-name>",
  "RESEND_API_KEY": "re_xxxxxxxxxxxxxxxxx",
  "RESEND_FROM_EMAIL": "verify@<your-verified-domain>",
  "AUTH_VERIFICATION_TTL_MINUTES": "10",
  "TRUST_PROXY": "true"
}
```

Where values come from:

```text
DATABASE_URL            RDS endpoint + DB username/password
JWT_SECRET              openssl rand -base64 48
FRONTEND_PUBLIC_URL     ALB DNS name, later HTTPS domain
RESEND_API_KEY          Resend dashboard -> API Keys
RESEND_FROM_EMAIL       Resend verified sender/domain
TRUST_PROXY             true because ALB is in front of EC2
```

EC2 `.env` only:

```env
AWS_REGION=us-east-1
SAFETRACE_SECRET_ID=safetrace/prod/app
```

### 5. RDS PostgreSQL

```text
DB subnet group:
my-db-subnetgroup
subnets:
privatedb-a
privatedb-b

DB engine:
PostgreSQL 15 or 16

DB identifier:
mydb

Initial database name:
safetrace

Master username:
postgres

Master password:
generate strong password, store only in Secrets Manager

Public access:
No

Security group:
rds-sg

Multi-AZ:
No for AWS Academy sandbox
Yes only if your AWS lab/account allows it
```

### 6. IAM Least Privilege

Use AWS Academy `LabRole` / `LabInstanceProfile` if IAM creation is restricted.

If custom role is allowed:

```text
role:
my-app-ec2-role

trusted service:
EC2

managed policy:
AmazonSSMManagedInstanceCore

inline policy:
SecretsManager read for safetrace/prod/app only
```

Policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:us-east-1:<account-id>:secret:safetrace/prod/app-*"
    }
  ]
}
```

### 7. Target Group

```text
my-app-tg
target type: Instances
protocol: HTTP
port: 3000
VPC: my-vpc
health check path: /api/health
matcher: 200
```

### 8. ALB

```text
my-alb
scheme: internet-facing
subnets: public-a, public-b
security group: alb-sg
listener HTTP 80 -> forward to my-app-tg
listener HTTPS 443 -> optional ACM certificate -> forward to my-app-tg
```

### 9. Launch Template

```text
my-app-lt
AMI: Amazon Linux 2023
instance type: t3.micro
network: do not auto-assign public IP
security group: app-sg
IAM instance profile: LabInstanceProfile or my-app-ec2-role
user data: below
```

User data:

```bash
#!/bin/bash
set -e
yum update -y
yum install -y git docker
systemctl enable --now docker

DOCKER_CONFIG=/usr/local/lib/docker/cli-plugins
mkdir -p "$DOCKER_CONFIG"
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o "$DOCKER_CONFIG/docker-compose"
chmod +x "$DOCKER_CONFIG/docker-compose"
ln -sf "$DOCKER_CONFIG/docker-compose" /usr/bin/docker-compose

usermod -aG docker ec2-user

cd /home/ec2-user
git clone https://github.com/gokulupadhyayguragain/group10-ddac-part3.git safetrace || true
cd safetrace
git pull || true

cat > .env <<'EOF'
AWS_REGION=us-east-1
SAFETRACE_SECRET_ID=safetrace/prod/app
EOF

docker compose up --build -d

for i in {1..30}; do
  if curl -fsS http://localhost:5000/api/health >/dev/null; then
    curl -fsS -X POST http://localhost:5000/api/admin/seed || true
    exit 0
  fi
  sleep 5
done
```

### 10. Auto Scaling Group

```text
my-app-asg
launch template: my-app-lt
VPC: my-vpc
subnets: privateapp-a, privateapp-b
target group: my-app-tg
min: 2
desired: 2
max: 4
health checks: ELB
```

Open:

```text
http://<my-alb-dns-name>
```

Verify:

```text
/api/health
/login
/register
/admin
```

## Phase B: Task 2 Serverless Extension

Add these only after Phase A works.

### 1. S3 Photo Bucket

```text
bucket:
group10-alzheimer-photos-<account-id>

public access:
Block all public access ON

purpose:
patient and sighting images
```

Do not use public-read bucket policy for patient/sighting photos.

### 2. SQS

```text
queue:
my-app-queue

type:
Standard

visibility timeout:
30 seconds
```

### 3. SNS

```text
topic:
my-app-topic

subscriptions:
email or SMS
```

Confirm email subscriptions before the demo.

### 4. Lambda: API Ingest

```text
function:
my-api-function

real code folder:
lambdas/sighting-ingest

runtime:
Node.js 20.x

environment:
AWS_REGION=us-east-1
SQS_QUEUE_URL=<my-app-queue-url>
SIGHTING_EVENT_API_KEY=<optional-shared-key>

IAM:
sqs:SendMessage to my-app-queue
CloudWatch Logs
```

API Gateway:

```text
HTTP API
route: POST /sighting-events
integration: my-api-function
CORS: allow ALB/domain origin
```

### 5. Lambda: Worker

```text
function:
my-worker-function

real code folder:
lambdas/alert-dispatcher

runtime:
Node.js 20.x

trigger:
my-app-queue

environment:
AWS_REGION=us-east-1
SNS_TOPIC_ARN=<my-app-topic-arn>

IAM:
sqs:ReceiveMessage
sqs:DeleteMessage
sqs:GetQueueAttributes
sns:Publish to my-app-topic
CloudWatch Logs
```

### 6. Add Task 2 Values To Same Secret

Update `safetrace/prod/app`:

```json
{
  "S3_BUCKET": "group10-alzheimer-photos-<account-id>",
  "S3_PUBLIC_BASE_URL": "",
  "SIGHTING_EVENT_API_URL": "https://<api-id>.execute-api.us-east-1.amazonaws.com/sighting-events",
  "SIGHTING_EVENT_API_KEY": "<openssl rand -hex 24>",
  "SQS_QUEUE_URL": "https://sqs.us-east-1.amazonaws.com/<account-id>/my-app-queue",
  "SNS_TOPIC_ARN": "arn:aws:sns:us-east-1:<account-id>:my-app-topic"
}
```

Restart backend containers after updating the secret:

```bash
docker compose restart backend
```

## Do Not Create For This Project

```text
DynamoDB table:
not needed

public S3 frontend bucket:
not needed for current Next.js EC2/ALB architecture

public-read photo bucket:
do not use
```
