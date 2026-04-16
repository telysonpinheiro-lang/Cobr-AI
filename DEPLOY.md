# Deploy — Evolution API no Servidor Contabo

Guia completo para instalar Docker e subir a Evolution API + Redis no servidor.

---

## Pré-requisitos

| Item | Valor |
|------|-------|
| OS do servidor | Ubuntu 22.04 LTS (Contabo) |
| Acesso | SSH como root |
| Porta liberada | **8080** (Evolution API) |

---

## PASSO 1 — Conectar ao servidor via SSH

```bash
ssh root@SEU_IP_CONTABO
```

---

## PASSO 2 — Instalar Docker

Copie o script para o servidor e execute:

```bash
# No seu PC (terminal local)
scp scripts/install-docker.sh root@SEU_IP:/root/

# No servidor
bash /root/install-docker.sh
```

Verifique:
```bash
docker --version
docker compose version
```

---

## PASSO 3 — Enviar os arquivos para o servidor

```bash
# No seu PC — copie o docker-compose e o script de setup
scp docker-compose.yml root@SEU_IP:/opt/cobrai/
scp scripts/setup-evolution.sh root@SEU_IP:/opt/cobrai/
```

---

## PASSO 4 — Configurar e subir a Evolution API

```bash
# No servidor
cd /opt/cobrai

# Defina o IP do servidor antes de rodar
export SERVER_IP="SEU_IP_CONTABO"

bash setup-evolution.sh
```

O script irá:
- Gerar senhas aleatórias e salvar em `/opt/cobrai/.env`
- Baixar as imagens Docker
- Subir Redis + Evolution API
- Exibir as credenciais para usar no backend

**Anote as credenciais exibidas ao final do script.**

---

## PASSO 5 — Criar a instância WhatsApp

```bash
# No servidor — substitua SUA_API_KEY pela chave gerada no passo anterior
curl -s -X POST http://localhost:8080/instance/create \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"instanceName":"cobrai","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'
```

Resposta esperada:
```json
{"instance":{"instanceName":"cobrai","status":"created"},"hash":{"apikey":"..."},"qrcode":{"base64":"..."}}
```

---

## PASSO 6 — Ler o QR Code e conectar o WhatsApp

```bash
curl -s http://localhost:8080/instance/connect/cobrai \
  -H "apikey: SUA_API_KEY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('Abra o WhatsApp > Aparelhos conectados > Escanear QR Code')
print(d.get('base64','sem qr code'))
"
```

Ou acesse via navegador:
```
http://SEU_IP:8080/instance/connect/cobrai
Header: apikey: SUA_API_KEY
```

Escaneie o QR Code com o WhatsApp do número que enviará as cobranças.

---

## PASSO 7 — Verificar conexão

```bash
curl -s http://localhost:8080/instance/connectionState/cobrai \
  -H "apikey: SUA_API_KEY"
```

Resposta esperada:
```json
{"instance":{"instanceName":"cobrai","state":"open"}}
```

`"state":"open"` = WhatsApp conectado com sucesso.

---

## PASSO 8 — Atualizar o backend Cobr-AI

Edite `backend/.env` com os valores gerados:

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_BASE_URL=http://SEU_IP:8080
EVOLUTION_API_KEY=chave_gerada_pelo_setup
EVOLUTION_INSTANCE=cobrai
```

Reinicie o backend:
```bash
# Se estiver rodando com PM2
pm2 restart cobrai-backend

# Se estiver rodando direto
cd backend && npm start
```

---

## Comandos úteis no servidor

```bash
# Ver status dos containers
docker compose -f /opt/cobrai/docker-compose.yml ps

# Ver logs da Evolution API
docker compose -f /opt/cobrai/docker-compose.yml logs -f evolution

# Ver logs do Redis
docker compose -f /opt/cobrai/docker-compose.yml logs -f redis

# Reiniciar tudo
docker compose -f /opt/cobrai/docker-compose.yml restart

# Parar tudo
docker compose -f /opt/cobrai/docker-compose.yml down

# Atualizar Evolution API para versão mais recente
docker compose -f /opt/cobrai/docker-compose.yml pull
docker compose -f /opt/cobrai/docker-compose.yml up -d
```

---

## Firewall — liberar porta 8080

Se o Contabo tiver firewall ativo (UFW):

```bash
ufw allow 8080/tcp
ufw status
```

> **Segurança:** em produção, considere colocar a Evolution API atrás de um
> reverse proxy (Nginx + SSL) e bloquear acesso externo direto à porta 8080,
> deixando apenas o backend Cobr-AI se comunicar internamente.

---

## Resumo dos arquivos criados

| Arquivo | Finalidade |
|---------|-----------|
| `docker-compose.yml` | Sobe Redis + Evolution API |
| `scripts/install-docker.sh` | Instala Docker no Ubuntu |
| `scripts/setup-evolution.sh` | Configura e inicia os containers |
| `backend/.env` | Variáveis de ambiente do backend |
| `DEPLOY.md` | Este guia |
