#!/bin/bash
# =============================================================
# setup-evolution.sh — Configura e sobe a Evolution API + Redis
# Execute no servidor Contabo após install-docker.sh:
#   bash setup-evolution.sh
# =============================================================
set -e

echo "================================================"
echo " Cobr-AI — Setup da Evolution API"
echo "================================================"

# ── Variáveis — edite antes de rodar ────────────────────────
SERVER_IP="${SERVER_IP:-SEU_IP_AQUI}"
EVOLUTION_API_KEY="${EVOLUTION_API_KEY:-cobrai_evolution_secret_$(openssl rand -hex 8)}"
REDIS_PASSWORD="${REDIS_PASSWORD:-cobrai_redis_$(openssl rand -hex 8)}"
BACKEND_PORT="${BACKEND_PORT:-4010}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/cobrai}"
# ─────────────────────────────────────────────────────────────

# Criar diretório de deploy
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

# Gerar .env para o docker-compose
cat > .env <<EOF
SERVER_IP=${SERVER_IP}
EVOLUTION_API_KEY=${EVOLUTION_API_KEY}
REDIS_PASSWORD=${REDIS_PASSWORD}
BACKEND_PORT=${BACKEND_PORT}
EOF

echo ""
echo "→ Arquivo .env gerado em ${DEPLOY_DIR}/.env"
echo ""
echo "┌─────────────────────────────────────────────┐"
echo "│  GUARDE ESTAS CREDENCIAIS — use no backend  │"
echo "├─────────────────────────────────────────────┤"
echo "│  EVOLUTION_BASE_URL = http://${SERVER_IP}:8080"
echo "│  EVOLUTION_API_KEY  = ${EVOLUTION_API_KEY}"
echo "│  REDIS_PASSWORD     = ${REDIS_PASSWORD}"
echo "└─────────────────────────────────────────────┘"
echo ""

# Copiar docker-compose.yml (assumindo que o repo foi clonado)
if [ ! -f docker-compose.yml ]; then
  echo "⚠  docker-compose.yml não encontrado em ${DEPLOY_DIR}."
  echo "   Copie o arquivo do repositório Cobr-AI para cá e rode novamente."
  exit 1
fi

echo "→ Baixando imagens Docker..."
docker compose pull

echo "→ Subindo containers (Redis + Evolution API)..."
docker compose up -d

echo ""
echo "→ Aguardando Evolution API inicializar (30s)..."
sleep 30

# Verificar saúde dos containers
echo "→ Status dos containers:"
docker compose ps

# Testar se a API responde
echo ""
echo "→ Testando conexão com a Evolution API..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "apikey: ${EVOLUTION_API_KEY}" \
  "http://localhost:8080/instance/fetchInstances" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  echo "✔ Evolution API respondendo corretamente (HTTP 200)"
else
  echo "⚠  Evolution API retornou HTTP ${HTTP_CODE}."
  echo "   Verifique os logs: docker compose logs evolution"
fi

echo ""
echo "================================================"
echo " PRÓXIMO PASSO: criar a instância WhatsApp"
echo "================================================"
echo ""
echo " Execute o comando abaixo para criar a instância:"
echo ""
echo "  curl -s -X POST http://localhost:8080/instance/create \\"
echo "    -H 'apikey: ${EVOLUTION_API_KEY}' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"instanceName\":\"cobrai\",\"qrcode\":true,\"integration\":\"WHATSAPP-BAILEYS\"}'"
echo ""
echo " Depois leia o QR Code:"
echo ""
echo "  curl -s http://localhost:8080/instance/connect/cobrai \\"
echo "    -H 'apikey: ${EVOLUTION_API_KEY}'"
echo ""
echo "================================================"
