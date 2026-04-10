// Agente de IA — núcleo do Cobr-AI.
// Responsável por:
//   - gerar primeira abordagem (régua de cobrança)
//   - responder mensagens do devedor (negociação)
//   - sugerir acordo (desconto/parcelas) respeitando os limites configurados
//
// Sem OPENAI_API_KEY o sistema cai em um fallback determinístico (mock)
// que mantém o fluxo funcional para demo.

const TONES = {
  formal:    'Use linguagem formal, polida e respeitosa, tratando o cliente por "senhor(a)".',
  amigavel:  'Use linguagem amigável, leve e próxima, tratando o cliente por você.',
  firme:     'Use linguagem firme e objetiva, sem ser rude, deixando claro que a regularização é necessária.',
};

function buildSystemPrompt(settings, debtor) {
  const tone = TONES[settings.tone] || TONES.amigavel;
  return `Você é o assistente de cobrança do Cobr-AI, amigável, profissional e eficiente.
Seu objetivo é recuperar pagamentos em atraso.

Regras de conduta (NUNCA quebre):
- nunca seja agressivo, ameaçador ou constrangedor
- sempre ofereça uma solução
- priorize SEMPRE o pagamento à vista hoje
- use desconto somente se necessário, no máximo ${settings.max_discount}% do valor original
- se o cliente não puder pagar à vista, ofereça parcelamento em até ${settings.max_installments}x
- sempre tente fechar o pagamento na conversa
- ${tone}
- responda em português do Brasil
- mensagens curtas (no máximo 3 frases)
- nunca invente dados; use apenas o que está no contexto

Contexto do devedor:
- nome: ${debtor.name}
- valor original: R$ ${Number(debtor.amount).toFixed(2)}
- vencimento: ${debtor.due_date}
- parcelamento original: ${debtor.installments}x

Quando o cliente aceitar um acordo, responda de forma natural E inclua no
final da mensagem um JSON entre as tags <acordo> e </acordo> assim:
<acordo>{"final_amount": 123.45, "discount_pct": 10, "installments": 1}</acordo>
Esse JSON é processado automaticamente — não o mostre fora das tags.`;
}

function fallbackReply(debtor, settings, history, lastUserMsg) {
  const text = (lastUserMsg || '').toLowerCase();
  if (/pago|paguei|comprovante/.test(text)) {
    return 'Que ótimo! Assim que confirmarmos o pagamento no sistema atualizo seu status. Obrigado!';
  }
  if (/desconto|abatimento|abater|menor/.test(text)) {
    const finalAmount = +(debtor.amount * (1 - settings.max_discount / 100)).toFixed(2);
    return `Consigo um desconto de ${settings.max_discount}% se você quitar hoje, ficando R$ ${finalAmount.toFixed(2)}. Posso gerar o PIX? <acordo>{"final_amount": ${finalAmount}, "discount_pct": ${settings.max_discount}, "installments": 1}</acordo>`;
  }
  if (/parcel|dividir|vezes|x/.test(text)) {
    const n = Math.min(settings.max_installments, 3);
    const parcela = +(debtor.amount / n).toFixed(2);
    return `Posso dividir em ${n}x de R$ ${parcela.toFixed(2)} sem acréscimo. Fechamos assim? <acordo>{"final_amount": ${debtor.amount}, "discount_pct": 0, "installments": ${n}}</acordo>`;
  }
  if (/nao|não|depois|amanha|amanhã|semana/.test(text)) {
    return 'Tudo bem! Posso te ajudar a regularizar agora mesmo — prefere pagar à vista no PIX ou parcelar?';
  }
  return `Olá ${debtor.name}! Sou o assistente do Cobr-AI. Identifiquei que você tem um valor de R$ ${Number(debtor.amount).toFixed(2)} em aberto desde ${debtor.due_date}. Posso te ajudar a regularizar agora?`;
}

function extractDeal(text) {
  const m = text.match(/<acordo>([\s\S]*?)<\/acordo>/i);
  if (!m) return { reply: text, deal: null };
  try {
    const deal = JSON.parse(m[1]);
    return { reply: text.replace(m[0], '').trim(), deal };
  } catch {
    return { reply: text.replace(m[0], '').trim(), deal: null };
  }
}

async function generateReply({ debtor, settings, history, lastUserMessage, companyConfig }) {
  const apiKey = companyConfig?.ai?.apiKey || process.env.OPENAI_API_KEY;
  const model  = companyConfig?.ai?.model  || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!apiKey) {
    const text = fallbackReply(debtor, settings, history, lastUserMessage);
    return extractDeal(text);
  }

  // Carregamento lazy da SDK para não travar o boot quando não há chave.
  const { OpenAI } = require('openai');
  const client = new OpenAI({ apiKey });

  const messages = [
    { role: 'system', content: buildSystemPrompt(settings, debtor) },
    ...history.map((m) => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.body,
    })),
  ];
  if (lastUserMessage) messages.push({ role: 'user', content: lastUserMessage });

  const completion = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.5,
  });

  const text = completion.choices[0]?.message?.content || '';
  return extractDeal(text);
}

async function generateOpeningMessage({ debtor, settings, step, companyConfig }) {
  const stepLabel = { d1: 'primeira abordagem',
                      d2: 'follow-up cordial',
                      d3: 'oferta final com desconto' }[step] || 'abordagem';
  const lastUserMessage = `Gere a mensagem de ${stepLabel} para o cliente.`;
  return generateReply({ debtor, settings, history: [], lastUserMessage, companyConfig });
}

module.exports = { generateReply, generateOpeningMessage };
