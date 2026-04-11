// Webhook que recebe mensagens do provedor de WhatsApp e dispara a IA.
//
// Evolution API — configure na instância:
//   URL: POST http://SEU-BACKEND:4000/api/webhook/whatsapp
//   Eventos: messages.upsert

const express = require('express');
const pool = require('../config/db');
const { generateReply } = require('../services/ai');
const { sendMessage } = require('../services/whatsapp');
const { createCharge } = require('../services/payment');
const { getCompanyConfig } = require('../services/companyConfig');

const router = express.Router();

// Normaliza payloads de diferentes provedores para { phone, body, instance }
function parseWebhookPayload(raw) {
  // Evolution API — evento messages.upsert
  if (raw.event === 'messages.upsert' || raw.data?.key?.remoteJid) {
    const data = raw.data || {};
    // ignora mensagens enviadas pelo próprio bot
    if (data.key?.fromMe) return null;
    // ignora grupos (@g.us)
    if (String(data.key?.remoteJid || '').includes('@g.us')) return null;

    const phone = String(data.key?.remoteJid || '').replace(/@.*/, '').replace(/\D/g, '');
    const msg   = data.message || {};
    const body  =
      msg.conversation ||
      msg.extendedTextMessage?.text ||
      msg.imageMessage?.caption ||
      msg.videoMessage?.caption ||
      '';

    if (!phone || !body) return null;
    return { phone, body, instance: raw.instance || null };
  }

  // Z-API / genérico
  const phone = String(raw.phone || raw.from || '').replace(/\D/g, '');
  const body  = raw.body || raw.text || raw.message || '';
  if (!phone || !body) return null;
  return { phone, body, instance: null };
}

// Encontra o devedor e sua empresa pelo telefone.
// Se a instância for informada, restringe à empresa dona da instância.
async function findDebtor(phone, instance) {
  if (instance) {
    // busca empresa pela instância e depois o devedor dentro dela
    const [[company]] = await pool.query(
      `SELECT id FROM companies WHERE evolution_instance = ? AND COALESCE(status,'active') = 'active'`,
      [instance]
    );
    if (company) {
      const [[debtor]] = await pool.query(
        'SELECT * FROM debtors WHERE phone = ? AND company_id = ? LIMIT 1',
        [phone, company.id]
      );
      if (debtor) return debtor;
    }
  }
  // fallback: procura em todas as empresas (compatível com Z-API / single-tenant)
  const [[debtor]] = await pool.query(
    'SELECT * FROM debtors WHERE phone = ? LIMIT 1',
    [phone]
  );
  return debtor || null;
}

router.post('/whatsapp', async (req, res) => {
  try {
    const parsed = parseWebhookPayload(req.body);
    if (!parsed) return res.json({ ok: true, ignored: true });

    const { phone, body, instance } = parsed;
    const debtor = await findDebtor(phone, instance);

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
      const discount     = Number(deal.discount_pct  || 0);
      const installments = Number(deal.installments  || 1);
      const finalAmount  = Number(deal.final_amount);

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
