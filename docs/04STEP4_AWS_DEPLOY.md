# STEP 4 - AWS Deployment Guide (Task 1)

This guide provides instructions for deploying the SafeTrace **Task 1 server-based system** onto AWS. Task 1 is the complete web application running on EC2 with RDS PostgreSQL. Do not mix this with the Task 2 full serverless architecture while explaining Task 1.

## Compute and Database Target
- **Compute Layer**: AWS EC2 (t2.micro / t3.micro running Ubuntu Server 22.04/24.04 LTS) or AWS Elastic Beanstalk.
- **Database Layer**: AWS RDS PostgreSQL 15/16 (db.t3.micro, multi-AZ disabled for coursework).
- **Photo handling for Task 1**: photos may remain as database-backed data URLs for the server demo. S3 is introduced separately in Task 2.

---

## 1. AWS RDS PostgreSQL Database Setup
To configure a high-availability, secure database layer:
1. Open the **AWS RDS Console** and select **Create Database**.
2. Choose **PostgreSQL** (version 15 or 16).
3. Select the **Free Tier** template (db.t3.micro, 20GB General Purpose SSD storage).
4. Set Master Username (e.g., `safetrace`) and a strong, secure master password.
5. In **Connectivity**:
   - Set **Public Access** to **No** (crucial for database security).
   - Ensure the database is placed in the private subnets of your VPC.
   - Choose or create a dedicated security group for RDS (e.g., `safetrace-rds-sg`).
6. Click **Create Database**. Once active, copy the **Endpoint** address.

### Security Group Inbound Rules:
- **`safetrace-rds-sg`**: Add an inbound rule allowing **PostgreSQL (5432)** where the source is the Security Group of your EC2 instance (`safetrace-ec2-sg`). Do not allow open CIDR block inputs (`0.0.0.0/0`).

---

## 2. AWS IAM Role Configuration (Best Practice)
Instead of storing static AWS credentials (`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`) inside files on the EC2 host, use an **IAM Instance Profile**:
1. Open the **IAM Console** and select **Roles** -> **Create Role**.
2. Choose **AWS Service** and select **EC2** as the trusted entity.
3. Attach a policy with the minimum permissions required for Task 1. If you use Secrets Manager for the RDS URL and JWT secret, EC2 needs only secret-read permission for this stage:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "secretsmanager:GetSecretValue",
         "Resource": "arn:aws:secretsmanager:us-east-1:123456789012:secret:safetrace/prod/app-*"
       }
     ]
   }
   ```
4. Name the role `SafeTrace-EC2-Role` and save.
5. When launching your EC2 instance, attach this IAM role under the **Advanced Details** -> **IAM Instance Profile** settings.

---

## 3. EC2 Provisioning and Launch Options
You can deploy the application containers to EC2 either manually or automatically.

### Option A: Automated Launch (Recommended)
When launching a new EC2 instance, paste the contents of `aws-user-data.sh` into the **User Data** field under the **Advanced Details** tab. The script will automatically:
1. Install Git, Docker, and Docker Compose.
2. Clone the repository and configure base environment variables.
3. Launch the containerised frontend and backend against RDS, then seed demo data.

### Option B: Manual Setup
1. Launch an EC2 instance running **Ubuntu Server 22.04/24.04 LTS** (t2.micro / t3.micro).
2. If using an ALB, attach an app security group that allows **HTTP 80 only from `alb-sg`**. Do not open port `3000` or `5000` to the public Internet.
3. Log in to the instance via SSH:
   ```bash
   ssh -i your-key.pem ubuntu@your-ec2-ip
   ```
4. Install system packages and Docker:
   ```bash
   sudo apt-get update -y
   sudo apt-get install -y git docker.io curl ca-certificates
   sudo systemctl enable --now docker
   sudo usermod -aG docker ubuntu
   ```
5. Install Docker Compose v2:
   ```bash
   sudo mkdir -p /usr/local/lib/docker/cli-plugins
   sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose
   sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
   sudo ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/bin/docker-compose
   ```
6. Log out and log back in to apply the Docker group membership.

---

## 4. Run and Validate the Application
1. Clone the repository:
   ```bash
   git clone https://github.com/gokulupadhyayguragain/group10-ddac-part3.git safetrace
   cd safetrace
   ```
2. Copy the sample environment file and configure it:
   ```bash
   cp .env.example .env
   nano .env
   ```
   *For Task 1 production, set only `AWS_REGION` and `SAFETRACE_SECRET_ID` in `.env`. Keep the full runtime JSON in AWS Secrets Manager using `docs/10SECRETS_MANAGER_VALUES.md`. Phase B full serverless uses its own secret created in the Secrets Manager console.*
   For ALB deployment, also set `FRONTEND_PORT=80` so Docker maps the frontend container to the EC2 host's port 80.
3. Run the containers:
   ```bash
   docker compose up --build -d
   ```
4. Seed the database with the core categories, test caregivers, admin, and missing person profiles:
   ```bash
   curl -X POST http://localhost:5000/api/admin/seed
   ```
5. Confirm the deployment:
   - Hit the health endpoint: `curl -fsS http://localhost:5000/api/health`
   - Check the ALB-facing frontend path on the instance: `curl -fsS http://localhost/api/health`
   - Access the web interface at `http://<ALB-DNS-NAME>`
