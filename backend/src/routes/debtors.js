const express = require('express');
const multer = require('multer');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { parseDebtorsFile } = require('../utils/csv');
const { generateReply } = require('../services/ai');
const { sendMessage } = require('../services/whatsapp');
const { createCharge } = require('../services/payment');
const { getCompanyConfig } = require('../services/companyConfig');

const router = express.Router();
router.use(authRequired);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// LISTAR
router.get('/', async (req, res) => {
  const { status, q } = req.query;
  const params = [req.user.companyId];
  let sql = 'SELECT * FROM debtors WHERE company_id = ?';
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (q)      { sql += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
});

// DETALHE + histórico
router.get('/:id', async (req, res) => {
  const [[debtor]] = await pool.query(
    'SELECT * FROM debtors WHERE id = ? AND company_id = ?',
    [req.params.id, req.user.companyId]
  );
  if (!debtor) return res.status(404).json({ error: 'não encontrado' });
  const [messages] = await pool.query(
    'SELECT * FROM messages WHERE debtor_id = ? ORDER BY created_at ASC', [debtor.id]
  );
  const [deals] = await pool.query(
    'SELECT * FROM deals WHERE debtor_id = ? ORDER BY created_at DESC', [debtor.id]
  );
  const [payments] = await pool.query(
    'SELECT * FROM payments WHERE debtor_id = ? ORDER BY created_at DESC', [debtor.id]
  );
  res.json({ debtor, messages, deals, payments });
});

// CRIAR (avulso)
router.post('/', async (req, res) => {
  const { name, phone, amount, due_date, installments = 1 } = req.body || {};
  if (!name || !phone || !amount || !due_date) {
    return res.status(400).json({ error: 'campos obrigatórios ausentes' });
  }
  try {
    const [r] = await pool.query(
      `INSERT INTO debtors (company_id, name, phone, amount, due_date, installments)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.companyId, name, phone, amount, due_date, installments]
    );
    res.json({ id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'telefone já cadastrado' });
    res.status(500).json({ error: err.message });
  }
});

// ATUALIZAR STATUS
router.patch('/:id', async (req, res) => {
  const { status } = req.body || {};
  const allowed = ['nao_contatado','em_conversa','negociando','aguardando_pagamento','pago','ignorado'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'status inválido' });
  await pool.query(
    'UPDATE debtors SET status = ? WHERE id = ? AND company_id = ?',
    [status, req.params.id, req.user.companyId]
  );
  res.json({ ok: true });
});

// UPLOAD CSV/XLSX
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'arquivo ausente' });
  const { valid, errors } = parseDebtorsFile(req.file.buffer, req.file.originalname);

  let inserted = 0, duplicates = 0;
  for (const d of valid) {
    try {
      await pool.query(
        `INSERT INTO debtors (company_id, name, phone, amount, due_date, installments)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.companyId, d.name, d.phone, d.amount, d.due_date, d.installments]
      );
      inserted++;
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') duplicates++;
      else throw err;
    }
  }
  res.json({ inserted, duplicates, errors, total: valid.length });
});

// ENVIAR MENSAGEM MANUAL (operador) — passa pela IA
router.post('/:id/send', async (req, res) => {
  const { body } = req.body || {};
  const [[debtor]] = await pool.query(
    'SELECT * FROM debtors WHERE id = ? AND company_id = ?',
    [req.params.id, req.user.companyId]
  );
  if (!debtor) return res.status(404).json({ error: 'não encontrado' });

  const text = body || `Olá ${debtor.name}, tudo bem? Notamos um valor em aberto e queremos ajudar a regularizar.`;
  const companyConfig = await getCompanyConfig(req.user.companyId);
  const { providerId } = await sendMessage({ to: debtor.phone, body: text, companyConfig });
  await pool.query(
    'INSERT INTO messages (debtor_id, direction, body, provider_id) VALUES (?, "out", ?, ?)',
    [debtor.id, text, providerId]
  );
  await pool.query(
    `UPDATE debtors SET status = IF(status='nao_contatado','em_conversa',status), last_contact_at = NOW() WHERE id = ?`,
    [debtor.id]
  );
  res.json({ ok: true });
});

// GERAR LINK DE PAGAMENTO
router.post('/:id/payment', async (req, res) => {
  const { amount, method = 'pix', dealId } = req.body || {};
  const [[debtor]] = await pool.query(
    'SELECT * FROM debtors WHERE id = ? AND company_id = ?',
    [req.params.id, req.user.companyId]
  );
  if (!debtor) return res.status(404).json({ error: 'não encontrado' });

  const value = amount || debtor.amount;
  const companyConfig = await getCompanyConfig(req.user.companyId);
  const charge = await createCharge({ debtor, amount: value, method, companyConfig });
  const [r] = await pool.query(
    `INSERT INTO payments (debtor_id, deal_id, amount, method, provider, provider_id, link, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente')`,
    [debtor.id, dealId || null, value, method, charge.provider, charge.providerId, charge.link]
  );
  await pool.query(
    `UPDATE debtors SET status = 'aguardando_pagamento' WHERE id = ?`, [debtor.id]
  );

  // envia o link no WhatsApp
  const msg = `Aqui está seu link de pagamento (${method.toUpperCase()}): ${charge.link}`;
  const { providerId } = await sendMessage({ to: debtor.phone, body: msg, companyConfig });
  await pool.query(
    'INSERT INTO messages (debtor_id, direction, body, provider_id) VALUES (?, "out", ?, ?)',
    [debtor.id, msg, providerId]
  );

  res.json({ paymentId: r.insertId, charge });
});

// MARCAR PAGAMENTO COMO PAGO (mock / manual)
router.post('/:id/payment/:paymentId/confirm', async (req, res) => {
  await pool.query(
    `UPDATE payments SET status = 'pago', paid_at = NOW() WHERE id = ? AND debtor_id = ?`,
    [req.params.paymentId, req.params.id]
  );
  await pool.query(`UPDATE debtors SET status = 'pago' WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
