// Módulo de clientes.
//
// "Cliente" no Cobr-AI é uma pessoa única (telefone único dentro da empresa).
// Como o schema já garante UNIQUE (company_id, phone) em `debtors`, derivamos
// a lista de clientes diretamente de `debtors` agrupando por telefone — sem
// precisar de uma tabela separada. Isso mantém tudo sincronizado.
//
// Endpoints:
//   GET    /api/clients              -> lista de clientes com totais
//   GET    /api/clients/:phone       -> cliente + todas as suas dívidas
//   PATCH  /api/clients/:phone       -> renomeia o cliente em todas as dívidas

const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// LISTAR clientes (agrupados por telefone)
router.get('/', async (req, res) => {
  const { q } = req.query;
  const params = [req.user.companyId];
  let where = 'WHERE company_id = ?';
  if (q) {
    where += ' AND (name LIKE ? OR phone LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }

  const [rows] = await pool.query(
    `SELECT
       phone,
       MAX(name) AS name,
       COUNT(*) AS debts_count,
       COALESCE(SUM(amount), 0) AS total_amount,
       COALESCE(SUM(CASE WHEN status NOT IN ('pago','ignorado') THEN amount END), 0) AS open_amount,
       COALESCE(SUM(CASE WHEN status = 'pago' THEN amount END), 0) AS paid_amount,
       SUM(CASE WHEN status NOT IN ('pago','ignorado') THEN 1 ELSE 0 END) AS open_count,
       SUM(CASE WHEN status = 'pago' THEN 1 ELSE 0 END) AS paid_count,
       MAX(created_at) AS last_registered,
       MAX(last_contact_at) AS last_contact_at
     FROM debtors
     ${where}
     GROUP BY phone
     ORDER BY open_amount DESC, last_registered DESC
     LIMIT 500`,
    params
  );
  res.json(rows);
});

// DETALHE de um cliente (telefone) + todas as dívidas
router.get('/:phone', async (req, res) => {
  const { phone } = req.params;
  const [debts] = await pool.query(
    `SELECT * FROM debtors
       WHERE company_id = ? AND phone = ?
       ORDER BY due_date DESC`,
    [req.user.companyId, phone]
  );
  if (!debts.length) return res.status(404).json({ error: 'cliente não encontrado' });

  const debtorIds = debts.map((d) => d.id);
  const placeholders = debtorIds.map(() => '?').join(',');

  const [messages] = await pool.query(
    `SELECT m.*, d.due_date, d.amount AS debt_amount
       FROM messages m
       JOIN debtors d ON d.id = m.debtor_id
      WHERE m.debtor_id IN (${placeholders})
      ORDER BY m.created_at DESC
      LIMIT 30`,
    debtorIds
  );

  const [payments] = await pool.query(
    `SELECT * FROM payments
       WHERE debtor_id IN (${placeholders})
       ORDER BY created_at DESC`,
    debtorIds
  );

  const summary = debts.reduce(
    (acc, d) => {
      const v = Number(d.amount);
      acc.total += v;
      if (d.status === 'pago') acc.paid += v;
      else if (d.status !== 'ignorado') acc.open += v;
      return acc;
    },
    { total: 0, open: 0, paid: 0 }
  );

  res.json({
    client: {
      phone,
      name: debts[0].name,
      debts_count: debts.length,
      total_amount: summary.total,
      open_amount: summary.open,
      paid_amount: summary.paid,
    },
    debts,
    messages,
    payments,
  });
});

// EXCLUIR cliente — remove todas as dívidas e histórico relacionado
router.delete('/:phone', async (req, res) => {
  const phone = req.params.phone;
  const companyId = req.user.companyId;

  const [debtors] = await pool.query(
    'SELECT id FROM debtors WHERE company_id = ? AND phone = ?',
    [companyId, phone]
  );
  if (!debtors.length) return res.status(404).json({ error: 'cliente não encontrado' });

  const ids = debtors.map(d => d.id);
  const ph  = ids.map(() => '?').join(',');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM messages    WHERE debtor_id IN (${ph})`, ids);
    await conn.query(`DELETE FROM payments    WHERE debtor_id IN (${ph})`, ids);
    await conn.query(`DELETE FROM deals       WHERE debtor_id IN (${ph})`, ids);
    await conn.query(`DELETE FROM dunning_log WHERE debtor_id IN (${ph})`, ids);
    await conn.query(`DELETE FROM debtors     WHERE id        IN (${ph})`, ids);
    await conn.commit();
    res.json({ ok: true, removed: ids.length });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// RENOMEAR cliente (atualiza o nome em todas as dívidas dele)
router.patch('/:phone', async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'nome obrigatório' });
  await pool.query(
    'UPDATE debtors SET name = ? WHERE company_id = ? AND phone = ?',
    [name.trim(), req.user.companyId, req.params.phone]
  );
  res.json({ ok: true });
});

module.exports = router;
