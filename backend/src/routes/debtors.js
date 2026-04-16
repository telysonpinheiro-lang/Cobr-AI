const express = require('express');
const multer = require('multer');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { parseDebtorsFile } = require('../utils/csv');
const { generateReply } = require('../services/ai');
const { sendMessage } = require('../services/whatsapp');
const { createCharge } = require('../services/payment');
const { getCompanyConfig } = require('../services/companyConfig');
const { sanitizeSearchParam } = require('../middleware/security');

const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authRequired);

// Tipos MIME permitidos para upload
const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const ALLOWED_EXTENSIONS = new Set(['csv', 'xlsx', 'xls']);

function fileFilter(req, file, cb) {
  const ext = (file.originalname || '').toLowerCase().split('.').pop();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error('tipo de arquivo não permitido: use CSV, XLS ou XLSX'));
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    // Alguns navegadores enviam MIME genérico para CSV — aceita mas valida extensão
    if (!['text/csv', 'application/octet-stream', 'application/csv'].includes(file.mimetype) && ext !== 'csv') {
      return cb(new Error('tipo de arquivo não permitido'));
    }
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // reduzido de 10MB para 5MB
  fileFilter,
});

// LISTAR
router.get('/', asyncHandler(async (req, res) => {
  const { status } = req.query;
  const q = sanitizeSearchParam(req.query.q, 100);

  const ALLOWED_STATUSES = new Set([
    'nao_contatado', 'em_conversa', 'negociando',
    'aguardando_pagamento', 'pago', 'ignorado',
  ]);

  const params = [req.user.companyId];
  let sql = 'SELECT * FROM debtors WHERE company_id = ?';
  if (status) {
    if (!ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ error: 'status inválido' });
    }
    sql += ' AND status = ?';
    params.push(status);
  }
  if (q) { sql += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}));

// DETALHE + histórico
router.get('/:id', asyncHandler(async (req, res) => {
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
}));

// CRIAR (avulso)
router.post('/', async (req, res) => {
  const { name, phone, amount, due_date, installments = 1 } = req.body || {};
  if (!name || !phone || !amount || !due_date) {
    return res.status(400).json({ error: 'campos obrigatórios ausentes' });
  }

  // Validações de tipo e faixa
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 200) {
    return res.status(400).json({ error: 'nome inválido' });
  }
  const parsedAmount = Number(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 10_000_000) {
    return res.status(400).json({ error: 'valor inválido (deve ser entre 0,01 e 10.000.000)' });
  }
  const parsedInstallments = Number(installments);
  if (!Number.isInteger(parsedInstallments) || parsedInstallments < 1 || parsedInstallments > 360) {
    return res.status(400).json({ error: 'parcelas inválidas (1–360)' });
  }

  try {
    const [r] = await pool.query(
      `INSERT INTO debtors (company_id, name, phone, amount, due_date, installments)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.companyId, name.trim(), phone, parsedAmount, due_date, parsedInstallments]
    );
    res.json({ id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'telefone já cadastrado' });
    res.status(500).json({ error: 'erro ao criar devedor' });
  }
});

// ATUALIZAR STATUS
router.patch('/:id', asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  const allowed = ['nao_contatado','em_conversa','negociando','aguardando_pagamento','pago','ignorado'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'status inválido' });
  await pool.query(
    'UPDATE debtors SET status = ? WHERE id = ? AND company_id = ?',
    [status, req.params.id, req.user.companyId]
  );
  res.json({ ok: true });
}));

// UPLOAD CSV/XLSX
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'arquivo ausente' });

  try {
    const { valid, errors } = await parseDebtorsFile(req.file.buffer, req.file.originalname);

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
  } catch (err) {
    res.status(400).json({ error: 'erro ao processar arquivo: ' + err.message });
  }
});

// Multer error handler
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message?.includes('tipo de arquivo')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ENVIAR MENSAGEM MANUAL (operador) — passa pela IA
router.post('/:id/send', asyncHandler(async (req, res) => {
  const { body } = req.body || {};
  const [[debtor]] = await pool.query(
    'SELECT * FROM debtors WHERE id = ? AND company_id = ?',
    [req.params.id, req.user.companyId]
  );
  if (!debtor) return res.status(404).json({ error: 'não encontrado' });

  const text = (body && typeof body === 'string')
    ? body.slice(0, 2000)
    : `Olá ${debtor.name}, tudo bem? Notamos um valor em aberto e queremos ajudar a regularizar.`;

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
}));

// GERAR LINK DE PAGAMENTO
router.post('/:id/payment', asyncHandler(async (req, res) => {
  const { amount, method = 'pix', dealId } = req.body || {};
  const [[debtor]] = await pool.query(
    'SELECT * FROM debtors WHERE id = ? AND company_id = ?',
    [req.params.id, req.user.companyId]
  );
  if (!debtor) return res.status(404).json({ error: 'não encontrado' });

  const value = amount ? Number(amount) : Number(debtor.amount);
  if (isNaN(value) || value <= 0 || value > 10_000_000) {
    return res.status(400).json({ error: 'valor de pagamento inválido' });
  }

  const allowedMethods = ['pix', 'boleto', 'credit_card'];
  if (!allowedMethods.includes(method)) {
    return res.status(400).json({ error: 'método de pagamento inválido' });
  }

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

  const msg = `Aqui está seu link de pagamento (${method.toUpperCase()}): ${charge.link}`;
  const { providerId } = await sendMessage({ to: debtor.phone, body: msg, companyConfig });
  await pool.query(
    'INSERT INTO messages (debtor_id, direction, body, provider_id) VALUES (?, "out", ?, ?)',
    [debtor.id, msg, providerId]
  );

  res.json({ paymentId: r.insertId, charge });
}));

// MARCAR PAGAMENTO COMO PAGO (mock / manual)
router.post('/:id/payment/:paymentId/confirm', asyncHandler(async (req, res) => {
  // Verifica que o devedor pertence à empresa do usuário antes de confirmar
  const [[debtor]] = await pool.query(
    'SELECT id FROM debtors WHERE id = ? AND company_id = ?',
    [req.params.id, req.user.companyId]
  );
  if (!debtor) return res.status(404).json({ error: 'não encontrado' });

  await pool.query(
    `UPDATE payments SET status = 'pago', paid_at = NOW() WHERE id = ? AND debtor_id = ?`,
    [req.params.paymentId, req.params.id]
  );
  await pool.query(`UPDATE debtors SET status = 'pago' WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
