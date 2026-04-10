// Resolve a config efetiva de uma empresa.
// Prioridade: valor salvo na empresa > variável de ambiente > 'mock'.
//
// É isso que permite o admin do SaaS configurar provider/chave por empresa
// sem mexer em .env e sem reiniciar o backend.

const pool = require('../config/db');

async function getCompanyConfig(companyId) {
  const [[c]] = await pool.query(
    'SELECT * FROM companies WHERE id = ?', [companyId]
  );
  if (!c) return null;

  return {
    id: c.id,
    name: c.name,
    plan: c.plan,
    status: c.status,
    whatsapp: {
      provider: c.whatsapp_provider || process.env.WHATSAPP_PROVIDER || 'mock',
    },
    payment: {
      provider: c.payment_provider || process.env.PAYMENT_PROVIDER || 'mock',
    },
    ai: {
      apiKey: c.openai_api_key || process.env.OPENAI_API_KEY || '',
      model: c.openai_model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    },
  };
}

module.exports = { getCompanyConfig };
