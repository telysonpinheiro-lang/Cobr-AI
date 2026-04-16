require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const pool = require('./config/db');

const authRoutes = require('./routes/auth');
const debtorRoutes = require('./routes/debtors');
const clientRoutes = require('./routes/clients');
const dashboardRoutes = require('./routes/dashboard');
const settingsRoutes = require('./routes/settings');
const webhookRoutes = require('./routes/webhook');
const adminRoutes   = require('./routes/admin');

const { startScheduler, runDunningOnce } = require('./services/scheduler');
const { runMigrations } = require('./services/migrate');
const { apiLimiter } = require('./middleware/security');

const app = express();

// Confia no proxy reverso Nginx (necessário para express-rate-limit funcionar corretamente)
app.set('trust proxy', 1);

// ─── Security Headers (helmet) ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // evita quebrar alguns clientes
}));

// ─── CORS ────────────────────────────────────────────────────────────────────
// Nunca cai para '*'. Exige que CORS_ORIGIN esteja configurado.
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn('[security] CORS_ORIGIN não configurado — CORS bloqueado por padrão');
}

app.use(cors({
  origin(origin, cb) {
    // permite requisições sem origin (curl, mobile, server-to-server)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`Origin não permitida: ${origin}`));
  },
  credentials: true,
}));

// ─── Body Parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' })); // reduzido de 5mb para 1mb

// ─── Rate Limiting Global ────────────────────────────────────────────────────
app.use('/api/', apiLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true, name: 'cobr-ai' }));

app.use('/api/auth', authRoutes);
app.use('/api/debtors', debtorRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/admin',   adminRoutes);

// gatilho manual da régua — apenas super admins
const { authRequired, superAdminRequired } = require('./middleware/auth');
app.post('/api/scheduler/run', authRequired, superAdminRequired, async (_, res) => {
  try {
    const r = await runDunningOnce();
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'not found' }));

// ─── Error Handler (sem vazar detalhes em produção) ──────────────────────────
app.use((err, req, res, _next) => {
  // Loga o erro completo apenas no servidor
  console.error('[error]', err.message);
  // Em produção, retorna mensagem genérica
  const message = process.env.NODE_ENV === 'production'
    ? 'erro interno do servidor'
    : (err.message || 'internal error');
  res.status(500).json({ error: message });
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────
// Cria empresa + usuário demo na primeira execução.
// IMPORTANTE: altere as senhas padrão imediatamente após o primeiro login.
const BCRYPT_ROUNDS = 12;

async function bootstrapDemo() {
  try {
    const [companies] = await pool.query('SELECT id FROM companies LIMIT 1');
    if (companies.length) return;
    await pool.query(
      'INSERT INTO companies (name, plan, monthly_price, status) VALUES ("VirtualCore", "pro", 0, "active")'
    );
    console.log('[bootstrap] empresa padrão criada. Crie usuários via painel admin.');
  } catch (err) {
    console.error('[bootstrap] falhou:', err.message);
  }
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`[cobr-ai] backend ouvindo em http://localhost:${PORT}`);
  await runMigrations();
  await bootstrapDemo();
  startScheduler();
});
