const express = require('express');
const router = express.Router();
const { pool, auditLog } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  const { from, to, category } = req.query;
  let q = 'SELECT e.*,u.full_name AS recorded_by_name FROM expenditures e LEFT JOIN users u ON e.recorded_by=u.id WHERE e.is_void=false';
  const p = [];
  if (from) { p.push(from); q += ` AND e.transaction_date>=$${p.length}`; }
  if (to)   { p.push(to);   q += ` AND e.transaction_date<=$${p.length}`; }
  if (category) { p.push(category); q += ` AND e.category=$${p.length}`; }
  q += ' ORDER BY e.transaction_date DESC, e.created_at DESC';
  try { res.json((await pool.query(q,p)).rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', requireAuth, requireRole('admin','treasurer'), async (req, res) => {
  const { transaction_date,category,sub_category,amount,description,
          payee,payment_method,voucher_no,approved_by } = req.body;
  if (!transaction_date||!category||!amount||!description)
    return res.status(400).json({ error: 'date, category, amount, description required' });
  try {
    const cnt = await pool.query('SELECT COUNT(*) FROM expenditures');
    const ref = 'EXP-'+new Date().getFullYear()+'-'+String(parseInt(cnt.rows[0].count)+1).padStart(4,'0');
    const result = await pool.query(
      `INSERT INTO expenditures (ref_no,transaction_date,category,sub_category,amount,description,
        payee,payment_method,voucher_no,approved_by,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [ref,transaction_date,category,sub_category||null,amount,description,
       payee,payment_method||'Cash',voucher_no,approved_by,req.user.id]);
    const exp = result.rows[0];
    await auditLog(pool,req.user.id,req.user.email,'Expenditure','RECORD',
      String(exp.id),null,exp,
      `${ref}: ${category} — UGX ${amount.toLocaleString()} | ${description}`,req.ip);
    res.status(201).json(exp);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireAuth, requireRole('admin','treasurer'), async (req, res) => {
  try {
    const old = await pool.query('SELECT * FROM expenditures WHERE id=$1', [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ error: 'Not found' });
    const o = old.rows[0];
    const { category=o.category,sub_category=o.sub_category,amount=o.amount,
            description=o.description,payee=o.payee } = req.body;
    const r = await pool.query(
      'UPDATE expenditures SET category=$1,sub_category=$2,amount=$3,description=$4,payee=$5 WHERE id=$6 RETURNING *',
      [category,sub_category,amount,description,payee,req.params.id]);
    await auditLog(pool,req.user.id,req.user.email,'Expenditure','EDIT',
      req.params.id,o,r.rows[0],
      `${o.ref_no} edited: amount ${o.amount} → ${amount}`,req.ip);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/summary/:year/:month', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT category, SUM(amount) as total FROM expenditures
       WHERE EXTRACT(YEAR FROM transaction_date)=$1 AND EXTRACT(MONTH FROM transaction_date)=$2
         AND is_void=false GROUP BY category ORDER BY total DESC`,
      [req.params.year, req.params.month]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
