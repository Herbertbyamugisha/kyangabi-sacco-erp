// ─── savings.js ───────────────────────────────────────────────────────────────
const express = require('express');
const savRouter = express.Router();
const { pool, auditLog } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

savRouter.get('/', requireAuth, async (req, res) => {
  const { year, month, member_id } = req.query;
  let q = 'SELECT s.*,m.full_name,m.reg_no FROM savings_entries s JOIN members m ON s.member_id=m.id WHERE 1=1';
  const p = [];
  if (year) { p.push(year); q += ` AND s.year=$${p.length}`; }
  if (month) { p.push(month); q += ` AND s.month=$${p.length}`; }
  if (member_id) { p.push(member_id); q += ` AND s.member_id=$${p.length}`; }
  q += ' ORDER BY m.full_name, s.year, s.month';
  try { res.json((await pool.query(q, p)).rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

savRouter.post('/bulk', requireAuth, requireRole('admin','treasurer'), async (req, res) => {
  const { year, month, entries } = req.body;
  if (!year || !month || !entries?.length) return res.status(400).json({ error: 'year, month and entries required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const e of entries) {
      await client.query(
        `INSERT INTO savings_entries (member_id,year,month,amount,share_amount,reg_fee,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(member_id,year,month)
         DO UPDATE SET amount=$4,share_amount=$5,reg_fee=$6,recorded_by=$7`,
        [e.member_id,year,month,e.amount||0,e.share_amount||0,e.reg_fee||0,req.user.id]);
    }
    await client.query('COMMIT');
    const total = entries.reduce((a,e) => a+(e.amount||0),0);
    await auditLog(pool, req.user.id, req.user.email, 'Savings', 'BULK_ENTRY',
      `${year}-${month}`, null, null,
      `Savings recorded for ${year}/${month}: ${entries.length} members, total UGX ${total.toLocaleString()}`, req.ip);
    res.json({ success: true, count: entries.length });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

savRouter.get('/ledger/:year', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.id,m.full_name,m.reg_no,m.monthly_savings,
        COALESCE(SUM(CASE WHEN s.month=1 THEN s.amount END),0) AS jan,
        COALESCE(SUM(CASE WHEN s.month=2 THEN s.amount END),0) AS feb,
        COALESCE(SUM(CASE WHEN s.month=3 THEN s.amount END),0) AS mar,
        COALESCE(SUM(CASE WHEN s.month=4 THEN s.amount END),0) AS apr,
        COALESCE(SUM(CASE WHEN s.month=5 THEN s.amount END),0) AS may,
        COALESCE(SUM(CASE WHEN s.month=6 THEN s.amount END),0) AS jun,
        COALESCE(SUM(CASE WHEN s.month=7 THEN s.amount END),0) AS jul,
        COALESCE(SUM(CASE WHEN s.month=8 THEN s.amount END),0) AS aug,
        COALESCE(SUM(CASE WHEN s.month=9 THEN s.amount END),0) AS sep,
        COALESCE(SUM(CASE WHEN s.month=10 THEN s.amount END),0) AS oct,
        COALESCE(SUM(CASE WHEN s.month=11 THEN s.amount END),0) AS nov,
        COALESCE(SUM(CASE WHEN s.month=12 THEN s.amount END),0) AS dec_m,
        COALESCE(SUM(s.amount),0) AS annual_total
       FROM members m LEFT JOIN savings_entries s ON m.id=s.member_id AND s.year=$1
       WHERE m.status='Active' GROUP BY m.id,m.full_name,m.reg_no,m.monthly_savings ORDER BY m.full_name`,
      [req.params.year]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = savRouter;
