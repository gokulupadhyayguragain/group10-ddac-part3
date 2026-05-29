#!/bin/bash
# ==============================================================================
# SafeTrace EC2 User Data Provisioning Script
# Targets: Ubuntu Server LTS
# Description: Automates the setup of Docker, Docker Compose, Git, clones
#              the SafeTrace repository, configures the environment, and
#              launches the full-stack containerised application.
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -euo pipefail

# Redirect all stdout/stderr to a log file for CloudWatch/debugging
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

# Private app subnets must have NAT Gateway routing for this script. It reaches
# apt repos, GitHub, Docker Hub, npm, Secrets Manager, and external APIs.

# Small lab instances can run out of memory while building Next.js. Add swap.
if [ ! -f /swapfile ]; then
    echo "Creating 2GB swapfile..."
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=128M count=16
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
fi

# 1. Update System Packages
echo "Updating packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y

# 2. Install Git and Docker
echo "Installing Git and Docker..."
apt-get install -y git docker.io curl ca-certificates
apt-get clean
rm -rf /var/lib/apt/lists/*

echo "Checking root disk size..."
df -h /
ROOT_GB=$(df -BG / | awk 'NR==2 { gsub("G", "", $2); print $2 }')
if [ "${ROOT_GB:-0}" -lt 12 ]; then
    echo "ERROR: root disk is ${ROOT_GB}GiB. SafeTrace Docker builds need at least 16GiB root EBS volume."
    echo "Increase the EC2 root volume to 16GiB, grow the filesystem, then rerun this script."
    exit 1
fi

# 3. Start and Enable Docker Service
echo "Enabling and starting Docker..."
systemctl enable --now docker
docker --version

# 4. Install Docker Compose (v2)
echo "Installing Docker Compose v2..."
DOCKER_CONFIG=${DOCKER_CONFIG:-/usr/local/lib/docker/cli-plugins}
mkdir -p "$DOCKER_CONFIG"
curl -fSL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o "$DOCKER_CONFIG/docker-compose"
chmod +x "$DOCKER_CONFIG/docker-compose"
ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/bin/docker-compose
docker compose version

# 5. Add default Ubuntu user to docker group so sudo is not required
usermod -aG docker ubuntu

# 6. Clone SafeTrace Repository
if [ -d "$REPO_DIR/.git" ]; then
    echo "Repository already exists. Refreshing from origin/main..."
    cd "$REPO_DIR"
    git fetch origin main
    git reset --hard origin/main
else
    echo "Cloning SafeTrace repository..."
    rm -rf "$REPO_DIR"
    git clone --depth 1 https://github.com/gokulupadhyayguragain/group10-ddac-part3.git "$REPO_DIR"
fi
chown -R ubuntu:ubuntu "$REPO_DIR"

# 7. Configure Environment Variables
# The production .env contains only the non-secret bootstrap pointer. Store the
# full SafeTrace runtime JSON in AWS Secrets Manager under this secret id.
echo "Setting up production bootstrap environment variables..."
ENV_FILE="$REPO_DIR/.env"

cat << 'EOF' > "$ENV_FILE"
# ------------------------------------------------------------------------------
# SafeTrace Production Bootstrap
# ------------------------------------------------------------------------------
AWS_REGION=us-east-1
SAFETRACE_SECRET_ID=safetrace/prod/app
FRONTEND_PORT=80
BACKEND_PORT=5000
EOF

chown ubuntu:ubuntu "$ENV_FILE"
chmod 600 "$ENV_FILE"

# 8. Run App Containers
echo "Launching SafeTrace Docker Compose containers..."
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

# 9. Seed Demo/Initial Database Data
echo "Seeding default admin, categories, and initial database data..."
# Wait for the backend health check to succeed before seeding
ready=0
for i in {1..60}; do
    if curl -fsS http://localhost:5000/api/health >/dev/null && curl -fsS http://localhost/api/health >/dev/null; then
        echo "Backend and frontend proxy are healthy. Invoking seed script..."
        curl -fsS -X POST http://localhost:5000/api/admin/seed || true
        ready=1
        break
    fi
    echo "Waiting for SafeTrace services to become ready ($i/60)..."
    docker compose ps || true
    sleep 5
done

if [ "$ready" -ne 1 ]; then
    echo "SafeTrace did not become healthy in time."
    docker compose ps || true
    docker compose logs --tail=200 backend || true
    docker compose logs --tail=200 frontend || true
    exit 1
fi

echo "=========================================="
echo "SafeTrace Provisioning Complete!"
echo "App is reachable through the ALB DNS name on HTTP 80 or HTTPS 443."
echo "On the instance: frontend http://localhost and backend http://localhost:5000/api/health"
echo "=========================================="
