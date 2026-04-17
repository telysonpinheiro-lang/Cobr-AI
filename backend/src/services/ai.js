const TONES = {
  formal:   'Use linguagem formal e respeitosa, tratando o cliente por "senhor(a)".',
  amigavel: 'Use linguagem amigável e próxima, tratando o cliente por "você".',
  firme:    'Use linguagem firme e direta, sem ser rude, deixando claro que a regularização é urgente.',
};

function daysOverdue(dueDateStr) {
  const due = new Date(dueDateStr);
  const now = new Date();
  due.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((now - due) / 86400000));
}

function fmtDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-');
  return `${d}/${m}/${y}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function buildSystemPrompt(settings, debtor) {
  const tone             = TONES[settings.tone] || TONES.amigavel;
  const overdue          = daysOverdue(debtor.due_date);
  const amount           = Number(debtor.amount).toFixed(2);
  const discountedAmount = +(debtor.amount * (1 - settings.max_discount / 100)).toFixed(2);
  const installments     = Number(settings.max_installments) || 6;
  const parcela          = +(debtor.amount / installments).toFixed(2);

  return `Você é o assistente de cobrança do Cobr-AI — amigável, profissional e focado em resolver.
Seu único objetivo é recuperar o pagamento em atraso de forma respeitosa.
Data de hoje: ${todayISO()}

REGRAS (nunca quebre):
- Nunca ameace, constranja ou pressione de forma abusiva
- ${tone}
- Responda SEMPRE em português do Brasil
- Mensagens curtas: máximo 3 frases por resposta
- Nunca invente dados; use apenas o que está no contexto abaixo

OPÇÕES DE NEGOCIAÇÃO DISPONÍVEIS:
${Number(settings.max_discount) > 0
  ? `- Desconto de ${settings.max_discount}% SOMENTE para quitação à vista do valor total → R$ ${discountedAmount.toFixed(2)}`
  : '- Desconto: NÃO disponível'}
${Number(settings.max_installments) > 1
  ? `- Parcelamento em até ${installments}x de R$ ${parcela.toFixed(2)} sem acréscimo (SEM desconto)`
  : '- Parcelamento: NÃO disponível'}
- Nunca ofereça desconto junto com parcelamento
- Nunca ofereça opção que não esteja disponível acima

CONTEXTO DO DEVEDOR:
- Nome: ${debtor.name}
- Valor em aberto: R$ ${amount}
- Vencimento: ${fmtDate(debtor.due_date)} (${overdue} dia${overdue !== 1 ? 's' : ''} em atraso)
- Parcelamento original: ${debtor.installments}x
${debtor.promised_date ? `- Cliente prometeu pagar em: ${fmtDate(debtor.promised_date)}` : ''}

QUANDO O CLIENTE ACEITAR UM ACORDO (desconto ou parcelamento):
Responda naturalmente E inclua no final:
<acordo>{"final_amount": VALOR, "discount_pct": DESCONTO, "installments": PARCELAS}</acordo>

QUANDO O CLIENTE INFORMAR UMA DATA PREFERIDA PARA PAGAMENTO:
Confirme a data E inclua no final (formato ISO YYYY-MM-DD):
<promessa>{"date": "YYYY-MM-DD"}</promessa>

