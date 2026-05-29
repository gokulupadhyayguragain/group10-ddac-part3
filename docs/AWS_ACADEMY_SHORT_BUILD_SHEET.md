# AWS Academy Short Build Sheet

Use `us-east-1`.

## Phase A: Task 1 Server App

Final serverful path:

```text
Internet
-> ALB listener 80/443
-> Target group HTTP port 80
-> EC2 Docker host port 80
-> frontend container port 3000
-> backend container port 5000
-> RDS PostgreSQL port 5432
```

No Nginx is required for this path. The Next.js container serves the website and proxies `/api/*` to the backend container. The ALB talks to the EC2 instance on port `80`; Docker publishes that host port to the frontend container.

Before the ALB can work, the EC2 instance itself must pass:

```bash
curl -i http://localhost
curl -i http://localhost/api/health
curl -i http://localhost:5000/api/health
```

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

NAT is required if EC2 runs in private app subnets and user-data installs/builds the app. The instance must reach apt repositories, GitHub, Docker Hub, npm, AWS Secrets Manager, and external email/OAuth APIs.

If AWS Academy budget is tight, use one NAT Gateway in `public-a` and point both `privateapp` route tables to it. For HA, use `nat-a` and `nat-b`.

### 3. Security Groups

```text
alb-sg
inbound:
  HTTP 80 from 0.0.0.0/0
  HTTPS 443 from 0.0.0.0/0 optional
outbound:
  TCP 80 to app-sg

app-sg
inbound:
  TCP 80 from alb-sg
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
  "DATABASE_URL": "postgresql://postgres:<url-encoded-rds-password>@mydb.cmzbysmie18b.us-east-1.rds.amazonaws.com:5432/safetrace?sslmode=require",
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
DATABASE_URL            RDS endpoint + DB username/password; URL-encode password symbols
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
FRONTEND_PORT=80
BACKEND_PORT=5000
```

Do not store real `DATABASE_URL`, `JWT_SECRET`, Google keys, or Resend keys in `.env`; those stay in Secrets Manager.

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
port: 80
VPC: my-vpc
health check path: /api/health
matcher: 200
```

If your existing target group shows `HTTP:3000`, create a new target group on port `80` and attach it to the ALB listener and ASG. Do not mix the old `3000` target group with this `FRONTEND_PORT=80` deployment.

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
AMI: Ubuntu Server 22.04 or 24.04 LTS
instance type: t3.micro
network: do not auto-assign public IP
security group: app-sg
IAM instance profile: LabInstanceProfile or my-app-ec2-role
user data: below
```

User data runs only on first boot. If you edit the launch template user data later, start an ASG instance refresh or terminate the old instances so new ones launch with the new script.

Minimal user data, recommended:

```bash
#!/bin/bash
curl -fsSL https://raw.githubusercontent.com/gokulupadhyayguragain/group10-ddac-part3/main/aws-user-data.sh | bash
```

This works only if the GitHub repository is public and the private app subnet has NAT access to GitHub. The full script that runs is `aws-user-data.sh` in the repo.

Full user data, same content as `aws-user-data.sh`:

```bash
#!/bin/bash
set -euo pipefail

exec > >(tee -a /var/log/user-data.log) 2>&1

REPO_DIR="/home/ubuntu/safetrace"

on_error() {
    echo "ERROR: SafeTrace provisioning failed at line ${1}."
    if [ -d "$REPO_DIR" ]; then
        cd "$REPO_DIR" || true
        docker compose ps || true
        docker compose logs --tail=120 || true
    fi
}

trap 'on_error $LINENO' ERR

echo "=========================================="
echo "Starting SafeTrace Provisioning..."
echo "=========================================="

if [ ! -f /swapfile ]; then
    echo "Creating 2GB swapfile..."
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=128M count=16
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git docker.io curl ca-certificates
systemctl enable --now docker
docker --version

DOCKER_CONFIG=/usr/local/lib/docker/cli-plugins
mkdir -p "$DOCKER_CONFIG"
curl -fSL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o "$DOCKER_CONFIG/docker-compose"
chmod +x "$DOCKER_CONFIG/docker-compose"
ln -sf "$DOCKER_CONFIG/docker-compose" /usr/bin/docker-compose
docker compose version

usermod -aG docker ubuntu

if [ -d "$REPO_DIR/.git" ]; then
    cd "$REPO_DIR"
    git fetch origin main
    git reset --hard origin/main
else
    rm -rf "$REPO_DIR"
    git clone --depth 1 https://github.com/gokulupadhyayguragain/group10-ddac-part3.git "$REPO_DIR"
fi
chown -R ubuntu:ubuntu "$REPO_DIR"

cat > "$REPO_DIR/.env" <<'EOF'
AWS_REGION=us-east-1
SAFETRACE_SECRET_ID=safetrace/prod/app
FRONTEND_PORT=80
BACKEND_PORT=5000
EOF
chown ubuntu:ubuntu "$REPO_DIR/.env"
chmod 600 "$REPO_DIR/.env"

cd "$REPO_DIR"
docker compose config
docker compose up --build -d
docker compose ps

ready=0
for i in {1..60}; do
  if curl -fsS http://localhost:5000/api/health >/dev/null && curl -fsS http://localhost/api/health >/dev/null; then
    curl -fsS -X POST http://localhost:5000/api/admin/seed || true
    ready=1
    break
  fi
  sleep 5
done

if [ "$ready" -ne 1 ]; then
  docker compose ps || true
  docker compose logs --tail=200 backend || true
  docker compose logs --tail=200 frontend || true
  exit 1
fi
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

### 11. If It Does Not Open

Run these on the EC2 instance through SSM or SSH:

```bash
sudo tail -n 200 /var/log/cloud-init-output.log
sudo tail -n 200 /var/log/user-data.log
cd /home/ubuntu/safetrace
sudo docker compose ps
sudo docker compose logs --tail=100 backend
sudo docker compose logs --tail=100 frontend
curl -i http://localhost
curl -i http://localhost/api/health
curl -i http://localhost:5000/api/health
```

Check these AWS settings:

```text
Target group:
  targets must be healthy
  port must be 80
  health path must be /api/health
  success matcher must be 200

app-sg:
  inbound TCP 80 only from alb-sg

rds-sg:
  inbound TCP 5432 only from app-sg

privateapp route tables:
  0.0.0.0/0 must route to NAT Gateway

EC2 IAM instance profile:
  must allow secretsmanager:GetSecretValue for safetrace/prod/app

Secrets Manager:
  DATABASE_URL must use the real RDS endpoint and ?sslmode=require
```

If the EC2 instance has no `/home/ubuntu/safetrace` folder, user data failed before Git clone. Check NAT route, outbound HTTPS, and `/var/log/cloud-init-output.log`.

Most common failures:

```text
ALB target unhealthy:
  target group port/path is wrong, or Docker did not publish host port 80

user-data stops before Docker:
  NAT route is missing or apt/GitHub/Docker Hub/npm cannot be reached

backend container restarts:
  DATABASE_URL, Secrets Manager IAM, or RDS security group is wrong

frontend opens but login/register fails:
  backend container is unhealthy or BACKEND_URL cannot reach http://backend:5000
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
