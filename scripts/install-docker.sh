#!/bin/bash
# =============================================================
# install-docker.sh — Instala Docker + Docker Compose no Ubuntu/Debian
# Execute como root no servidor Contabo:
#   bash install-docker.sh
# =============================================================
set -e

echo "================================================"
echo " Cobr-AI — Instalação do Docker"
echo "================================================"

# Verificar se já está instalado
if command -v docker &>/dev/null; then
  echo "✔ Docker já instalado: $(docker --version)"
  exit 0
fi

echo "→ Atualizando pacotes..."
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release

echo "→ Adicionando repositório oficial do Docker..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

echo "→ Instalando Docker Engine e Compose plugin..."
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

echo "→ Habilitando Docker no boot..."
systemctl enable docker
systemctl start docker

echo ""
echo "✔ Docker instalado com sucesso!"
docker --version
docker compose version
