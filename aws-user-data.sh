#!/bin/bash
# ==============================================================================
# SafeTrace EC2 User Data Provisioning Script
# Targets: Amazon Linux 2 / Amazon Linux 2023
# Description: Automates the setup of Docker, Docker Compose, Git, clones
#              the SafeTrace repository, configures the environment, and
#              launches the full-stack containerised application.
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -e

# Redirect all stdout/stderr to a log file for CloudWatch/debugging
exec > >(tee -i /var/log/user-data.log) 2>&1

echo "=========================================="
echo "Starting SafeTrace Provisioning..."
echo "=========================================="

# 1. Update System Packages
echo "Updating packages..."
yum update -y

# 2. Install Git and Docker
echo "Installing Git and Docker..."
yum install -y git docker

# 3. Start and Enable Docker Service
echo "Enabling and starting Docker..."
systemctl enable --now docker

# 4. Install Docker Compose (v2)
echo "Installing Docker Compose v2..."
DOCKER_CONFIG=${DOCKER_CONFIG:-/usr/local/lib/docker/cli-plugins}
mkdir -p $DOCKER_CONFIG
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o $DOCKER_CONFIG/docker-compose
chmod +x $DOCKER_CONFIG/docker-compose
ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/bin/docker-compose

# 5. Add default user (ec2-user) to docker group so sudo is not required
usermod -aG docker ec2-user

# 6. Clone SafeTrace Repository
# NOTE: Replace the repository URL below with your actual repository URL
REPO_DIR="/home/ec2-user/safetrace"
git clone https://github.com/gocools/ddac.git "$REPO_DIR" || {
    echo "Git clone failed or repo already exists. Pulling latest..."
    cd "$REPO_DIR" && git pull
}
chown -R ec2-user:ec2-user "$REPO_DIR"

# 7. Configure Environment Variables
# The production .env contains only the non-secret bootstrap pointer. Store the
# full SafeTrace runtime JSON in AWS Secrets Manager under this secret id.
echo "Setting up production bootstrap environment variables..."
ENV_FILE="$REPO_DIR/code/.env"

cat << 'EOF' > "$ENV_FILE"
# ------------------------------------------------------------------------------
# SafeTrace Production Bootstrap
# ------------------------------------------------------------------------------
AWS_REGION=us-east-1
SAFETRACE_SECRET_ID=safetrace/prod/app
EOF

chown ec2-user:ec2-user "$ENV_FILE"
chmod 600 "$ENV_FILE"

# 8. Run App Containers
echo "Launching SafeTrace Docker Compose containers..."
cd "$REPO_DIR/code"
docker compose up --build -d

# 9. Seed Demo/Initial Database Data
echo "Seeding default admin, categories, and initial database data..."
# Wait for the backend health check to succeed before seeding
for i in {1..30}; do
    if curl -s http://localhost:5000/api/health | grep -q "ok"; then
        echo "Backend is healthy! Invoking seed script..."
        curl -X POST http://localhost:5000/api/admin/seed
        break
    fi
    echo "Waiting for backend service to become ready ($i/30)..."
    sleep 2
done

echo "=========================================="
echo "SafeTrace Provisioning Complete!"
echo "App is running at: http://<EC2-PUBLIC-IP>:3000"
echo "=========================================="
