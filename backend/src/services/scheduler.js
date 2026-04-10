// Régua de cobrança automática.
// Roda periodicamente: para cada empresa, busca devedores atrasados e
// dispara D+1, D+3, D+7 (configurável) usando a IA + WhatsApp.

const cron = require('node-cron');
const pool = require('../config/db');
const { generateOpeningMessage } = require('./ai');
const { sendMessage } = require('./whatsapp');
const { getCompanyConfig } = require('./companyConfig');

async function runDunningOnce() {
  const [companies] = await pool.query(
    `SELECT id FROM companies WHERE COALESCE(status,'active') = 'active'`
  );
  let totalSent = 0;

  for (const company of companies) {
    const [[settings]] = await pool.query(
      'SELECT * FROM settings WHERE company_id = ?', [company.id]
    );
    if (!settings) continue;
    const companyConfig = await getCompanyConfig(company.id);

    // janela de horário (best-effort, em horário do servidor)
    const now = new Date();
    const hour = now.getHours();
    const startH = parseInt(String(settings.send_window_start).slice(0, 2), 10);
    const endH = parseInt(String(settings.send_window_end).slice(0, 2), 10);
    if (hour < startH || hour >= endH) continue;

    const steps = [
      { key: 'd1', days: settings.dunning_d1 },
      { key: 'd2', days: settings.dunning_d2 },
      { key: 'd3', days: settings.dunning_d3 },
    ];

    for (const step of steps) {
      const [debtors] = await pool.query(
        `SELECT d.* FROM debtors d
          LEFT JOIN dunning_log l
                 ON l.debtor_id = d.id AND l.step = ?
         WHERE d.company_id = ?
           AND d.status NOT IN ('pago','ignorado')
           AND DATEDIFF(CURDATE(), d.due_date) >= ?
           AND l.id IS NULL
         LIMIT 50`,
        [step.key, company.id, step.days]
      );

      for (const debtor of debtors) {
        try {
          const { reply } = await generateOpeningMessage({
            debtor, settings, step: step.key, companyConfig,
          });
          const { providerId } = await sendMessage({
            to: debtor.phone, body: reply, companyConfig,
          });

          await pool.query(
            'INSERT INTO messages (debtor_id, direction, body, provider_id) VALUES (?, "out", ?, ?)',
            [debtor.id, reply, providerId]
          );
          await pool.query(
            'INSERT INTO dunning_log (debtor_id, step) VALUES (?, ?)',
            [debtor.id, step.key]
          );
          await pool.query(
            `UPDATE debtors SET status = 'em_conversa', last_contact_at = NOW() WHERE id = ?`,
            [debtor.id]
          );
          totalSent++;
        } catch (err) {
          console.error('[scheduler] erro debtor', debtor.id, err.message);
        }
      }
    }
  }
  return { totalSent };
}

function startScheduler() {
  // a cada hora, no minuto 0
  cron.schedule('0 * * * *', () => {
    runDunningOnce().then(
      (r) => console.log('[scheduler] enviadas:', r.totalSent),
      (e) => console.error('[scheduler] falhou:', e.message),
    );
  });
  console.log('[scheduler] régua agendada (cron horário)');
}

module.exports = { startScheduler, runDunningOnce };
