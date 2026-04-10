// Camada modular de pagamento.
// PAYMENT_PROVIDER = mock | asaas | pagarme

const DEFAULT_PROVIDER = (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase();

const mock = {
  async createCharge({ debtor, amount, method = 'pix' }) {
    const id = 'mock-' + Date.now();
    return {
      providerId: id,
      provider: 'mock',
      method,
      amount,
      link: `https://pay.cobrai.local/${id}`,
      pixCopiaCola: '00020126...mock-pix-payload',
    };
  },
};

const asaas = {
  async createCharge({ debtor, amount, method = 'PIX' }) {
    const apiKey = process.env.ASAAS_API_KEY;
    const baseUrl = process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3';
    if (!apiKey) throw new Error('ASAAS_API_KEY não configurado');
    // Exemplo:
    // const r = await fetch(`${baseUrl}/payments`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json', access_token: apiKey },
    //   body: JSON.stringify({
    //     customer: debtor.providerCustomerId,
    //     billingType: method,
    //     value: amount,
    //     dueDate: new Date().toISOString().slice(0, 10),
    //   }),
    // });
    // const data = await r.json();
    // return { providerId: data.id, provider: 'asaas', method, amount, link: data.invoiceUrl };
    return mock.createCharge({ debtor, amount, method });
  },
};

const pagarme = {
  async createCharge(args) {
    if (!process.env.PAGARME_API_KEY) throw new Error('PAGARME_API_KEY não configurado');
    return mock.createCharge(args);
  },
};

const providers = { mock, asaas, pagarme };

async function createCharge(args) {
  const provider = (args.companyConfig?.payment?.provider || DEFAULT_PROVIDER).toLowerCase();
  const impl = providers[provider] || mock;
  return impl.createCharge(args);
}

module.exports = { createCharge, DEFAULT_PROVIDER };
