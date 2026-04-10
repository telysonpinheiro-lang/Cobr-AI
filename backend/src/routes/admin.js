// Painel administrativo do SaaS — apenas super admins.
//
// Endpoints:
//   GET    /api/admin/companies              lista todas as empresas + métricas
//   POST   /api/admin/companies              cria empresa + owner
//   GET    /api/admin/companies/:id          detalhe empresa
//   PUT    /api/admin/companies/:id          atualiza empresa (plano, preço, status, providers)
//   DELETE /api/admin/companies/:id          remove empresa (soft: suspended)
//
//   GET    /api/admin/companies/:id/users    lista usuários da empresa
//   POST   /api/admin/companies/:id/users    cria usuário na empresa
//   DELETE /api/admin/companies/:id/users/:uid  remove usuário
//
//   GET    /api/admin/stats                  números globais do SaaS

const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { authRequired, superAdminRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, superAdminRequired);

// ─── ESTATÍSTICAS GLOBAIS ─────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const [[companies]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(status = 'active') AS active,
            SUM(status = 'suspended') AS suspended,
            COALESCE(SUM(monthly_price), 0) AS mrr
     FROM companies`
  );
  const [[debtors]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(status = 'pago') AS paid,
            COALESCE(SUM(CASE WHEN status = 'pago' THEN amount END), 0) AS recovered
     FROM debtors`
  );
  const [[messages]] = await pool.query('SELECT COUNT(*) AS total FROM messages');
  res.json({
    companies: {
      total: Number(companies.total),
      active: Number(companies.active),
      suspended: Number(companies.suspended),
      mrr: Number(companies.mrr),
    },
    debtors: {
      total: Number(debtors.total),
      paid: Number(debtors.paid),
      recovered: Number(debtors.recovered),
    },
    messages: Number(messages.total),
  });
});

// ─── LISTAR EMPRESAS ──────────────────────────────────────────────────────────
router.get('/companies', async (req, res) => {
  const { q } = req.query;
  let sql = `
    SELECT c.*,
           COUNT(DISTINCT u.id)  AS users_count,
           COUNT(DISTINCT d.id)  AS debtors_count,
           COALESCE(SUM(CASE WHEN d.status = 'pago' THEN d.amount END), 0) AS recovered
    FROM companies c
    LEFT JOIN users u ON u.company_id = c.id
    LEFT JOIN debtors d ON d.company_id = c.id
    WHERE 1=1`;
  const params = [];
  if (q) { sql += ' AND c.name LIKE ?'; params.push(`%${q}%`); }
  sql += ' GROUP BY c.id ORDER BY c.id DESC LIMIT 200';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// ─── CRIAR EMPRESA ────────────────────────────────────────────────────────────
router.post('/companies', async (req, res) => {
  const {
    name, plan = 'free', monthly_price = 0,
    owner_name, owner_email, owner_password,
    whatsapp_provider, payment_provider, openai_api_key, openai_model,
  } = req.body || {};

  if (!name || !owner_name || !owner_email || !owner_password) {
    return res.status(400).json({ error: 'campos obrigatórios: name, owner_name, owner_email, owner_password' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [c] = await conn.query(
      `INSERT INTO companies (name, plan, monthly_price, status,
         whatsapp_provider, payment_provider, openai_api_key, openai_model)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
      [name, plan, monthly_price,
       whatsapp_provider || null, payment_provider || null,
       openai_api_key || null, openai_model || null]
    );
    await conn.query('INSERT INTO settings (company_id) VALUES (?)', [c.insertId]);
    const hash = await bcrypt.hash(owner_password, 10);
    await conn.query(
      `INSERT INTO users (company_id, name, email, password_hash, role)
       VALUES (?, ?, ?, ?, 'owner')`,
      [c.insertId, owner_name, owner_email, hash]
    );
    await conn.commit();
    res.json({ id: c.insertId });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'email já cadastrado' });
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ─── DETALHE EMPRESA ─────────────────────────────────────────────────────────
router.get('/companies/:id', async (req, res) => {
  const [[company]] = await pool.query('SELECT * FROM companies WHERE id = ?', [req.params.id]);
  if (!company) return res.status(404).json({ error: 'não encontrada' });
  const [users] = await pool.query(
    'SELECT id, name, email, role, is_super_admin, created_at FROM users WHERE company_id = ?',
    [req.params.id]
  );
  const [[metrics]] = await pool.query(
    `SELECT COUNT(*) AS debtors_count,
            COALESCE(SUM(amount), 0) AS total_amount,
            COALESCE(SUM(CASE WHEN status='pago' THEN amount END), 0) AS recovered
     FROM debtors WHERE company_id = ?`,
    [req.params.id]
  );
  res.json({ company, users, metrics });
});

// ─── ATUALIZAR EMPRESA ────────────────────────────────────────────────────────
router.put('/companies/:id', async (req, res) => {
  const allowed = [
    'name', 'plan', 'monthly_price', 'revenue_share', 'status',
    'whatsapp_provider', 'payment_provider', 'openai_api_key', 'openai_model',
  ];
  const updates = [];
  const values = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      updates.push(`${k} = ?`);
      values.push(req.body[k] === '' ? null : req.body[k]);
    }
  }
  if (!updates.length) return res.json({ ok: true });
  values.push(req.params.id);
  await pool.query(`UPDATE companies SET ${updates.join(', ')} WHERE id = ?`, values);
  res.json({ ok: true });
});

// ─── SUSPENDER EMPRESA ────────────────────────────────────────────────────────
// Suspender (soft)
router.delete('/companies/:id', async (req, res) => {
  await pool.query(`UPDATE companies SET status = 'suspended' WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

// Excluir permanentemente (hard delete — remove empresa, usuários, devedores, etc.)
router.delete('/companies/:id/destroy', async (req, res) => {
  const id = req.params.id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Ordem: mensagens → pagamentos → deals → dunning_log → debtors → settings → users → company
    await conn.query(`DELETE m FROM messages m JOIN debtors d ON d.id = m.debtor_id WHERE d.company_id = ?`, [id]);
    await conn.query(`DELETE p FROM payments p JOIN debtors d ON d.id = p.debtor_id WHERE d.company_id = ?`, [id]);
    await conn.query(`DELETE dl FROM deals dl JOIN debtors d ON d.id = dl.debtor_id WHERE d.company_id = ?`, [id]);
    await conn.query(`DELETE dl FROM dunning_log dl JOIN debtors d ON d.id = dl.debtor_id WHERE d.company_id = ?`, [id]);
    await conn.query(`DELETE FROM debtors WHERE company_id = ?`, [id]);
    await conn.query(`DELETE FROM settings WHERE company_id = ?`, [id]);
    await conn.query(`DELETE FROM users WHERE company_id = ?`, [id]);
    await conn.query(`DELETE FROM companies WHERE id = ?`, [id]);
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ─── USUÁRIOS DE UMA EMPRESA ─────────────────────────────────────────────────
router.get('/companies/:id/users', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, name, email, role, is_super_admin, created_at FROM users WHERE company_id = ?',
    [req.params.id]
  );
  res.json(rows);
});

router.post('/companies/:id/users', async (req, res) => {
  const { name, email, password, role = 'operator' } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'campos obrigatórios' });
  const hash = await bcrypt.hash(password, 10);
  try {
    const [r] = await pool.query(
      'INSERT INTO users (company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, name, email, hash, role]
    );
    res.json({ id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'email já cadastrado' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/companies/:id/users/:uid', async (req, res) => {
  await pool.query('DELETE FROM users WHERE id = ? AND company_id = ?',
    [req.params.uid, req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
