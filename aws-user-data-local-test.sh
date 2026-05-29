#!/bin/bash
# ==============================================================================
# SafeTrace Public VM Smoke-Test Bootstrap
# Targets: Ubuntu Server LTS
# Description: Runs SafeTrace on one public EC2/VM with a local PostgreSQL
#              container. Use this only to prove the app opens; production uses
#              aws-user-data.sh with RDS and AWS Secrets Manager.
# ==============================================================================

set -euo pipefail

exec > >(tee -a /var/log/safetrace-local-test.log) 2>&1

REPO_DIR="/home/ubuntu/safetrace"

on_error() {
    echo "ERROR: SafeTrace local-test provisioning failed at line ${1}."
    if [ -d "$REPO_DIR" ]; then
        cd "$REPO_DIR" || true
        docker compose ps || true
        docker compose logs --tail=160 || true
    fi
}

trap 'on_error $LINENO' ERR

echo "=========================================="
echo "Starting SafeTrace Public VM Smoke Test..."
echo "=========================================="

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
    echo "ERROR: root disk is ${ROOT_GB}GiB. Use a 16GiB+ root disk; 30GiB is ideal."
    exit 1
fi

systemctl enable --now docker
docker --version

DOCKER_CONFIG=${DOCKER_CONFIG:-/usr/local/lib/docker/cli-plugins}
mkdir -p "$DOCKER_CONFIG"
curl -fSL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o "$DOCKER_CONFIG/docker-compose"
chmod +x "$DOCKER_CONFIG/docker-compose"
ln -sf /usr/local/lib/docker/cli-plugins/docker-compose /usr/bin/docker-compose
docker compose version

usermod -aG docker ubuntu || true

if [ -d "$REPO_DIR/.git" ]; then
    cd "$REPO_DIR"
    git fetch origin main
    git reset --hard origin/main
else
    rm -rf "$REPO_DIR"
    git clone --depth 1 https://github.com/gokulupadhyayguragain/group10-ddac-part3.git "$REPO_DIR"
fi
chown -R ubuntu:ubuntu "$REPO_DIR"

cat <<'EOF' > "$REPO_DIR/.env"
AWS_REGION=us-east-1
SAFETRACE_SECRET_ID=
POSTGRES_DB=safetrace
POSTGRES_USER=safetrace
POSTGRES_PASSWORD=safetrace
DATABASE_URL=postgresql://safetrace:safetrace@db:5432/safetrace
JWT_SECRET=local-public-smoke-test-change-me
AUTH_DEV_EXPOSE_VERIFICATION_CODE=true
FRONTEND_PUBLIC_URL=http://localhost
FRONTEND_PORT=80
BACKEND_PORT=5000
EOF

chown ubuntu:ubuntu "$REPO_DIR/.env"
chmod 600 "$REPO_DIR/.env"

cd "$REPO_DIR"
docker compose --profile local-db down --remove-orphans || true
docker builder prune -af || true
docker system prune -af --volumes || true
rm -rf /root/.npm /home/ubuntu/.npm /tmp/* /var/tmp/* || true
docker compose --profile local-db config
docker compose --profile local-db up --build -d
docker compose --profile local-db ps

ready=0
for i in {1..60}; do
    if curl -fsS http://localhost:5000/api/health >/dev/null && curl -fsS http://localhost/api/health >/dev/null; then
        curl -fsS -X POST http://localhost:5000/api/admin/seed || true
        ready=1
        break
    fi
    echo "Waiting for SafeTrace local test stack ($i/60)..."
    docker compose --profile local-db ps || true
    sleep 5
done

if [ "$ready" -ne 1 ]; then
    docker compose --profile local-db ps || true
    docker compose --profile local-db logs --tail=240 backend || true
    docker compose --profile local-db logs --tail=240 frontend || true
    docker compose --profile local-db logs --tail=120 db || true
    exit 1
fi

echo "=========================================="
echo "SafeTrace local public VM smoke test is ready."
echo "Open http://<public-ip> or run curl http://localhost/api/health"
echo "=========================================="
