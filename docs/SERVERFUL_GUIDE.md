AWS Academy Cloud Developing 2.x — Serverful Architecture Guide (Console Only)
==========================================================================

Overview
--------
This guide is a complete, Console-only walkthrough for building a serverful AWS architecture in AWS Academy Cloud Developing 2.x labs. It is written for the AWS Management Console only and stays within the constraints of the Academy sandbox as much as possible.

The guide covers:
- VPC and subnet design across two Availability Zones
- Internet Gateway and NAT Gateway routing
- Least-privilege security groups
- Secrets Manager or SSM fallback for credentials
- RDS PostgreSQL in private subnets
- Application Load Balancer and Target Group
- Launch Template and Auto Scaling Group
- Session Manager access instead of SSH
- Monitoring, backups, logging, testing, cleanup, and troubleshooting

Important Academy guidance
- Use `us-east-1` unless your instructor says otherwise.
- Use only small instance sizes, typically `t3.micro`.
- Use the provided `LabRole` and `LabInstanceProfile` if IAM creation is restricted.
- Do not enable features that are commonly blocked in Academy labs, such as Multi-AZ RDS or Enhanced Monitoring.

Architecture Overview
---------------------
Logical flow:

Internet
  |
Application Load Balancer
  |
Auto Scaling Group of EC2 app servers in private app subnets
  |
Amazon RDS PostgreSQL in private DB subnets


Part 1 — Prepare the AWS Console and the lab settings
-----------------------------------------------------
Before creating resources, verify these basics:
1. You are in the correct region, preferably `us-east-1`.
2. You know the Amazon-owned AMI you will use for the EC2 instances.
3. You know whether you can create IAM roles and Secrets Manager secrets in your lab.
4. You have a small deployment plan in mind: one VPC, two AZs, one ALB, one ASG, and one RDS instance.

Suggested naming convention used throughout this guide:
- VPC: `my-vpc`
- Public route table: `public-rt`
- App route table: `app-rt`
- DB route table: `db-rt`
- Internet Gateway: `my-vpc-igw`
- NAT Gateway: `nat-a`
- Security groups: `alb-sg`, `app-sg`, `rds-sg`
- DB subnet group: `my-db-subnetgroup`
- RDS instance: `mydb`
- Target group: `my-app-tg`
- Load balancer: `my-alb`
- Launch template: `my-app-lt`
- Auto Scaling Group: `my-app-asg`


Part 2 — Create the VPC
-----------------------
1) Open the VPC console
- AWS Console → Services → VPC

2) Create the VPC
- Click Create VPC
- Choose VPC only
- Settings:
  - Name tag: `my-vpc`
  - IPv4 CIDR block: `10.0.0.0/16`
  - IPv6 CIDR block: No IPv6
  - Tenancy: Default
- Create the VPC

3) Enable DNS hostnames and DNS resolution
- Select the new VPC
- Actions → Edit VPC settings
- Enable DNS hostnames
- Enable DNS resolution

Why this matters
- DNS hostnames help EC2 and RDS resources resolve private names inside the VPC.
- DNS resolution is required for normal service communication in most lab setups.


Part 3 — Create subnets in two AZs
----------------------------------
You need six subnets total: two public, two private app, and two private DB.

Example layout:
- public-a: `10.0.0.0/24` in `us-east-1a`
- public-b: `10.0.1.0/24` in `us-east-1b`
- privateapp-a: `10.0.10.0/24` in `us-east-1a`
- privateapp-b: `10.0.11.0/24` in `us-east-1b`
- privatedb-a: `10.0.20.0/24` in `us-east-1a`
- privatedb-b: `10.0.21.0/24` in `us-east-1b`

Create the subnets
1. VPC → Subnets → Create subnet
2. Select VPC `my-vpc`
3. Create each subnet with its AZ and CIDR block
4. Repeat until all six subnets exist

Enable public IP assignment on the public subnets
1. Select `public-a`
2. Actions → Edit subnet settings or Modify auto-assign IP settings
3. Enable auto-assign public IPv4 address
4. Repeat for `public-b`

Why this layout is useful
- Public subnets host the ALB and NAT Gateway.
- Private app subnets host EC2 application servers.
- Private DB subnets host the RDS instance and keep it off the public internet.


Part 4 — Create the Internet Gateway and public routing
------------------------------------------------------
1) Create the Internet Gateway
- VPC → Internet Gateways → Create internet gateway
- Name: `my-vpc-igw`
- Create the gateway

2) Attach the Internet Gateway to the VPC
- Select the IGW
- Actions → Attach to VPC
- Choose `my-vpc`

3) Create a public route table
- VPC → Route tables → Create route table
- Name: `public-rt`
- VPC: `my-vpc`
- Create route table

