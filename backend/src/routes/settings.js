const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { validateExternalUrl } = require('../middleware/security');

const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authRequired);

// GET /api/settings — retorna settings + config de integração da empresa
router.get('/', asyncHandler(async (req, res) => {
  const [[s]] = await pool.query(
    'SELECT * FROM settings WHERE company_id = ?', [req.user.companyId]
  );
  const [[c]] = await pool.query(
    `SELECT whatsapp_provider, evolution_base_url, evolution_api_key, evolution_instance,
            payment_provider, openai_api_key, openai_model
     FROM companies WHERE id = ?`,
    [req.user.companyId]
  );
  // Mascara API keys parcialmente antes de retornar ao frontend
  const masked = { ...s, ...c };
  if (masked.evolution_api_key) {
    masked.evolution_api_key = masked.evolution_api_key.slice(0, 4) + '****';
  }
  if (masked.openai_api_key) {
    masked.openai_api_key = masked.openai_api_key.slice(0, 7) + '****';
  }
  res.json(masked);
}));

// PUT /api/settings — atualiza settings E config de integração
router.put('/', asyncHandler(async (req, res) => {
  // campos da tabela settings
  const settingsFields = [
    'tone', 'max_discount', 'max_installments',
    'dunning_d1', 'dunning_d2', 'dunning_d3',
    'send_window_start', 'send_window_end',
  ];
  const settingsUpdates = [];
  const settingsValues  = [];
  for (const k of settingsFields) {
    if (req.body[k] !== undefined) {
      settingsUpdates.push(`${k} = ?`);
      settingsValues.push(req.body[k]);
    }
  }
  if (settingsUpdates.length) {
    settingsValues.push(req.user.companyId);
    await pool.query(
      `UPDATE settings SET ${settingsUpdates.join(', ')} WHERE company_id = ?`,
      settingsValues
    );
  }

  // campos de integração na tabela companies
  const companyFields = [
    'whatsapp_provider',
    'evolution_base_url', 'evolution_api_key', 'evolution_instance',
    'payment_provider',
    'openai_api_key', 'openai_model',
  ];
  const companyUpdates = [];
  const companyValues  = [];
  for (const k of companyFields) {
    if (req.body[k] !== undefined) {
      // Ignora valores mascarados (****) para não sobrescrever a chave real
      if (typeof req.body[k] === 'string' && req.body[k].includes('****')) continue;
      companyUpdates.push(`${k} = ?`);
      companyValues.push(req.body[k] === '' ? null : req.body[k]);
    }
  }
  if (companyUpdates.length) {
    companyValues.push(req.user.companyId);
    await pool.query(
      `UPDATE companies SET ${companyUpdates.join(', ')} WHERE id = ?`,
      companyValues
    );
  }

  res.json({ ok: true });
}));

// POST /api/settings/test-evolution — testa conexão com Evolution API
router.post('/test-evolution', async (req, res) => {
  try {
    const { evolution_base_url, evolution_api_key, evolution_instance } = req.body;

    const baseUrl  = (evolution_base_url  || '').replace(/\/$/, '');
    const apiKey   = evolution_api_key    || '';
    const instance = evolution_instance   || '';

    if (!baseUrl || !apiKey || !instance) {
      return res.status(400).json({ error: 'Preencha base_url, api_key e instance' });
    }

    // Proteção SSRF: valida que a URL não aponta para rede interna
    const urlError = validateExternalUrl(baseUrl);
    if (urlError) {
      return res.status(400).json({ error: `URL inválida: ${urlError}` });
    }

    // Limita tamanho dos inputs
    if (apiKey.length > 256 || instance.length > 128) {
      return res.status(400).json({ error: 'parâmetros muito longos' });
    }

    // Verifica se a instância existe e está conectada
    const r = await fetch(`${baseUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
    });

    if (!r.ok) {
      const txt = await r.text();
      // Limita a resposta para não vazar dados internos
      return res.status(400).json({ error: `Evolution retornou ${r.status}` });
    }

    const data = await r.json();
    const instances = Array.isArray(data) ? data : (data.data || []);
    const found = instances.find(
      (i) => (i.name || i.instance?.instanceName || '') === instance
    );

    if (!found) {
      return res.status(404).json({
        error: `Instância "${instance}" não encontrada. Instâncias disponíveis: ${
          instances.map((i) => i.name || i.instance?.instanceName).join(', ') || '(nenhuma)'
        }`,
      });
    }

    const state = found.connectionStatus || found.instance?.state || 'unknown';
    if (state !== 'open') {
      return res.status(400).json({
        error: `Instância encontrada mas não conectada (estado: ${state}). Escaneie o QR Code.`,
      });
    }

    res.json({ ok: true, instance, state });
  } catch (err) {
    res.status(500).json({ error: 'erro ao testar conexão' });
  }
});

// GET /api/settings/evolution-qr/:instance — retorna QR code ou estado de conexão
router.get('/evolution-qr/:instance', asyncHandler(async (req, res) => {
  const [[company]] = await pool.query(
    'SELECT evolution_base_url, evolution_api_key FROM companies WHERE id = ?',
    [req.user.companyId]
  );

  // Usa URL interna do Docker para comunicação backend→Evolution (mais rápida e confiável)
  const internalUrl = (process.env.EVOLUTION_BASE_URL || 'http://evolution:8080').replace(/\/$/, '');
  const apiKey      = company?.evolution_api_key || process.env.EVOLUTION_API_KEY || '';
  const instance    = req.params.instance;

  if (!apiKey || !instance) {
    return res.status(400).json({ error: 'Configure api_key e instance primeiro' });
  }

  // Verificar estado atual
  const stateR = await fetch(`${internalUrl}/instance/connectionState/${instance}`, {
    headers: { apikey: apiKey },
  });
  if (!stateR.ok) {
    return res.status(404).json({ error: `Instância "${instance}" não encontrada na Evolution API` });
  }
  const stateData = await stateR.json();
  const state = stateData.instance?.state || stateData.state || 'unknown';

  if (state === 'open') {
    const listR = await fetch(`${internalUrl}/instance/fetchInstances`, { headers: { apikey: apiKey } });
    const list = listR.ok ? await listR.json() : [];
    const found = Array.isArray(list) ? list.find(i => i.name === instance) : null;
    return res.json({ connected: true, number: found?.number || null });
  }

  // Se fechada, reconectar antes de pegar QR
  if (state === 'close') {
    await fetch(`${internalUrl}/instance/connect/${instance}`, { headers: { apikey: apiKey } });
    await new Promise(r => setTimeout(r, 2000));
  }

  // Buscar QR code
  const qrR = await fetch(`${internalUrl}/instance/connect/${instance}`, {
    headers: { apikey: apiKey },
  });
  const qrData = qrR.ok ? await qrR.json() : {};
  const raw = qrData.base64 || null;
  const base64 = raw ? (raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`) : null;

  res.json({ connected: false, base64 });
}));

module.exports = router;
