# CloudShell Version - SafeTrace AWS Academy Build

Use this when you want to build or repair the **Task 1 serverful deployment** from AWS CloudShell.

Region:

```bash
export AWS_REGION=us-east-1
aws configure set region "$AWS_REGION"
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

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

No Nginx is required. The Next.js frontend container serves the website and proxies `/api/*` to the backend container.

Before the ALB can work, the EC2 instance must pass:

```bash
curl -i http://localhost
curl -i http://localhost/api/health
curl -i http://localhost:5000/api/health
```

## 0. Existing 504 Quick Fix

Use this if you already created `my-alb`, `my-app-asg`, and a broken target group on port `3000`.

```bash
export VPC_ID=$(aws elbv2 describe-load-balancers \
  --names my-alb \
  --query 'LoadBalancers[0].VpcId' \
  --output text)

export ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names my-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)

export LISTENER_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN" \
  --query 'Listeners[?Port==`80`].ListenerArn | [0]' \
  --output text)

export TG80_ARN=$(aws elbv2 create-target-group \
  --name my-app-tg-80 \
  --protocol HTTP \
  --port 80 \
  --target-type instance \
  --vpc-id "$VPC_ID" \
  --health-check-protocol HTTP \
  --health-check-path /api/health \
  --matcher HttpCode=200 \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

aws elbv2 modify-listener \
  --listener-arn "$LISTENER_ARN" \
  --default-actions Type=forward,TargetGroupArn="$TG80_ARN"

aws autoscaling attach-load-balancer-target-groups \
  --auto-scaling-group-name my-app-asg \
  --target-group-arns "$TG80_ARN"

aws elbv2 describe-target-health --target-group-arn "$TG80_ARN"
```

Then launch fresh ASG instances if the old user-data did not publish host port `80`:

```bash
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name my-app-asg \
  --preferences MinHealthyPercentage=50,InstanceWarmup=600
```

## 1. Variables

Set these first. Edit the password and Resend values before running.

```bash
export PROJECT=safetrace
export VPC_NAME=my-vpc
export VPC_CIDR=10.0.0.0/16
export AZ_A=us-east-1a
export AZ_B=us-east-1b

export PUBLIC_A_CIDR=10.0.0.0/24
export PUBLIC_B_CIDR=10.0.1.0/24
export APP_A_CIDR=10.0.10.0/24
export APP_B_CIDR=10.0.11.0/24
export DB_A_CIDR=10.0.20.0/24
export DB_B_CIDR=10.0.21.0/24

export DB_NAME=safetrace
export DB_IDENTIFIER=mydb
export DB_USERNAME=postgres
read -rsp "RDS password: " DB_PASSWORD; echo
export DB_PASSWORD_ENC=$(python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["DB_PASSWORD"], safe=""))')

export SECRET_NAME=safetrace/prod/app
export JWT_SECRET=$(openssl rand -base64 48)
read -rp "Resend API key: " RESEND_API_KEY
read -rp "Resend from email: " RESEND_FROM_EMAIL
```

If Resend is not ready yet, put temporary placeholders and update the secret later.

## 2. VPC, Subnets, Routes

This creates one NAT Gateway to reduce AWS Academy cost. Both private app route tables use it.

```bash
export VPC_ID=$(aws ec2 create-vpc \
  --cidr-block "$VPC_CIDR" \
  --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=$VPC_NAME}]" \
  --query 'Vpc.VpcId' \
  --output text)

aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames '{"Value":true}'
aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-support '{"Value":true}'

export PUBLIC_A=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --availability-zone "$AZ_A" --cidr-block "$PUBLIC_A_CIDR" --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=public-a}]' --query 'Subnet.SubnetId' --output text)
export PUBLIC_B=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --availability-zone "$AZ_B" --cidr-block "$PUBLIC_B_CIDR" --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=public-b}]' --query 'Subnet.SubnetId' --output text)
export APP_A=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --availability-zone "$AZ_A" --cidr-block "$APP_A_CIDR" --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=privateapp-a}]' --query 'Subnet.SubnetId' --output text)
export APP_B=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --availability-zone "$AZ_B" --cidr-block "$APP_B_CIDR" --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=privateapp-b}]' --query 'Subnet.SubnetId' --output text)
export DB_A=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --availability-zone "$AZ_A" --cidr-block "$DB_A_CIDR" --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=privatedb-a}]' --query 'Subnet.SubnetId' --output text)
export DB_B=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --availability-zone "$AZ_B" --cidr-block "$DB_B_CIDR" --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=privatedb-b}]' --query 'Subnet.SubnetId' --output text)

aws ec2 modify-subnet-attribute --subnet-id "$PUBLIC_A" --map-public-ip-on-launch
aws ec2 modify-subnet-attribute --subnet-id "$PUBLIC_B" --map-public-ip-on-launch

export IGW_ID=$(aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=my-vpc-igw}]' \
  --query 'InternetGateway.InternetGatewayId' \
  --output text)

aws ec2 attach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID"

export PUBLIC_RT=$(aws ec2 create-route-table --vpc-id "$VPC_ID" --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=public-rt}]' --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id "$PUBLIC_RT" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID"
aws ec2 associate-route-table --route-table-id "$PUBLIC_RT" --subnet-id "$PUBLIC_A"
aws ec2 associate-route-table --route-table-id "$PUBLIC_RT" --subnet-id "$PUBLIC_B"

export EIP_ALLOC=$(aws ec2 allocate-address --domain vpc --query 'AllocationId' --output text)
export NAT_ID=$(aws ec2 create-nat-gateway \
  --subnet-id "$PUBLIC_A" \
  --allocation-id "$EIP_ALLOC" \
  --tag-specifications 'ResourceType=natgateway,Tags=[{Key=Name,Value=nat-a}]' \
  --query 'NatGateway.NatGatewayId' \
  --output text)

aws ec2 wait nat-gateway-available --nat-gateway-ids "$NAT_ID"

export APP_RT_A=$(aws ec2 create-route-table --vpc-id "$VPC_ID" --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=app-rt-a}]' --query 'RouteTable.RouteTableId' --output text)
export APP_RT_B=$(aws ec2 create-route-table --vpc-id "$VPC_ID" --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=app-rt-b}]' --query 'RouteTable.RouteTableId' --output text)
aws ec2 create-route --route-table-id "$APP_RT_A" --destination-cidr-block 0.0.0.0/0 --nat-gateway-id "$NAT_ID"
aws ec2 create-route --route-table-id "$APP_RT_B" --destination-cidr-block 0.0.0.0/0 --nat-gateway-id "$NAT_ID"
aws ec2 associate-route-table --route-table-id "$APP_RT_A" --subnet-id "$APP_A"
aws ec2 associate-route-table --route-table-id "$APP_RT_B" --subnet-id "$APP_B"

export DB_RT=$(aws ec2 create-route-table --vpc-id "$VPC_ID" --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=db-rt}]' --query 'RouteTable.RouteTableId' --output text)
aws ec2 associate-route-table --route-table-id "$DB_RT" --subnet-id "$DB_A"
aws ec2 associate-route-table --route-table-id "$DB_RT" --subnet-id "$DB_B"
```

## 3. Security Groups

```bash
export ALB_SG=$(aws ec2 create-security-group --group-name alb-sg --description "ALB HTTP/HTTPS" --vpc-id "$VPC_ID" --query GroupId --output text)
export APP_SG=$(aws ec2 create-security-group --group-name app-sg --description "EC2 app from ALB" --vpc-id "$VPC_ID" --query GroupId --output text)
export RDS_SG=$(aws ec2 create-security-group --group-name rds-sg --description "RDS from app" --vpc-id "$VPC_ID" --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" --ip-permissions IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges='[{CidrIp=0.0.0.0/0}]'
aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" --ip-permissions IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges='[{CidrIp=0.0.0.0/0}]'
aws ec2 authorize-security-group-ingress --group-id "$APP_SG" --ip-permissions "IpProtocol=tcp,FromPort=80,ToPort=80,UserIdGroupPairs=[{GroupId=$ALB_SG}]"
aws ec2 authorize-security-group-ingress --group-id "$RDS_SG" --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,UserIdGroupPairs=[{GroupId=$APP_SG}]"
```

## 4. RDS PostgreSQL

```bash
aws rds create-db-subnet-group \
  --db-subnet-group-name my-db-subnetgroup \
  --db-subnet-group-description "SafeTrace private DB subnets" \
  --subnet-ids "$DB_A" "$DB_B"

aws rds create-db-instance \
  --db-instance-identifier "$DB_IDENTIFIER" \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --allocated-storage 20 \
  --storage-type gp2 \
  --db-name "$DB_NAME" \
  --master-username "$DB_USERNAME" \
  --master-user-password "$DB_PASSWORD" \
  --db-subnet-group-name my-db-subnetgroup \
  --vpc-security-group-ids "$RDS_SG" \
  --backup-retention-period 1 \
  --no-publicly-accessible \
  --no-multi-az

aws rds wait db-instance-available --db-instance-identifier "$DB_IDENTIFIER"

export RDS_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier "$DB_IDENTIFIER" \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

export DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD_ENC}@${RDS_ENDPOINT}:5432/${DB_NAME}?sslmode=require"
echo "$DATABASE_URL"
```

If you are using the already-created database from the console, set:

```bash
export RDS_ENDPOINT="mydb.cmzbysmie18b.us-east-1.rds.amazonaws.com"
export DATABASE_URL="postgresql://${DB_USERNAME}:${DB_PASSWORD_ENC}@${RDS_ENDPOINT}:5432/${DB_NAME}?sslmode=require"
```

## 5. Target Group And ALB

```bash
export TG_ARN=$(aws elbv2 create-target-group \
  --name my-app-tg \
  --target-type instance \
  --protocol HTTP \
  --port 80 \
  --vpc-id "$VPC_ID" \
  --health-check-protocol HTTP \
  --health-check-path /api/health \
  --matcher HttpCode=200 \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

export ALB_ARN=$(aws elbv2 create-load-balancer \
  --name my-alb \
  --type application \
  --scheme internet-facing \
  --ip-address-type ipv4 \
  --subnets "$PUBLIC_A" "$PUBLIC_B" \
  --security-groups "$ALB_SG" \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)

aws elbv2 wait load-balancer-available --load-balancer-arns "$ALB_ARN"

aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn="$TG_ARN"

export ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --query 'LoadBalancers[0].DNSName' \
  --output text)

echo "Open later: http://${ALB_DNS}"
```

## 6. Secrets Manager

```bash
cat > safetrace-secret.json <<EOF
{
  "DATABASE_URL": "${DATABASE_URL}",
  "JWT_SECRET": "${JWT_SECRET}",
  "AWS_REGION": "${AWS_REGION}",
  "FRONTEND_PUBLIC_URL": "http://${ALB_DNS}",
  "RESEND_API_KEY": "${RESEND_API_KEY}",
  "RESEND_FROM_EMAIL": "${RESEND_FROM_EMAIL}",
  "AUTH_VERIFICATION_TTL_MINUTES": "10",
  "TRUST_PROXY": "true"
}
EOF

aws secretsmanager create-secret \
  --name "$SECRET_NAME" \
  --secret-string file://safetrace-secret.json \
  || aws secretsmanager put-secret-value \
    --secret-id "$SECRET_NAME" \
    --secret-string file://safetrace-secret.json
```

## 7. Instance Profile

AWS Academy often provides `LabInstanceProfile`. Use it if IAM creation is restricted.

```bash
export INSTANCE_PROFILE=LabInstanceProfile
```

If custom IAM is allowed, create a least-privilege profile:

```bash
cat > ec2-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ec2.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role --role-name my-app-ec2-role --assume-role-policy-document file://ec2-trust.json
aws iam attach-role-policy --role-name my-app-ec2-role --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore

cat > secrets-read-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:${AWS_REGION}:${ACCOUNT_ID}:secret:safetrace/prod/app-*"
    }
  ]
}
EOF

aws iam put-role-policy --role-name my-app-ec2-role --policy-name SafeTraceSecretRead --policy-document file://secrets-read-policy.json
aws iam create-instance-profile --instance-profile-name my-app-ec2-profile
aws iam add-role-to-instance-profile --instance-profile-name my-app-ec2-profile --role-name my-app-ec2-role
export INSTANCE_PROFILE=my-app-ec2-profile
```

## 8. User Data

Create the minimal bootstrap file in CloudShell. This downloads and runs the real `aws-user-data.sh` from GitHub:

```bash
cat > safetrace-user-data.sh <<'USERDATA'
#!/bin/bash
curl -fsSL https://raw.githubusercontent.com/gokulupadhyayguragain/group10-ddac-part3/main/aws-user-data.sh | bash
USERDATA
```

This works only if the GitHub repository is public and the private app subnet has NAT access to GitHub.

Full user-data reference:

```bash
cat > safetrace-user-data.sh <<'USERDATA'
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

echo "Starting SafeTrace provisioning..."

if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=128M count=16
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git docker.io curl ca-certificates
apt-get clean
rm -rf /var/lib/apt/lists/*

df -h /
ROOT_GB=$(df -BG / | awk 'NR==2 { gsub("G", "", $2); print $2 }')
if [ "${ROOT_GB:-0}" -lt 12 ]; then
    echo "ERROR: root disk is ${ROOT_GB}GiB. SafeTrace Docker builds need at least 16GiB root EBS volume."
    exit 1
fi

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

cat > "$REPO_DIR/.env" <<'APPENV'
AWS_REGION=us-east-1
SAFETRACE_SECRET_ID=safetrace/prod/app
FRONTEND_PORT=80
BACKEND_PORT=5000
APPENV
chown ubuntu:ubuntu "$REPO_DIR/.env"
chmod 600 "$REPO_DIR/.env"

cd "$REPO_DIR"
df -h /
docker compose down --remove-orphans || true
docker builder prune -af || true
docker system prune -af --volumes || true
rm -rf /root/.npm /home/ubuntu/.npm /tmp/* /var/tmp/* || true
df -h /
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
    docker compose ps || true
    sleep 5
done

if [ "$ready" -ne 1 ]; then
    docker compose ps || true
    docker compose logs --tail=200 backend || true
    docker compose logs --tail=200 frontend || true
    exit 1
fi
USERDATA
```

## 9. Launch Template And ASG

```bash
export AMI_ID=$(aws ec2 describe-images \
  --owners 099720109477 \
  --filters 'Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*' 'Name=state,Values=available' \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text)

export ROOT_DEVICE=$(aws ec2 describe-images \
  --image-ids "$AMI_ID" \
  --query 'Images[0].RootDeviceName' \
  --output text)

export USER_DATA_B64=$(base64 -w0 safetrace-user-data.sh 2>/dev/null || base64 safetrace-user-data.sh | tr -d '\n')

cat > launch-template-data.json <<EOF
{
  "ImageId": "${AMI_ID}",
  "InstanceType": "t3.micro",
  "IamInstanceProfile": { "Name": "${INSTANCE_PROFILE}" },
  "SecurityGroupIds": ["${APP_SG}"],
  "BlockDeviceMappings": [
    {
      "DeviceName": "${ROOT_DEVICE}",
      "Ebs": {
        "VolumeSize": 30,
        "VolumeType": "gp3",
        "DeleteOnTermination": true
      }
    }
  ],
  "UserData": "${USER_DATA_B64}",
  "TagSpecifications": [
    {
      "ResourceType": "instance",
      "Tags": [{ "Key": "Name", "Value": "my-app-instance" }]
    }
  ]
}
EOF

aws ec2 create-launch-template \
  --launch-template-name my-app-lt \
  --launch-template-data file://launch-template-data.json

aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name my-app-asg \
  --launch-template LaunchTemplateName=my-app-lt,Version='$Latest' \
  --min-size 2 \
  --desired-capacity 2 \
  --max-size 4 \
  --vpc-zone-identifier "${APP_A},${APP_B}" \
  --target-group-arns "$TG_ARN" \
  --health-check-type ELB \
  --health-check-grace-period 900
```

Wait and check:

```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names my-app-asg \
  --query 'AutoScalingGroups[0].Instances[*].[InstanceId,LifecycleState,HealthStatus]' \
  --output table

aws elbv2 describe-target-health --target-group-arn "$TG_ARN" --output table

echo "Open: http://${ALB_DNS}"
```

## 10. Troubleshooting From CloudShell

Target group health:

```bash
aws elbv2 describe-target-health --target-group-arn "$TG_ARN" \
  --query 'TargetHealthDescriptions[*].[Target.Id,Target.Port,TargetHealth.State,TargetHealth.Reason,TargetHealth.Description]' \
  --output table
```

Find instances:

```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names my-app-asg \
  --query 'AutoScalingGroups[0].Instances[*].InstanceId' \
  --output text
```

If SSM works, connect to an instance:

```bash
aws ssm start-session --target <instance-id>
```

Then run on the instance:

```bash
df -h
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

Most common causes:

```text
504 from ALB:
  target group port/path wrong, app-sg missing inbound 80 from alb-sg, or Docker did not publish host port 80

No /home/ubuntu/safetrace:
  user data failed before git clone; check NAT route and outbound HTTPS

Backend restarts:
  DATABASE_URL, RDS security group, Secrets Manager IAM, or RDS password is wrong

Target group still shows HTTP:3000:
  create/attach the port 80 target group; do not use 3000 with this deployment

Docker build says no space left on device:
  root disk is too small; launch with 30GiB root EBS or increase the volume and grow the filesystem

Backend exits immediately on a public test VM:
  production user-data expects Secrets Manager/RDS; use aws-user-data-local-test.sh for a throwaway public VM
```

## 11. Task 2 Full Serverless

This CloudShell file is for repairing or building **Phase A serverful** only.

For **Phase B full serverless**, use the AWS Management Console GUI runbook:

```text
docs/AWS_ACADEMY_SERVERLESS_GUI_CONSOLE.md
```

Do not add Phase B values to the Phase A `safetrace/prod/app` secret. Phase B uses a separate secret:

```text
safetrace/serverless/app
```