Esses blocos são processados automaticamente — não os repita fora das tags.`;
}

const OPENING_PROMPTS = {
  pre: (debtor) => {
    const amount = Number(debtor.amount).toFixed(2);
    return `Gere uma mensagem de lembrete amigável para ${debtor.name}. O pagamento de R$ ${amount} vence *amanhã* (${fmtDate(debtor.due_date)}). Seja cordial e positivo — apenas um lembrete, sem cobrar, sem mencionar desconto ou atraso.`;
  },
  d1: (debtor) => {
    const amount = Number(debtor.amount).toFixed(2);
    return `Gere a primeira mensagem de cobrança para ${debtor.name}. A dívida de R$ ${amount} venceu em ${fmtDate(debtor.due_date)}. Aborde de forma amigável, informe o valor e pergunte como pode ajudar a regularizar. Não ofereça desconto nem parcelamento nesta mensagem.`;
  },
  d2: (debtor) => {
    const amount = Number(debtor.amount).toFixed(2);
    return `Gere um follow-up de cobrança para ${debtor.name}. Já enviamos contato sobre a dívida de R$ ${amount}. Seja cordial, mencione que ainda não houve retorno e pergunte qual seria a *melhor data* para que o cliente consiga realizar o pagamento. Não ofereça desconto nem parcelamento — apenas registre o compromisso de data. Hoje é ${todayISO()}.`;
  },
  d3: (debtor, settings) => {
    const amount          = Number(debtor.amount).toFixed(2);
    const promiseCtx      = debtor.promised_date
      ? `O cliente havia prometido pagar em ${fmtDate(debtor.promised_date)}, mas o pagamento não foi identificado. `
      : '';
    const hasDiscount     = Number(settings.max_discount) > 0;
    const hasInstallments = Number(settings.max_installments) > 1;

    const opts = [];
    if (hasDiscount) {
      const discounted = +(debtor.amount * (1 - settings.max_discount / 100)).toFixed(2);
      opts.push(`quitar o valor total hoje com ${settings.max_discount}% de desconto por R$ ${discounted.toFixed(2)}`);
    }
    if (hasInstallments) {
      const n       = Number(settings.max_installments);
      const parcela = +(debtor.amount / n).toFixed(2);
      opts.push(`parcelar em ${n}x de R$ ${parcela.toFixed(2)} sem juros e sem desconto`);
    }

    if (opts.length === 0) {
      return `Gere a mensagem final de cobrança para ${debtor.name}. ${promiseCtx}A dívida de R$ ${amount} precisa ser regularizada. Seja firme e objetivo, pedindo que entre em contato imediatamente.`;
    }
    const optsText = opts.map((o, i) => `(${i + 1}) ${o}`).join('; ou ');
    return `Gere a mensagem final de cobrança para ${debtor.name}. ${promiseCtx}A dívida é de R$ ${amount}. Ofereça apenas as seguintes opções: ${optsText}. Seja firme e objetivo.`;
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
    const n      = Math.min(Number(settings.max_installments) || 3, 6);
    const parcela = +(debtor.amount / n).toFixed(2);
    return `Posso parcelar em ${n}x de R$ ${parcela.toFixed(2)} sem juros. Fechamos assim? <acordo>{"final_amount": ${Number(debtor.amount).toFixed(2)}, "discount_pct": 0, "installments": ${n}}</acordo>`;
  }
  if (/quando|prazo|data|semana|mês|dia \d/.test(text)) {
    return `Qual data seria melhor para você realizar o pagamento? Assim que me confirmar, reservo as condições especiais até lá.`;
  }
  if (/nao|não|agora não|depois|amanhã|amanha/.test(text)) {
    return `Entendo! Qual data ficaria melhor para você? Posso reservar as condições de desconto ou parcelamento até lá.`;
  }
  if (/lembrete|vencimento|vence/.test(text)) {
    const amount = Number(debtor.amount).toFixed(2);
    return `Olá, ${debtor.name}! Só passando para lembrar que seu pagamento de R$ ${amount} vence amanhã (${fmtDate(debtor.due_date)}). Qualquer dúvida, estamos à disposição!`;
  }
  const amount = Number(debtor.amount).toFixed(2);
  return `Olá, ${debtor.name}! Identificamos um valor de R$ ${amount} em aberto desde ${fmtDate(debtor.due_date)}. Podemos resolver isso agora — prefere quitar à vista com desconto ou parcelar?`;
}

// Extrai <acordo> e <promessa> do texto da IA
function extractAll(text) {
  let deal    = null;
  let promise = null;

  const dealMatch = text.match(/<acordo>([\s\S]*?)<\/acordo>/i);
  if (dealMatch) {
    try { deal = JSON.parse(dealMatch[1]); } catch {}
    text = text.replace(dealMatch[0], '').trim();
  }

  const promiseMatch = text.match(/<promessa>([\s\S]*?)<\/promessa>/i);
  if (promiseMatch) {
    try { promise = JSON.parse(promiseMatch[1]); } catch {}
    text = text.replace(promiseMatch[0], '').trim();
  }

  return { reply: text, deal, promise };
}

async function generateReply({ debtor, settings, history, lastUserMessage, companyConfig }) {
  const apiKey = companyConfig?.ai?.apiKey || process.env.OPENAI_API_KEY;
  const model  = companyConfig?.ai?.model  || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    const text = fallbackReply(debtor, settings, lastUserMessage);
    return extractAll(text);
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
  return extractAll(text);
}

// Mensagens de abertura fixas para quando não há OpenAI configurada
const FALLBACK_OPENINGS = {
  pre: (debtor) => {
    const amount = Number(debtor.amount).toFixed(2).replace('.', ',');
    return `Olá, ${debtor.name}! 😊 Passando para lembrar que seu pagamento de R$ ${amount} vence *amanhã* (${fmtDate(debtor.due_date)}). Qualquer dúvida, estamos à disposição!`;
  },
  d1: (debtor) => {
    const amount = Number(debtor.amount).toFixed(2).replace('.', ',');
    return `Olá, ${debtor.name}! Identificamos que o pagamento de R$ ${amount} com vencimento em ${fmtDate(debtor.due_date)} ainda não foi quitado. Como posso te ajudar a regularizar?`;
  },
  d2: (debtor) => {
    const amount = Number(debtor.amount).toFixed(2).replace('.', ',');
    return `Olá, ${debtor.name}! Ainda não tivemos retorno sobre a dívida de R$ ${amount} vencida em ${fmtDate(debtor.due_date)}. Qual seria a melhor data para você realizar o pagamento?`;
  },
  d3: (debtor, settings) => {
    const amount      = Number(debtor.amount).toFixed(2).replace('.', ',');
    const promiseCtx  = debtor.promised_date
      ? `Você havia prometido pagar em ${fmtDate(debtor.promised_date)}, mas não identificamos o pagamento. `
      : '';
    const hasDiscount     = Number(settings.max_discount) > 0;
    const hasInstallments = Number(settings.max_installments) > 1;

    const options = [];
    if (hasDiscount) {
      const discounted = (debtor.amount * (1 - settings.max_discount / 100)).toFixed(2).replace('.', ',');
      options.push(`quitar hoje com ${settings.max_discount}% de desconto por R$ ${discounted}`);
    }
    if (hasInstallments) {
      const n       = Number(settings.max_installments);
      const parcela = (debtor.amount / n).toFixed(2).replace('.', ',');
      options.push(`parcelar em ${n}x de R$ ${parcela} sem juros`);
    }

    if (options.length === 0) {
      return `${debtor.name}, ${promiseCtx}a dívida de R$ ${amount} precisa ser regularizada o quanto antes. Entre em contato para resolvermos juntos.`;
    }
    if (options.length === 1) {
      return `${debtor.name}, ${promiseCtx}ainda podemos resolver a dívida de R$ ${amount}: ${options[0]}. Podemos fechar?`;
    }
    return `${debtor.name}, ${promiseCtx}temos duas opções para a dívida de R$ ${amount}: (1) ${options[0]}; ou (2) ${options[1]}. Qual prefere?`;
  },
};

async function generateOpeningMessage({ debtor, settings, step, companyConfig }) {
  const apiKey = companyConfig?.ai?.apiKey || process.env.OPENAI_API_KEY;

  // Sem API key: usa mensagem fixa por etapa (evita o fallback genérico)
  if (!apiKey) {
    const fn   = FALLBACK_OPENINGS[step] || FALLBACK_OPENINGS.d1;
    const text = fn(debtor, settings);
    return extractAll(text);
  }

  const promptFn    = OPENING_PROMPTS[step] || OPENING_PROMPTS.d1;
  const instruction = promptFn(debtor, settings);
  return generateReply({ debtor, settings, history: [], lastUserMessage: instruction, companyConfig });
}

module.exports = { generateReply, generateOpeningMessage };