4) Add a public internet route
- Select `public-rt`
- Routes → Edit routes → Add route
- Destination: `0.0.0.0/0`
- Target: Internet Gateway `my-vpc-igw`
- Save changes

5) Associate the public subnets
- Subnet associations → Edit subnet associations
- Select `public-a` and `public-b`
- Save

Result
- Resources in public subnets can reach the internet directly through the IGW.


Part 5 — Create the NAT Gateway for private app subnets
-------------------------------------------------------
The NAT Gateway allows instances in private app subnets to make outbound connections (for example, package updates or fetching dependencies) without exposing them directly to the internet.

1) Allocate an Elastic IP
- VPC → Elastic IPs → Allocate Elastic IP address
- Allocate one EIP for the NAT Gateway

2) Create the NAT Gateway
- VPC → NAT Gateways → Create NAT gateway
- Name: `nat-a`
- Subnet: `public-a`
- Elastic IP allocation: use the one you created
- Create NAT Gateway

3) Create the private app route table
- VPC → Route tables → Create route table
- Name: `app-rt`
- VPC: `my-vpc`
- Create route table

4) Add the NAT route
- Select `app-rt`
- Routes → Edit routes → Add route
- Destination: `0.0.0.0/0`
- Target: NAT Gateway `nat-a`
- Save changes

5) Associate private app subnets
- Subnet associations → Edit subnet associations
- Select `privateapp-a` and `privateapp-b`
- Save

Budget note
- A second NAT Gateway in the second AZ gives better resilience but increases cost. For a lab, one NAT Gateway is usually enough.


Part 6 — Create the DB route table
----------------------------------
The DB subnets should remain private and should not have a route to the internet.

1) Create the DB route table
- VPC → Route tables → Create route table
- Name: `db-rt`
- VPC: `my-vpc`
- Create route table

2) Associate private DB subnets
- Subnet associations → Edit subnet associations
- Select `privatedb-a` and `privatedb-b`
- Save

3) Do not add a default internet route
- The RDS subnet group should remain isolated from the public internet.


Part 7 — Optional VPC endpoints
--------------------------------
VPC endpoints reduce the need for NAT traffic and are useful when you want private access to AWS services.

Recommended endpoints for this lab:
- S3 gateway endpoint
- Secrets Manager interface endpoint

How to create an endpoint
1. VPC → Endpoints → Create endpoint
2. Choose AWS service
3. Select the service name
4. Attach the correct route tables or subnets
5. Attach a small security group if you create an interface endpoint

When to use them
- S3 endpoint: useful if EC2 hosts download static app assets from S3.
- Secrets Manager endpoint: useful if the EC2 app retrieves DB credentials privately.


Part 8 — Create security groups
-------------------------------
Create three security groups in the `my-vpc` VPC.

1) `alb-sg`
- Purpose: allow traffic from the internet to the ALB
- Inbound rules:
  - HTTP 80 from `0.0.0.0/0`
  - HTTPS 443 from `0.0.0.0/0` if you plan to use TLS
- Outbound rules:
  - Default allow all outbound is acceptable for a lab

2) `app-sg`
- Purpose: allow only the ALB to reach the EC2 app instances
- Inbound rules:
  - HTTP 80 from security group `alb-sg`
- Outbound rules:
  - Allow TCP 5432 to `rds-sg`
  - Allow HTTPS 443 if the app needs to call AWS APIs or external services via NAT

3) `rds-sg`
- Purpose: allow only the app servers to reach PostgreSQL
- Inbound rules:
  - PostgreSQL 5432 from security group `app-sg`
- Outbound rules:
  - Default allow all outbound is acceptable in labs, but you can tighten it if needed

Security principle
- Use security-group references instead of CIDR ranges whenever possible. That is the simplest least-privilege approach in AWS.


Part 9 — Store database credentials
-----------------------------------
Use Secrets Manager if your lab allows it. If not, use SSM Parameter Store as the fallback.

1) Create a secret in Secrets Manager
- Console → Services → Secrets Manager → Store a new secret
- Secret type: Other type of secret
- Key/value pairs:
  - `username`: `postgres`
  - `password`: choose a strong password
- Secret name: `my/app/db`
- Keep the default encryption unless your lab requires a specific key
- Finish creating the secret

2) Fallback using SSM Parameter Store
- Console → Systems Manager → Parameter Store → Create parameter
- Name: `/my/app/db/password`
- Type: SecureString
- Value: your password
- This is useful if Secrets Manager or KMS is restricted in the Academy lab

Why this step matters
- Your app should not hard-code database credentials.
- A secret store keeps credentials separate from source code and user data.


Part 10 — Create the RDS DB subnet group
----------------------------------------
1) Open the RDS console
- Console → Services → RDS

2) Create a DB subnet group
- Subnet groups → Create DB subnet group
- Name: `my-db-subnetgroup`
- Description: `Private DB subnets`
- VPC: `my-vpc`
- Add subnets: `privatedb-a`, `privatedb-b`
- Create

