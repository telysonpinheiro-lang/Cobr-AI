require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_, res) => res.json({ ok: true, name: 'cobr-ai' }));

app.use('/api/auth', authRoutes);
app.use('/api/debtors', debtorRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/admin',   adminRoutes);

// gatilho manual da régua (útil em dev)
app.post('/api/scheduler/run', async (_, res) => {
  try {
    const r = await runDunningOnce();
    res.json(r);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 404
app.use((req, res) => res.status(404).json({ error: 'not found' }));
// erro
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'internal error' });
});

// ---------------------------------------------------------------------
// Bootstrap: cria empresa + usuário demo na primeira execução.
// Login: demo@cobrai.com / demo123
// ---------------------------------------------------------------------
async function bootstrapDemo() {
  try {
    const [users] = await pool.query('SELECT id FROM users LIMIT 1');
    if (users.length) return;

    // empresa demo
    const [r] = await pool.query(
      'INSERT INTO companies (name, plan, monthly_price, status) VALUES ("Empresa Demo", "starter", 0, "active")'
    );
    const companyId = r.insertId;
    await pool.query('INSERT IGNORE INTO settings (company_id) VALUES (?)', [companyId]);

    const hash = await bcrypt.hash('demo123', 10);
    await pool.query(
      `INSERT INTO users (company_id, name, email, password_hash, role)
       VALUES (?, "Admin Demo", "demo@cobrai.com", ?, "owner")`,
      [companyId, hash]
    );

    // super admin (acesso ao painel administrativo)
    const [sadmin] = await pool.query('SELECT id FROM companies WHERE id = 1 LIMIT 1');
    const superHash = await bcrypt.hash('admin123', 10);
    await pool.query(
      `INSERT INTO users (company_id, name, email, password_hash, role, is_super_admin)
       VALUES (?, "Super Admin", "admin@cobrai.com", ?, "owner", 1)`,
      [companyId, superHash]
    );

    console.log('[bootstrap] demo@cobrai.com / demo123');
    console.log('[bootstrap] admin@cobrai.com / admin123  (super admin)');
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
