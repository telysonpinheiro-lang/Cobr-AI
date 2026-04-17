const TONES = {
  formal:   'Use linguagem formal e respeitosa, tratando o cliente por "senhor(a)".',
  amigavel: 'Use linguagem amigável e próxima, tratando o cliente por "você".',
  firme:    'Use linguagem firme e direta, sem ser rude, deixando claro que a regularização é urgente.',
};

function daysOverdue(dueDateStr) {
  const due  = new Date(dueDateStr);
  const now  = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((now - due) / 86400000));
}

function fmtDate(dateStr) {
  // "2024-03-15" → "15/03/2024"
  const [y, m, d] = String(dateStr).split('-');
  return `${d}/${m}/${y}`;
}

function buildSystemPrompt(settings, debtor) {
  const tone    = TONES[settings.tone] || TONES.amigavel;
  const overdue = daysOverdue(debtor.due_date);
  const amount  = Number(debtor.amount).toFixed(2);
  const discountedAmount = +(debtor.amount * (1 - settings.max_discount / 100)).toFixed(2);

  return `Você é o assistente de cobrança do Cobr-AI — amigável, profissional e focado em resolver.
Seu único objetivo é recuperar o pagamento em atraso de forma respeitosa.

REGRAS (nunca quebre):
- Nunca ameace, constranja ou pressione de forma abusiva
- Sempre ofereça uma saída: à vista com desconto OU parcelado
- Priorize quitação à vista; use desconto só se necessário
- Desconto máximo: ${settings.max_discount}% → valor final mínimo R$ ${discountedAmount.toFixed(2)}
- Parcelamento máximo: ${settings.max_installments}x sem acréscimo
- ${tone}
- Responda SEMPRE em português do Brasil
- Mensagens curtas: máximo 3 frases por resposta
- Nunca invente dados; use apenas o que está no contexto abaixo

CONTEXTO DO DEVEDOR:
- Nome: ${debtor.name}
- Valor em aberto: R$ ${amount}
- Vencimento: ${fmtDate(debtor.due_date)} (${overdue} dia${overdue !== 1 ? 's' : ''} em atraso)
- Parcelamento original: ${debtor.installments}x

QUANDO O CLIENTE ACEITAR UM ACORDO:
Responda naturalmente E inclua no final da mensagem exatamente:
<acordo>{"final_amount": VALOR, "discount_pct": DESCONTO, "installments": PARCELAS}</acordo>
Esse JSON é processado automaticamente — não o repita fora das tags.`;
}

// Prompts específicos por etapa da régua de cobrança
const OPENING_PROMPTS = {
  d1: (debtor, settings) => {
    const amount = Number(debtor.amount).toFixed(2);
    return `Gere a primeira mensagem de cobrança para ${debtor.name}. A dívida de R$ ${amount} venceu em ${fmtDate(debtor.due_date)}. Aborde de forma amigável, informe o valor e pergunte como pode ajudar a regularizar. Não ofereça desconto nesta primeira mensagem.`;
  },
  d2: (debtor, settings) => {
    const amount = Number(debtor.amount).toFixed(2);
    return `Gere um follow-up de cobrança para ${debtor.name}. Já enviamos a primeira mensagem há alguns dias sobre a dívida de R$ ${amount}. Seja cordial, mencione que ainda não recebemos retorno e pergunte se há algo que possamos fazer para facilitar o pagamento. Pode insinuar que há opções de parcelamento.`;
  },
  d3: (debtor, settings) => {
    const amount = Number(debtor.amount).toFixed(2);
    const discounted = +(debtor.amount * (1 - settings.max_discount / 100)).toFixed(2);
    return `Gere a oferta final de cobrança para ${debtor.name}. Esta é nossa última tentativa amigável antes de outras medidas. A dívida é de R$ ${amount}. Ofereça explicitamente o desconto máximo de ${settings.max_discount}% (R$ ${discounted.toFixed(2)}) para quitação à vista hoje. Seja firme mas respeitoso.`;
  },
};

function fallbackReply(debtor, settings, lastUserMsg) {
  const text = (lastUserMsg || '').toLowerCase();

  if (/pago|paguei|comprovante|transferi/.test(text)) {
    return 'Que ótimo! Assim que confirmarmos o pagamento no sistema atualizo seu cadastro. Obrigado!';
  }
  if (/desconto|abatimento|abater|menor|reduz/.test(text)) {
    const finalAmount = +(debtor.amount * (1 - settings.max_discount / 100)).toFixed(2);
    return `Consigo ${settings.max_discount}% de desconto na quitação à vista hoje — de R$ ${Number(debtor.amount).toFixed(2)} por R$ ${finalAmount.toFixed(2)}. Posso gerar o PIX agora? <acordo>{"final_amount": ${finalAmount}, "discount_pct": ${settings.max_discount}, "installments": 1}</acordo>`;
  }
  if (/parcel|dividir|vezes|prestação/.test(text)) {
    const n = Math.min(Number(settings.max_installments) || 3, 6);
    const parcela = +(debtor.amount / n).toFixed(2);
    return `Posso parcelar em ${n}x de R$ ${parcela.toFixed(2)} sem juros. Fechamos assim? <acordo>{"final_amount": ${Number(debtor.amount).toFixed(2)}, "discount_pct": 0, "installments": ${n}}</acordo>`;
  }
  if (/quando|prazo|data|semana|mês/.test(text)) {
    return `Qual data ficaria melhor para você? Posso reservar a condição especial de parcelamento ou desconto até sexta-feira.`;
  }
  if (/nao|não|agora não|depois|amanhã|amanha/.test(text)) {
    return `Entendo! Quando seria um bom momento? Temos opções de parcelamento e desconto para quem regulariza essa semana.`;
  }
  const amount = Number(debtor.amount).toFixed(2);
  return `Olá, ${debtor.name}! Identificamos um valor de R$ ${amount} em aberto desde ${fmtDate(debtor.due_date)}. Podemos resolver isso agora — prefere pagar à vista com desconto ou parcelar?`;
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
    const text = fallbackReply(debtor, settings, lastUserMessage);
    return extractDeal(text);
  }

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
    temperature: 0.4,
    max_tokens: 300,
  });

  const text = completion.choices[0]?.message?.content || '';
  return extractDeal(text);
}

async function generateOpeningMessage({ debtor, settings, step, companyConfig }) {
  const promptFn = OPENING_PROMPTS[step] || OPENING_PROMPTS.d1;
  const instruction = promptFn(debtor, settings);
  return generateReply({ debtor, settings, history: [], lastUserMessage: instruction, companyConfig });
}

module.exports = { generateReply, generateOpeningMessage };