Why this is required
- RDS needs a subnet group to know where it may place the database network interfaces.
- A DB subnet group keeps the database isolated in private subnets.


Part 11 — Create RDS PostgreSQL
--------------------------------
This is the database for the web application.

1) Start database creation
- RDS → Databases → Create database
- Choose Standard create
- Engine: PostgreSQL
- Template: Dev/Test for labs

2) Settings
- DB instance identifier: `mydb`
- Master username: `postgres`
- Password: use the secret you created or a manual value if allowed

3) Instance sizing and storage
- DB instance class: `db.t3.micro`
- Storage: start with `20 GB` General Purpose (gp2/gp3 depending on availability)
- Storage autoscaling: optional, but keep it conservative for a lab

4) Connectivity
- VPC: `my-vpc`
- DB subnet group: `my-db-subnetgroup`
- Public access: No
- VPC security group: `rds-sg`

5) Additional configuration
- Initial database name: optional, if your app expects one
- Backup retention: keep a small retention period appropriate for the lab
- Performance insights: optional; use only if the lab permits it
- Enhanced Monitoring: disable in Academy labs
- Multi-AZ: do not enable in Academy labs

6) Create database
- Click Create database and wait until the status becomes Available

Operational note
- If the database fails to create, the most common issues are incorrect security groups, unsupported instance class, or a restricted lab permission.


Part 12 — Create the target group
---------------------------------
The target group is where the ALB sends requests.

1) Open Target Groups
- Console → EC2 → Target Groups → Create target group

2) Configure the target group
- Target type: Instances
- Protocol: HTTP
- Port: 80
- VPC: `my-vpc`
- Health check path: `/health` (or your app’s actual health endpoint)
- Name: `my-app-tg`
- Create

3) Why health checks matter
- The ALB uses the health check to decide whether instances should receive traffic.
- If the health endpoint is missing or misconfigured, the target group will show unhealthy targets.


Part 13 — Create the Application Load Balancer
----------------------------------------------
1) Open Load Balancers
- Console → EC2 → Load Balancers → Create load balancer
- Choose Application Load Balancer

2) Configure the ALB
- Name: `my-alb`
- Scheme: Internet-facing
- IP address type: IPv4
- Network mapping: select `public-a` and `public-b`
- Security groups: select `alb-sg`

3) Listener settings
- Listener protocol: HTTP 80
- Default action: forward to `my-app-tg`
- If using HTTPS, you must request or import a certificate in ACM and then add an HTTPS listener

4) Create the ALB
- Review and create
- Wait for the state to become Active

How to verify
- Copy the ALB DNS name from the description tab and use it in a browser after your ASG is healthy


Part 14 — Create the IAM role and instance profile for EC2
----------------------------------------------------------
If the Academy lab allows role creation, use a tight role. If not, use the pre-created `LabRole` and `LabInstanceProfile`.

1) Create an IAM role for EC2
- Console → IAM → Roles → Create role
- Trusted entity type: AWS service
- Use case: EC2
- Attach managed policy: `AmazonSSMManagedInstanceCore`

2) Add least-privilege access to Secrets Manager
- Add an inline policy allowing `secretsmanager:GetSecretValue` only for the secret ARN you created

