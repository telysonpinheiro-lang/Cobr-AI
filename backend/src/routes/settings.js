const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  const [[s]] = await pool.query(
    'SELECT * FROM settings WHERE company_id = ?', [req.user.companyId]
  );
  res.json(s);
});

router.put('/', async (req, res) => {
  const allowed = [
    'tone','max_discount','max_installments',
    'dunning_d1','dunning_d2','dunning_d3',
    'send_window_start','send_window_end',
  ];
  const updates = [];
  const values = [];
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      updates.push(`${k} = ?`);
      values.push(req.body[k]);
    }
  }
  if (!updates.length) return res.json({ ok: true });
  values.push(req.user.companyId);
  await pool.query(
    `UPDATE settings SET ${updates.join(', ')} WHERE company_id = ?`, values
  );
  res.json({ ok: true });
});

module.exports = router;
