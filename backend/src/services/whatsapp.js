// Camada modular de WhatsApp.
// Provider é selecionado por env WHATSAPP_PROVIDER (mock | zapi | evolution).
//
// Interface pública:
//   sendMessage({ to, body }) -> { providerId }
//
// Para plugar um provedor real, basta implementar a função send() do
// objeto correspondente abaixo (substituir o console.log por uma chamada HTTP).

const DEFAULT_PROVIDER = (process.env.WHATSAPP_PROVIDER || 'mock').toLowerCase();

const mock = {
  async send({ to, body }) {
    console.log(`[whatsapp:mock] -> ${to}: ${body}`);
    return { providerId: 'mock-' + Date.now() };
  },
};

const zapi = {
  async send({ to, body }) {
    const instance = process.env.ZAPI_INSTANCE;
    const token = process.env.ZAPI_TOKEN;
    if (!instance || !token) throw new Error('Z-API não configurado');
    // Exemplo (descomente para usar de verdade):
    //
    // const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
    // const r = await fetch(url, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ phone: to, message: body }),
    // });
    // const data = await r.json();
    // return { providerId: data.messageId };
    console.log(`[whatsapp:zapi] -> ${to}: ${body}`);
    return { providerId: 'zapi-' + Date.now() };
  },
};

const evolution = {
  async send({ to, body }) {
    const baseUrl = process.env.EVOLUTION_BASE_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;
    const instance = process.env.EVOLUTION_INSTANCE;
    if (!baseUrl || !apiKey || !instance) throw new Error('Evolution API não configurado');
    // Exemplo:
    // const r = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json', apikey: apiKey },
    //   body: JSON.stringify({ number: to, text: body }),
    // });
    // const data = await r.json();
    // return { providerId: data.key?.id };
    console.log(`[whatsapp:evolution] -> ${to}: ${body}`);
    return { providerId: 'evo-' + Date.now() };
  },
};

const providers = { mock, zapi, evolution };

async function sendMessage({ to, body, companyConfig }) {
  const provider = (companyConfig?.whatsapp?.provider || DEFAULT_PROVIDER).toLowerCase();
  const impl = providers[provider] || mock;
  return impl.send({ to, body });
}

module.exports = { sendMessage, DEFAULT_PROVIDER };