Example inline policy
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:my/app/db*"
    }
  ]
}
```

3) Instance profile
- If your role creates an instance profile automatically, use it in the launch template.
- If the lab already provides `LabInstanceProfile`, prefer that.


Part 15 — Create the launch template
------------------------------------
1) Open Launch Templates
- Console → EC2 → Launch Templates → Create launch template

2) Choose the core settings
- Template name: `my-app-lt`
- AMI: Amazon Linux 2 or another Amazon-owned AMI approved in the lab
- Instance type: `t3.micro`
- Key pair: optional (you can use Session Manager instead of SSH)
- Network settings: no public IP
- Security groups: `app-sg`
- IAM instance profile: `EC2AppRole` or `LabInstanceProfile`

3) Add user data for application bootstrapping
Example user data:
```bash
#!/bin/bash
yum update -y
yum install -y git
cd /home/ec2-user
git clone https://github.com/example/sample-app.git
cd sample-app
chmod +x start.sh
./start.sh &
```

4) What the bootstrap script should do
- Install dependencies
- Fetch the app code
- Read the DB secret or parameter if needed
- Start the application service


Part 16 — Create the Auto Scaling Group
---------------------------------------
1) Open Auto Scaling Groups
- Console → EC2 → Auto Scaling Groups → Create Auto Scaling group

2) Configure the ASG
- Name: `my-app-asg`
- Launch template: `my-app-lt`
- Network: select `privateapp-a` and `privateapp-b`
- Attach to load balancer: select `my-app-tg`

3) Capacity
- Minimum: 2
- Desired: 2
- Maximum: 4
- Adjust lower if your lab quotas are very strict

4) Optional scaling policy
- Add target tracking based on CPU utilization if the lab allows it

5) Create the ASG
- Wait for the instances to launch and register in the target group


Part 17 — Verify the deployment
--------------------------------
1) Verify target health
- Open `my-app-tg` → Targets tab
- Wait until both instances show healthy

2) Verify ALB
- Open the ALB DNS name in a browser
- The application should load through the load balancer

3) Verify RDS connectivity from Session Manager
- EC2 → Instances → Select an instance → Connect → Session Manager
- Install a client if needed and connect to the database endpoint

Example command (Amazon Linux)
```bash
sudo yum install -y postgresql
psql --host=<your-rds-endpoint> --port=5432 --username=postgres --dbname=postgres
```

4) Verify the app can read the database credentials
- Confirm the app is able to access Secrets Manager or SSM Parameter Store using the IAM role


Part 18 — Access the EC2 instance with Session Manager
------------------------------------------------------
Session Manager is strongly preferred in Academy labs because it avoids SSH keys and public IP exposure.

How to open a session
1. EC2 → Instances → Select the instance
2. Click Connect
3. Choose Session Manager
4. Open session

Why this is better than SSH
- No inbound SSH port required
- No public IP required on app servers
- Easier to audit in the Academy console


Part 19 — Optional S3 static assets and CloudFront
--------------------------------------------------
Some apps use S3 for images, CSS, or frontend builds.

1) Create an S3 bucket
- S3 → Create bucket → example `my-app-static`

2) Upload assets
- Upload images, CSS files, JavaScript bundles, or static builds

3) Add CloudFront if needed
- CloudFront → Create distribution → Origin: the S3 bucket or ALB DNS name
- Use CloudFront when you want CDN caching or a single global entry point


Part 20 — Monitoring, logging, and backups
-----------------------------------------
1) CloudWatch
- Use CloudWatch Logs for application logs
- Create alarms for:
  - EC2 CPU
  - ALB HTTP 5xx errors
  - RDS CPU and free storage

2) RDS backups
- RDS → Databases → `mydb` → Modify
- Choose a reasonable backup retention period for the lab

3) ALB access logs
- EC2 → Load Balancers → `my-alb` → Attributes → Access logs → Enable
- Store logs in an S3 bucket if allowed

4) X-Ray
- Not required for a basic serverful app, but can be used if the app is instrumented


Part 21 — Common Academy problems and fixes
-------------------------------------------
1) Cannot create IAM users or groups
- Use the provided `LabRole` and `LabInstanceProfile`

2) RDS creation fails
- Ensure Multi-AZ is off
- Ensure Enhanced Monitoring is off
- Choose a small instance class like `db.t3.micro`

3) NAT Gateway costs too much
- Use one NAT Gateway only for the lab
- Delete it when you are done

4) EC2 launch fails
- Use an Amazon-owned AMI
- Use a small instance size like `t3.micro`

5) Targets remain unhealthy
- Confirm app security groups, port, and health check path
- Confirm the app is actually listening on the configured port


Part 22 — Cleanup and cost controls
-----------------------------------
Delete resources in reverse order:
1. Scale down and delete the Auto Scaling Group
2. Delete the Launch Template
3. Delete the Application Load Balancer
4. Delete the Target Group
5. Delete the RDS database (take a final snapshot if needed)
6. Delete the DB subnet group
7. Delete the Secrets Manager secret or SSM parameter if no longer needed
8. Delete NAT Gateway and release the Elastic IP
9. Delete the route tables, subnets, Internet Gateway, and finally the VPC

Cost-saving tips
- Use the minimum instance sizes allowed by the lab
- Keep the NAT Gateway count to one if possible
- Delete idle log buckets, ALBs, and snapshots when the lab is done


Appendix A — Helpful policy examples
-----------------------------------
Minimal Secrets Manager read policy for EC2 or Lambda:
```json
{
  "Version":"2012-10-17",
  "Statement":[
    {"Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":"arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:my/app/db*"}
  ]
}
```

Minimal SSM Session Manager policy for EC2:
```json
{
  "Version":"2012-10-17",
  "Statement":[
    {"Effect":"Allow","Action":["ssm:StartSession","ssm:DescribeSessions","ssm:TerminateSession"],"Resource":"*"}
  ]
}
```


Appendix B — Quick test checklist
---------------------------------
- VPC exists with six subnets and correct routes
- NAT Gateway is reachable from private app subnets
- Security groups allow only the intended traffic
- RDS is private and reachable only from app SG
- ALB target group shows healthy instances
- Session Manager connects to the EC2 instance
- The application loads from the ALB DNS name
- CloudWatch logs are visible

Last reviewed: 2026-05-28
