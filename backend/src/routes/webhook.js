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
const { webhookLimiter, paymentWebhookSignatureCheck } = require('../middleware/security');

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
    // Limita tamanho da mensagem recebida para evitar processamento excessivo
    return { phone, body: body.slice(0, 2000), instance: raw.instance || null };
  }

  // Z-API / genérico
  const phone = String(raw.phone || raw.from || '').replace(/\D/g, '');
  const body  = String(raw.body || raw.text || raw.message || '').slice(0, 2000);
  if (!phone || !body) return null;
  return { phone, body, instance: null };
}

// Encontra o devedor e sua empresa pelo telefone.
// Se a instância for informada, RESTRINGE à empresa dona da instância (multi-tenant seguro).
// O fallback sem instância só é usado para configurações single-tenant.
//
// Normalização: o remoteJid da Evolution chega como 5511999999999.
// O banco pode ter o número em vários formatos: (11) 99999-9999, 11999999999, etc.
// Comparamos apenas os últimos 11 dígitos (DDD+número) de ambos os lados.
function phoneDigits(raw) {
  const d = String(raw).replace(/\D/g, '');
  // Remove DDI 55 se presente, fica DDD+número (11 dígitos)
  return d.startsWith('55') && d.length > 11 ? d.slice(2) : d;
}

async function findDebtor(phone, instance) {
  const localPhone = phoneDigits(phone); // ex: 11999999999

  if (instance) {
    const [[company]] = await pool.query(
      `SELECT id FROM companies WHERE evolution_instance = ? AND COALESCE(status,'active') = 'active'`,
      [instance]
    );
    if (company) {
      const [debtors] = await pool.query(
        `SELECT * FROM debtors
          WHERE REGEXP_REPLACE(phone, '[^0-9]', '') LIKE ?
            AND company_id = ?
          LIMIT 1`,
        [`%${localPhone}`, company.id]
      );
      if (debtors.length) return debtors[0];
    }
    return null;
  }
  const [debtors] = await pool.query(
    `SELECT * FROM debtors WHERE REGEXP_REPLACE(phone, '[^0-9]', '') LIKE ? LIMIT 1`,
    [`%${localPhone}`]
  );
  return debtors[0] || null;
}

router.post('/whatsapp', webhookLimiter, async (req, res) => {
  try {
    const parsed = parseWebhookPayload(req.body);
    if (!parsed) return res.json({ ok: true, ignored: true });

    const { phone, body, instance } = parsed;
    const debtor = await findDebtor(phone, instance);

    if (!debtor) return res.json({ ok: true, ignored: true });

    // Devedor já pagou — não processa mais mensagens
    if (debtor.status === 'pago') return res.json({ ok: true, ignored: true });

    const [[settings]] = await pool.query(
      'SELECT * FROM settings WHERE company_id = ?', [debtor.company_id]
    );
    // Guard: usa defaults se empresa não tiver settings configurado
    const effectiveSettings = settings || { tone: 'amigavel', max_discount: 20, max_installments: 6 };

    const companyConfig = await getCompanyConfig(debtor.company_id);

    // Busca histórico ANTES de salvar a nova mensagem para evitar duplicação no contexto da IA
    const [history] = await pool.query(
      'SELECT direction, body FROM messages WHERE debtor_id = ? ORDER BY created_at ASC LIMIT 29',
      [debtor.id]
    );

    // Grava mensagem recebida
    await pool.query(
      'INSERT INTO messages (debtor_id, direction, body) VALUES (?, "in", ?)',
      [debtor.id, body]
    );

    const { reply, deal } = await generateReply({
      debtor, settings: effectiveSettings, history, lastUserMessage: body, companyConfig,
    });

    // Se a IA fechou um acordo, persiste e gera link de pagamento
    if (deal && deal.final_amount) {
      const discount     = Number(deal.discount_pct  || 0);
      const installments = Number(deal.installments  || 1);
      const finalAmount  = Number(deal.final_amount);

      if (finalAmount <= 0 || finalAmount > 10_000_000) {
        console.warn('[webhook] valor de acordo fora do intervalo:', finalAmount);
        // Envia a resposta normalmente sem processar o acordo inválido
      } else if (discount <= Number(effectiveSettings.max_discount) &&
                 installments <= Number(effectiveSettings.max_installments)) {
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
          `UPDATE debtors SET status = 'aguardando_pagamento', last_contact_at = NOW() WHERE id = ?`,
          [debtor.id]
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

    // Resposta normal — nunca regride status de negociação avançada
    const sent = await sendMessage({ to: debtor.phone, body: reply, companyConfig });
    await pool.query(
      'INSERT INTO messages (debtor_id, direction, body, provider_id) VALUES (?, "out", ?, ?)',
      [debtor.id, reply, sent.providerId]
    );
    await pool.query(
      `UPDATE debtors
          SET status = IF(status IN ('nao_contatado','em_conversa'), 'negociando', status),
              last_contact_at = NOW()
        WHERE id = ?`,
      [debtor.id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[webhook] erro:', err.message);
    res.status(500).json({ error: 'erro interno' });
  }
});

// Webhook de pagamento — chamado pelo gateway quando pagamento é confirmado.
// Protegido por verificação de assinatura HMAC (configurar WEBHOOK_PAYMENT_SECRET no .env).
router.post('/payment', webhookLimiter, paymentWebhookSignatureCheck, async (req, res) => {
  const providerId = req.body.providerId || req.body.id;
  if (!providerId || typeof providerId !== 'string' || providerId.length > 128) {
    return res.status(400).json({ error: 'providerId ausente ou inválido' });
  }

  const [[payment]] = await pool.query(
    'SELECT * FROM payments WHERE provider_id = ?', [providerId]
  );
  if (!payment) return res.status(404).json({ error: 'pagamento não encontrado' });

  // Só atualiza se ainda não foi pago (evita replay attacks)
  if (payment.status === 'pago') {
    return res.json({ ok: true, alreadyPaid: true });
  }

  await pool.query(
    `UPDATE payments SET status = 'pago', paid_at = NOW() WHERE id = ?`, [payment.id]
  );
  await pool.query(`UPDATE debtors SET status = 'pago' WHERE id = ?`, [payment.debtor_id]);
  res.json({ ok: true });
});

module.exports = router;
