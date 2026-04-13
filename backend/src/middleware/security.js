const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// ─── Rate Limiters ────────────────────────────────────────────────────────────

// Login: máximo 10 tentativas por 15 minutos por IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'muitas tentativas, aguarde 15 minutos' },
});

// Registro: máximo 5 cadastros por hora por IP
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'muitas tentativas de cadastro, aguarde 1 hora' },
});

// API geral: 300 requisições por minuto por IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'limite de requisições excedido' },
});

// Webhooks: 120 por minuto (processos de alto volume)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'limite de webhooks excedido' },
});

// ─── Política de Senha ────────────────────────────────────────────────────────

/**
 * Valida força da senha.
 * Retorna null se válida, ou string de erro.
 */
function validatePassword(password) {
  if (!password || typeof password !== 'string') return 'senha obrigatória';
  if (password.length < 8) return 'senha deve ter no mínimo 8 caracteres';
  if (password.length > 128) return 'senha muito longa';
  if (!/[A-Z]/.test(password)) return 'senha deve conter ao menos uma letra maiúscula';
  if (!/[a-z]/.test(password)) return 'senha deve conter ao menos uma letra minúscula';
  if (!/[0-9]/.test(password)) return 'senha deve conter ao menos um número';
  return null;
}

// ─── Validação de Email ───────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validateEmail(email) {
  if (!email || typeof email !== 'string') return 'email obrigatório';
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254) return 'email muito longo';
  if (!EMAIL_REGEX.test(trimmed)) return 'formato de email inválido';
  return null;
}

// ─── Proteção SSRF ───────────────────────────────────────────────────────────

// Blocos de IP privado / localhost que não devem ser acessíveis via SSRF
const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^0\.0\.0\.0/,
  /^169\.254\./, // link-local
  /^fc00:/i,     // IPv6 ULA
  /^fe80:/i,     // IPv6 link-local
];

/**
 * Valida se a URL é segura (não aponta para rede interna).
 * Retorna null se válida, ou string de erro.
 */
function validateExternalUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return 'URL obrigatória';
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'URL inválida';
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'apenas URLs http/https são permitidas';
  }
  const hostname = parsed.hostname;
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return 'URL aponta para endereço privado não permitido';
    }
  }
  return null;
}

// ─── Verificação de Assinatura de Webhook ────────────────────────────────────

/**
 * Verifica HMAC-SHA256 do payload do webhook.
 * Retorna true se válido.
 */
function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!secret) return true; // sem segredo configurado, pula (ambiente dev)
  if (!signatureHeader) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

/**
 * Middleware de verificação de assinatura de webhook (pagamento).
 * Lê o WEBHOOK_PAYMENT_SECRET do ambiente.
 */
function paymentWebhookSignatureCheck(req, res, next) {
  const secret = process.env.WEBHOOK_PAYMENT_SECRET;
  if (!secret) return next(); // dev mode sem segredo configurado

  const signature = req.headers['x-webhook-signature'] ||
                    req.headers['x-signature'] ||
                    req.headers['x-hub-signature-256'];

  const rawBody = JSON.stringify(req.body); // express.json() já parseou
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return res.status(401).json({ error: 'assinatura de webhook inválida' });
  }
  next();
}

// ─── Sanitização de Parâmetros de Busca ──────────────────────────────────────

/**
 * Limita comprimento de parâmetros de query string para evitar DoS.
 */
function sanitizeSearchParam(value, maxLen = 100) {
  if (!value || typeof value !== 'string') return '';
  return value.slice(0, maxLen).trim();
}

module.exports = {
  authLimiter,
  registerLimiter,
  apiLimiter,
  webhookLimiter,
  validatePassword,
  validateEmail,
  validateExternalUrl,
  paymentWebhookSignatureCheck,
  sanitizeSearchParam,
};
