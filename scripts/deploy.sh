#!/bin/bash
# =============================================================
# deploy.sh — Instala / atualiza o Cobr-AI no servidor
#
# Pré-requisitos no servidor:
#   - Docker + Docker Compose instalados (use install-docker.sh)
#   - Git instalado: yum install -y git  ou  apt install -y git
#
# Primeira vez:
#   git clone https://github.com/telysonpinheiro-lang/Cobr-AI.git /opt/cobrai
#   cd /opt/cobrai
#   cp .env.example .env
#   nano .env            # preencha TODAS as variáveis
#   bash scripts/deploy.sh
#
# Atualizações:
#   cd /opt/cobrai && bash scripts/deploy.sh
# =============================================================
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/cobrai}"
REPO_URL="https://github.com/telysonpinheiro-lang/Cobr-AI.git"

# ── Cores ─────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
err()  { echo -e "${RED}✖ $*${NC}"; exit 1; }

echo ""
echo "======================================================"
echo "  Cobr-AI — Deploy"
echo "======================================================"
echo ""

# ── Verificar Docker ───────────────────────────────────────────
command -v docker        >/dev/null 2>&1 || err "Docker não instalado. Rode: bash scripts/install-docker.sh"
command -v docker compose >/dev/null 2>&1 || docker compose version >/dev/null 2>&1 || err "Docker Compose não encontrado"
ok "Docker OK"

# ── Ir para o diretório de deploy ─────────────────────────────
cd "$DEPLOY_DIR" 2>/dev/null || err "Diretório $DEPLOY_DIR não encontrado. Clone o repositório primeiro:
  git clone $REPO_URL $DEPLOY_DIR"

# ── Verificar .env ────────────────────────────────────────────
if [ ! -f .env ]; then
  warn ".env não encontrado. Criando a partir do exemplo..."
  cp .env.example .env
  err "Preencha as variáveis em $DEPLOY_DIR/.env e rode novamente."
fi

# Verifica se as variáveis obrigatórias estão preenchidas
check_var() {
  local val
  val=$(grep -E "^${1}=" .env | cut -d= -f2- | tr -d '"' | tr -d "'")
  if [ -z "$val" ] || [[ "$val" == *"TROQUE"* ]] || [[ "$val" == *"SEU_IP"* ]]; then
    err "Variável ${1} não configurada no .env"
  fi
}

check_var SERVER_IP
check_var JWT_SECRET
check_var MYSQL_ROOT_PASSWORD
check_var MYSQL_PASSWORD
check_var EVOLUTION_API_KEY
check_var REDIS_PASSWORD
check_var PG_PASSWORD
ok ".env validado"

# ── Atualizar código do repositório ───────────────────────────
echo ""
echo "→ Atualizando código..."
git fetch origin main
git reset --hard origin/main
ok "Código atualizado ($(git log --oneline -1))"

# ── Build e subida dos containers ─────────────────────────────
echo ""
echo "→ Construindo imagens Docker..."
docker compose build --no-cache backend frontend
ok "Imagens construídas"

echo ""
echo "→ Subindo todos os serviços..."
docker compose up -d --remove-orphans

echo ""
echo "→ Aguardando serviços inicializarem (30s)..."
sleep 30

# ── Verificar status ──────────────────────────────────────────
echo ""
echo "→ Status dos containers:"
docker compose ps

# ── Health check do backend ───────────────────────────────────
echo ""
echo "→ Verificando backend..."
BACKEND_PORT_VAL=$(grep -E "^BACKEND_PORT=" .env | cut -d= -f2 || echo "4010")
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${BACKEND_PORT_VAL}/api/health" 2>/dev/null || echo "000")
if [ "$HTTP" = "200" ]; then
  ok "Backend respondendo (HTTP 200)"
else
  warn "Backend retornou HTTP ${HTTP} — verifique: docker compose logs backend"
fi

# ── Health check do frontend ──────────────────────────────────
HTTP_FE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:80" 2>/dev/null || echo "000")
if [ "$HTTP_FE" = "200" ]; then
  ok "Frontend respondendo (HTTP 200)"
else
  warn "Frontend retornou HTTP ${HTTP_FE} — verifique: docker compose logs frontend"
fi

# ── Health check da Evolution API ─────────────────────────────
HTTP_EVO=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "apikey: $(grep -E '^EVOLUTION_API_KEY=' .env | cut -d= -f2)" \
  "http://localhost:8080/instance/fetchInstances" 2>/dev/null || echo "000")
if [ "$HTTP_EVO" = "200" ]; then
  ok "Evolution API respondendo (HTTP 200)"
else
  warn "Evolution API retornou HTTP ${HTTP_EVO} — verifique: docker compose logs evolution"
fi

SERVER_IP_VAL=$(grep -E "^SERVER_IP=" .env | cut -d= -f2)

echo ""
echo "======================================================"
echo "  Deploy concluído!"
echo "======================================================"
echo ""
echo "  Frontend:      http://${SERVER_IP_VAL}"
echo "  Backend API:   http://${SERVER_IP_VAL}:${BACKEND_PORT_VAL:-4010}/api/health"
echo "  Evolution API: http://${SERVER_IP_VAL}:8080"
echo ""
echo "  Logs:  docker compose logs -f [backend|frontend|evolution]"
echo "  Stop:  docker compose down"
echo "  Restart: docker compose restart [serviço]"
echo ""
