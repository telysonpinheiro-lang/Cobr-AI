const express = require('express');
const pool = require('../config/db');
const { authRequired } = require('../middleware/auth');

const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
router.use(authRequired);

router.get('/', asyncHandler(async (req, res) => {
  const companyId = req.user.companyId;

  const [[totals]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status NOT IN ('pago','ignorado') THEN amount END), 0) AS open_amount,
       COALESCE(SUM(CASE WHEN status = 'pago' THEN amount END), 0) AS recovered_amount,
       COUNT(*) AS total_debtors,
       SUM(CASE WHEN status = 'pago' THEN 1 ELSE 0 END) AS paid_count
     FROM debtors WHERE company_id = ?`,
    [companyId]
  );

  const conversion = totals.total_debtors > 0
    ? +(Number(totals.paid_count) / Number(totals.total_debtors) * 100).toFixed(2)
    : 0;

  const [byStatus] = await pool.query(
    `SELECT status, COUNT(*) AS count, COALESCE(SUM(amount),0) AS amount
       FROM debtors WHERE company_id = ?
       GROUP BY status`,
    [companyId]
  );

  res.json({
    open_amount:      Number(totals.open_amount),
    recovered_amount: Number(totals.recovered_amount),
    total_debtors:    Number(totals.total_debtors),
    paid_count:       Number(totals.paid_count),
    conversion_rate:  conversion,
    by_status:        byStatus,
  });
}));

module.exports = router;
