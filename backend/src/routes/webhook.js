// Webhook que recebe mensagens do provedor de WhatsApp e dispara a IA.
// Formato esperado (normalize aqui o payload do seu provedor):
//   POST /api/webhook/whatsapp { phone: "5511...", body: "texto" }

const express = require('express');
const pool = require('../config/db');
const { generateReply } = require('../services/ai');
const { sendMessage } = require('../services/whatsapp');
const { createCharge } = require('../services/payment');
const { getCompanyConfig } = require('../services/companyConfig');

const router = express.Router();

router.post('/whatsapp', async (req, res) => {
  try {
    // Adapte o parser conforme seu provedor (Z-API, Evolution, etc.)
    const phone = String(req.body.phone || req.body.from || '').replace(/\D/g, '');
    const body = req.body.body || req.body.text || req.body.message || '';
    if (!phone || !body) return res.status(400).json({ error: 'payload inválido' });

    const [[debtor]] = await pool.query(
      'SELECT * FROM debtors WHERE phone = ? LIMIT 1', [phone]
    );
    if (!debtor) {
      console.warn('[webhook] devedor não encontrado para', phone);
      return res.json({ ok: true, ignored: true });
    }

    const [[settings]] = await pool.query(
      'SELECT * FROM settings WHERE company_id = ?', [debtor.company_id]
    );
    const companyConfig = await getCompanyConfig(debtor.company_id);

    // grava mensagem recebida
    await pool.query(
      'INSERT INTO messages (debtor_id, direction, body) VALUES (?, "in", ?)',
      [debtor.id, body]
    );

    const [history] = await pool.query(
      'SELECT direction, body FROM messages WHERE debtor_id = ? ORDER BY created_at ASC LIMIT 30',
      [debtor.id]
    );

    const { reply, deal } = await generateReply({
      debtor, settings, history, lastUserMessage: body, companyConfig,
    });

    // Se a IA fechou um acordo, persiste e gera link de pagamento
    if (deal && deal.final_amount) {
      const discount = Number(deal.discount_pct || 0);
      const installments = Number(deal.installments || 1);
      const finalAmount = Number(deal.final_amount);

      // valida limites
      if (discount <= Number(settings.max_discount) &&
          installments <= Number(settings.max_installments)) {
        const [d] = await pool.query(
          `INSERT INTO deals (debtor_id, original_amount, final_amount, discount_pct, installments, status)
           VALUES (?, ?, ?, ?, ?, 'aceito')`,
          [debtor.id, debtor.amount, finalAmount, discount, installments]
        );
        const charge = await createCharge({ debtor, amount: finalAmount, method: 'pix', companyConfig });
        await pool.query(
          `INSERT INTO payments (debtor_id, deal_id, amount, method, provider, provider_id, link)
           VALUES (?, ?, ?, 'pix', ?, ?, ?)`,
          [debtor.id, d.insertId, finalAmount, charge.provider, charge.providerId, charge.link]
        );
        await pool.query(
          `UPDATE debtors SET status = 'aguardando_pagamento' WHERE id = ?`, [debtor.id]
        );

        const replyWithLink = `${reply}\n\nSegue o PIX: ${charge.link}`;
        const sent = await sendMessage({ to: debtor.phone, body: replyWithLink, companyConfig });
        await pool.query(
          'INSERT INTO messages (debtor_id, direction, body, provider_id) VALUES (?, "out", ?, ?)',
          [debtor.id, replyWithLink, sent.providerId]
        );
        return res.json({ ok: true, dealId: d.insertId });
      }
    }

    // resposta normal
    const sent = await sendMessage({ to: debtor.phone, body: reply, companyConfig });
    await pool.query(
      'INSERT INTO messages (debtor_id, direction, body, provider_id) VALUES (?, "out", ?, ?)',
      [debtor.id, reply, sent.providerId]
    );
    await pool.query(
      `UPDATE debtors SET status = 'negociando', last_contact_at = NOW() WHERE id = ?`,
      [debtor.id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[webhook] erro', err);
    res.status(500).json({ error: err.message });
  }
});

// Webhook de pagamento — chamado pelo gateway quando pagamento é confirmado
router.post('/payment', async (req, res) => {
  const providerId = req.body.providerId || req.body.id;
  if (!providerId) return res.status(400).json({ error: 'providerId ausente' });
  const [[payment]] = await pool.query(
    'SELECT * FROM payments WHERE provider_id = ?', [providerId]
  );
  if (!payment) return res.status(404).json({ error: 'pagamento não encontrado' });
  await pool.query(
    `UPDATE payments SET status = 'pago', paid_at = NOW() WHERE id = ?`, [payment.id]
  );
  await pool.query(`UPDATE debtors SET status = 'pago' WHERE id = ?`, [payment.debtor_id]);
  res.json({ ok: true });
});

module.exports = router;
