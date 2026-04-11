const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// GET /api/settings — retorna settings + config de integração da empresa
router.get('/', async (req, res) => {
  const [[s]] = await pool.query(
    'SELECT * FROM settings WHERE company_id = ?', [req.user.companyId]
  );
  const [[c]] = await pool.query(
    `SELECT whatsapp_provider, evolution_base_url, evolution_api_key, evolution_instance,
            payment_provider, openai_api_key, openai_model
     FROM companies WHERE id = ?`,
    [req.user.companyId]
  );
  res.json({ ...s, ...c });
});

// PUT /api/settings — atualiza settings E config de integração
router.put('/', async (req, res) => {
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
});

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

    // Verifica se a instância existe e está conectada
    const r = await fetch(`${baseUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(400).json({ error: `Evolution retornou ${r.status}: ${txt}` });
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
