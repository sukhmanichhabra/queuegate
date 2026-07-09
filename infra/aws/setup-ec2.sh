#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# QueueGate — EC2 Bootstrap Script
# Run this ONCE on a fresh Ubuntu 24.04 LTS t2.micro instance.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<YOU>/queuegate/main/infra/aws/setup-ec2.sh | bash
#   — OR —
#   scp infra/aws/setup-ec2.sh ubuntu@<IP>:~/ && ssh ubuntu@<IP> "bash ~/setup-ec2.sh"
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ "$(id -u)" -eq 0 ]] || error "Run as root or with sudo: sudo bash $0"

# ── 1. System packages ────────────────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq
apt-get install -y -qq \
  curl wget git unzip \
  ca-certificates gnupg lsb-release \
  ufw fail2ban \
  unattended-upgrades apt-listchanges

# ── 2. Docker Engine ──────────────────────────────────────────────────────────
info "Installing Docker Engine..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) \
  signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
usermod -aG docker ubuntu
info "Docker installed: $(docker --version)"

# ── 3. Caddy (HTTPS reverse proxy) ───────────────────────────────────────────
info "Installing Caddy..."
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y -qq caddy
info "Caddy installed: $(caddy version)"

# ── 4. Swap file (critical for t2.micro 1GB RAM) ─────────────────────────────
info "Configuring 1 GB swap file..."
if [[ ! -f /swapfile ]]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Tune swappiness: only swap when memory is critically low
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  sysctl -p
  info "Swap configured: $(swapon --show)"
else
  warn "Swap file already exists — skipping"
fi

# ── 5. Firewall (UFW) ─────────────────────────────────────────────────────────
info "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP (Caddy redirect)'
ufw allow 443/tcp  comment 'HTTPS'
# IMPORTANT: Do NOT open 5432, 6379, 9092 — internal Docker only
ufw --force enable
info "UFW status:"
ufw status verbose

# ── 6. Fail2Ban (SSH brute-force protection) ──────────────────────────────────
info "Enabling Fail2Ban..."
systemctl enable --now fail2ban

# ── 7. Automatic security updates ────────────────────────────────────────────
info "Enabling unattended security upgrades..."
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades

# ── 8. Clone QueueGate repository ─────────────────────────────────────────────
info "Cloning QueueGate repository..."
mkdir -p /opt/queuegate
chown ubuntu:ubuntu /opt/queuegate

# NOTE: Replace with your actual GitHub URL
REPO_URL="${QUEUEGATE_REPO_URL:-https://github.com/REPLACE_WITH_YOUR_GITHUB/queuegate.git}"

if [[ -d /opt/queuegate/.git ]]; then
  warn "Repo already cloned — pulling latest..."
  sudo -u ubuntu git -C /opt/queuegate pull
else
  sudo -u ubuntu git clone "$REPO_URL" /opt/queuegate
fi

# ── 9. Caddy configuration ─────────────────────────────────────────────────────
info "Installing Caddyfile..."
cp /opt/queuegate/infra/aws/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy

# ── 10. Systemd service: docker-compose.prod.yml on boot ─────────────────────
info "Creating queuegate systemd service..."
cat > /etc/systemd/system/queuegate.service <<'EOF'
[Unit]
Description=QueueGate Docker Compose Stack
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/queuegate
# Load the production env file
EnvironmentFile=/opt/queuegate/.env.prod
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d --remove-orphans
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
TimeoutStartSec=300
User=ubuntu
Group=ubuntu

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable queuegate.service
info "queuegate.service enabled (will start on next boot)"

# ── 11. Docker log rotation (prevents disk fill on t2.micro) ─────────────────
info "Configuring Docker log rotation..."
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
systemctl reload docker

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  EC2 Bootstrap Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. cd /opt/queuegate"
echo "  2. cp infra/aws/.env.prod.example .env.prod"
echo "  3. nano .env.prod  # fill in JWT secrets + domain"
echo "  4. nano /etc/caddy/Caddyfile  # set your actual domain"
echo "  5. docker compose -f docker-compose.prod.yml build"
echo "  6. docker compose -f docker-compose.prod.yml up -d"
echo "  7. systemctl reload caddy"
echo ""
echo -e "${YELLOW}IMPORTANT: Log out and back in for Docker group to take effect.${NC}"
