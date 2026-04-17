// deductions.js
const express = require('express');
const router = express.Router();
const { pool, auditLog } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  const { year, month } = req.query;
  try {
    const r = await pool.query(
      `SELECT d.*,m.full_name,m.reg_no,m.staff_type FROM monthly_deductions d
       JOIN members m ON d.member_id=m.id WHERE d.year=$1 AND d.month=$2 ORDER BY m.full_name`,
      [year || new Date().getFullYear(), month || new Date().getMonth()+1]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/bulk', requireAuth, requireRole('admin','treasurer'), async (req, res) => {
  const { year, month, entries } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const e of entries) {
      const total = (e.savings_amount||0)+(e.shares_amount||0)+(e.lt_loan_amount||0)+
                    (e.quick_loan_amount||0)+(e.guarantor_recovery||0)+(e.mabugo_amount||0)+(e.other_deduction||0);
      await client.query(
        `INSERT INTO monthly_deductions (member_id,year,month,savings_amount,shares_amount,lt_loan_amount,
          quick_loan_amount,guarantor_recovery,mabugo_amount,other_deduction,total_deduction,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT(member_id,year,month) DO UPDATE SET
           savings_amount=$4,shares_amount=$5,lt_loan_amount=$6,quick_loan_amount=$7,
           guarantor_recovery=$8,mabugo_amount=$9,other_deduction=$10,total_deduction=$11,recorded_by=$12`,
        [e.member_id,year,month,e.savings_amount||0,e.shares_amount||0,e.lt_loan_amount||0,
         e.quick_loan_amount||0,e.guarantor_recovery||0,e.mabugo_amount||0,e.other_deduction||0,total,req.user.id]);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

router.post('/finalise', requireAuth, requireRole('admin','treasurer'), async (req, res) => {
  const { year, month } = req.body;
  try {
    await pool.query(
      'UPDATE monthly_deductions SET is_finalised=true,finalised_at=NOW(),finalised_by=$3 WHERE year=$1 AND month=$2',
      [year, month, req.user.id]);
    await auditLog(pool, req.user.id, req.user.email, 'Deductions', 'FINALISE',
      `${year}-${month}`, null, null, `Deductions for ${year}/${month} finalised`, req.ip);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
