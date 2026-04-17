const express = require('express');
const router = express.Router();
const { pool, auditLog } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET all members
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, type, search } = req.query;
    let q = `SELECT m.*, g.full_name AS guarantor_name
             FROM members m LEFT JOIN members g ON m.guarantor_id = g.id WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); q += ` AND m.status=$${params.length}`; }
    if (type)   { params.push(type);   q += ` AND m.staff_type=$${params.length}`; }
    if (search) { params.push(`%${search}%`); q += ` AND (m.full_name ILIKE $${params.length} OR m.reg_no ILIKE $${params.length})`; }
    q += ' ORDER BY m.reg_no';
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single member
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, g.full_name AS guarantor_name,
              (SELECT COUNT(*) FROM loans WHERE member_id=m.id AND status='Active') as active_loans,
              (SELECT COALESCE(SUM(balance),0) FROM loans WHERE member_id=m.id AND status='Active') as total_outstanding,
              (SELECT COALESCE(SUM(amount),0) FROM savings_entries WHERE member_id=m.id) as total_savings
       FROM members m LEFT JOIN members g ON m.guarantor_id=g.id WHERE m.id=$1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Member not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create member
router.post('/', requireAuth, requireRole('admin','treasurer'), async (req, res) => {
  const { reg_no, full_name, national_id, staff_type, department, phone, email,
          date_joined, monthly_savings, share_contribution, registration_fee,
          status, guarantor_id, next_of_kin, remarks } = req.body;
  if (!reg_no || !full_name || !staff_type || !date_joined)
    return res.status(400).json({ error: 'reg_no, full_name, staff_type, date_joined are required' });
  try {
    const result = await pool.query(
      `INSERT INTO members (reg_no,full_name,national_id,staff_type,department,phone,email,
        date_joined,monthly_savings,share_contribution,registration_fee,status,
        guarantor_id,next_of_kin,remarks,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [reg_no,full_name,national_id,staff_type,department,phone,email,
       date_joined,monthly_savings||20000,share_contribution||40000,
       registration_fee||40000,status||'Active',
       guarantor_id||null,next_of_kin,remarks,req.user.id]
    );
    const member = result.rows[0];
    await auditLog(pool, req.user.id, req.user.email, 'Members', 'ADD',
      String(member.id), null, member,
      `New member registered: ${full_name} (Reg: ${reg_no})`, req.ip);
    res.status(201).json(member);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Registration number already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT update member
router.put('/:id', requireAuth, requireRole('admin','treasurer'), async (req, res) => {
  try {
    const old = await pool.query('SELECT * FROM members WHERE id=$1', [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ error: 'Member not found' });
    const o = old.rows[0];
    const { full_name=o.full_name, national_id=o.national_id, staff_type=o.staff_type,
            department=o.department, phone=o.phone, email=o.email,
            date_joined=o.date_joined, monthly_savings=o.monthly_savings,
            share_contribution=o.share_contribution, registration_fee=o.registration_fee,
            status=o.status, guarantor_id=o.guarantor_id, next_of_kin=o.next_of_kin,
            remarks=o.remarks } = req.body;
    const result = await pool.query(
      `UPDATE members SET full_name=$1,national_id=$2,staff_type=$3,department=$4,
        phone=$5,email=$6,date_joined=$7,monthly_savings=$8,share_contribution=$9,
        registration_fee=$10,status=$11,guarantor_id=$12,next_of_kin=$13,remarks=$14,
        updated_by=$15 WHERE id=$16 RETURNING *`,
      [full_name,national_id,staff_type,department,phone,email,date_joined,
       monthly_savings,share_contribution,registration_fee,status,
       guarantor_id||null,next_of_kin,remarks,req.user.id,req.params.id]
    );
    await auditLog(pool, req.user.id, req.user.email, 'Members', 'EDIT',
      req.params.id, o, result.rows[0],
      `Member ${o.reg_no} updated: ${o.full_name}`, req.ip);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET member statement
router.get('/:id/statement', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const member = await pool.query('SELECT * FROM members WHERE id=$1', [req.params.id]);
    if (!member.rows.length) return res.status(404).json({ error: 'Not found' });
    const loans = await pool.query(
      'SELECT * FROM loans WHERE member_id=$1 ORDER BY loan_date DESC', [req.params.id]);
    const savings = await pool.query(
      `SELECT year, month, amount, share_amount FROM savings_entries
       WHERE member_id=$1 ORDER BY year DESC, month DESC LIMIT 24`, [req.params.id]);
    const repayments = await pool.query(
      `SELECT r.*, l.loan_ref FROM loan_repayments r
       JOIN loans l ON r.loan_id=l.id WHERE r.member_id=$1
       ORDER BY r.payment_date DESC LIMIT 20`, [req.params.id]);
    res.json({ member: member.rows[0], loans: loans.rows, savings: savings.rows, repayments: repayments.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
