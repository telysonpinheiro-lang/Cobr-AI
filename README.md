# Cobr-AI

SaaS de **recuperação automática de inadimplência via WhatsApp com IA**.

Plataforma onde empresas (clínicas, academias, escolas, provedores, etc.) sobem
sua lista de inadimplentes e o Cobr-AI faz a cobrança automática por WhatsApp,
negocia com o devedor usando GPT, gera o link de pagamento e atualiza tudo num
dashboard simples.

---

## ✨ Funcionalidades do MVP

1. Upload de inadimplentes via CSV/Excel (com validação de telefone, valor e dedupe)
2. Dashboard com total em aberto, total recuperado e taxa de conversão
3. Régua de cobrança automática (D+1, D+3, D+7 — configurável)
4. Integração modular com WhatsApp (Z-API / Evolution API — mock incluso)
5. Agente de IA para negociação (OpenAI GPT — mock incluso)
6. Geração de link de pagamento (Asaas / Pagar.me — mock incluso)
7. Regras de negociação configuráveis (desconto máx, parcelas máx)
8. Histórico completo de mensagens, acordos e pagamentos
9. Painel de configurações por cliente (tom, desconto, horários, dias da régua)
10. Autenticação JWT + multi-tenant por `company_id`

---

## 🧱 Stack

| Camada    | Tecnologia                          |
| --------- | ----------------------------------- |
| Backend   | Node.js + Express                   |
| Frontend  | React + Vite                        |
| Banco     | MySQL (compatível com phpMyAdmin)   |
| IA        | OpenAI API (GPT-4o-mini por padrão) |
| WhatsApp  | Z-API / Evolution API (interface modular) |
| Pagamento | Asaas / Pagar.me (interface modular) |
| Auth      | JWT + bcrypt                        |

---

## 📁 Estrutura

```
Cobr-ai/
├── backend/
│   ├── src/
│   │   ├── index.js              # entrypoint Express
│   │   ├── config/db.js          # pool MySQL
│   │   ├── middleware/auth.js    # JWT
│   │   ├── routes/               # auth, debtors, dashboard, settings, webhook, payments
│   │   ├── services/             # whatsapp, ai, payment, scheduler (régua)
│   │   └── utils/                # csv parser, validators
│   ├── db/schema.sql             # rode no phpMyAdmin
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/                # Login, Dashboard, Upload, Debtors, Settings
│   │   ├── components/Layout.jsx
│   │   ├── api.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---

## 🚀 Como rodar localmente

### 1. Banco de dados (phpMyAdmin / MySQL)

1. Abra o phpMyAdmin
2. Crie o banco `cobrai`
3. Importe `backend/db/schema.sql`

### 2. Backend

```bash
cd backend
cp .env.example .env     # ajuste credenciais
npm install
npm run dev
```

API sobe em `http://localhost:4000`.

> O scheduler da régua roda a cada 1 hora dentro do próprio processo Node.
> Para forçar rodada manual: `POST http://localhost:4000/api/scheduler/run`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App sobe em `http://localhost:5173`.

### 4. Login inicial

O `schema.sql` já cria uma empresa demo:

- email: `demo@cobrai.com`
- senha: `demo123`

---

## 🔌 Configurando integrações reais

Tudo é **mockado por padrão** — o sistema funciona sem chaves de API.
Para habilitar provedores reais, edite o `.env`:

```env
# OpenAI (IA)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# WhatsApp (Z-API exemplo)
WHATSAPP_PROVIDER=zapi          # zapi | evolution | mock
ZAPI_INSTANCE=...
ZAPI_TOKEN=...

# Pagamento
PAYMENT_PROVIDER=asaas          # asaas | pagarme | mock
ASAAS_API_KEY=...
```

Os providers ficam em `backend/src/services/whatsapp.js`, `ai.js` e `payment.js`
e seguem uma interface estável — basta plugar a chamada HTTP real.

---

## 💰 Modelo de negócio (suportado pelo schema)

- **Assinatura**: campo `companies.plan` (free/starter/pro)
- **Por uso**: tabela `messages` permite billing por mensagem enviada
- **% sobre recuperado**: somatório de `payments.amount` × % do plano

---

## ☁️ Sugestões de deploy

| Camada    | Sugestão                             |
| --------- | ------------------------------------ |
| Backend   | Railway, Render, Fly.io              |
| Frontend  | Vercel, Netlify                      |
| Banco     | Railway MySQL, PlanetScale, AWS RDS  |
| Webhooks  | Cloudflare Tunnel / ngrok p/ dev     |

Variáveis de ambiente do backend devem ser configuradas no provedor.
O frontend só precisa de `VITE_API_URL` apontando para o backend.
