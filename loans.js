const express = require('express');
const router = express.Router();
const { pool, auditLog } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET all loans
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, m.full_name, m.reg_no, g.full_name AS guarantor_name
       FROM loans l JOIN members m ON l.member_id=m.id
       LEFT JOIN members g ON l.guarantor_id=g.id
       ORDER BY l.created_at DESC`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET loan schedule
router.get('/:id/schedule', requireAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT l.*,m.full_name FROM loans l JOIN members m ON l.member_id=m.id WHERE l.id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Loan not found' });
    const loan = r.rows[0];
    const schedule = generateSchedule(loan.principal, loan.annual_rate / 100, loan.duration_months, loan.loan_date);
    res.json({ loan, schedule });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST create loan
router.post('/', requireAuth, requireRole('admin','treasurer'), async (req, res) => {
  const { member_id, loan_type, loan_date, principal, annual_rate, duration_months,
          guarantor_id, purpose, approved_by, notes } = req.body;
  if (!member_id || !loan_date || !principal || !duration_months)
    return res.status(400).json({ error: 'Missing required fields' });
  try {
    const rate = (annual_rate || 15) / 100;
    const interest = principal * (rate / 12) * duration_months;
    const total = principal + interest;
    const instalment = Math.round(total / duration_months);
    const countRes = await pool.query('SELECT COUNT(*) FROM loans');
    const loanRef = 'LN-' + String(parseInt(countRes.rows[0].count) + 1).padStart(3, '0');
    const result = await pool.query(
      `INSERT INTO loans (loan_ref,member_id,loan_type,loan_date,principal,interest_amount,
        annual_rate,duration_months,monthly_instalment,total_payable,balance,
        guarantor_id,purpose,approved_by,status,notes,disbursed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Active',$15,$16) RETURNING *`,
      [loanRef,member_id,loan_type||'Long Term',loan_date,principal,Math.round(interest),
       annual_rate||15,duration_months,instalment,Math.round(total),Math.round(total),
       guarantor_id||null,purpose,approved_by,notes,req.user.id]
    );
    const loan = result.rows[0];
    await auditLog(pool, req.user.id, req.user.email, 'Loans', 'DISBURSE',
      String(loan.id), null, loan,
      `${loanRef} disbursed to member ${member_id}: UGX ${principal.toLocaleString()}`, req.ip);
    res.status(201).json(loan);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST record repayment
router.post('/:id/repay', requireAuth, requireRole('admin','treasurer'), async (req, res) => {
  const { amount_paid, payment_date, payment_method, reference_no } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const loanRes = await client.query('SELECT * FROM loans WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!loanRes.rows.length) throw new Error('Loan not found');
    const loan = loanRes.rows[0];
    if (loan.status === 'Cleared') throw new Error('Loan already cleared');
    const balBefore = loan.balance;
    const balAfter = Math.max(0, balBefore - amount_paid);
    const newRepaid = (loan.amount_repaid || 0) + amount_paid;
    const intPortion = Math.round((loan.interest_amount / loan.duration_months));
    const princPortion = amount_paid - intPortion;
    await client.query(
      `INSERT INTO loan_repayments (loan_id,member_id,payment_date,amount_paid,
        principal_portion,interest_portion,balance_before,balance_after,payment_method,reference_no,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [loan.id,loan.member_id,payment_date||new Date().toISOString().split('T')[0],
       amount_paid,princPortion,intPortion,balBefore,balAfter,
       payment_method||'Payroll Deduction',reference_no,req.user.id]
    );
    const newStatus = balAfter === 0 ? 'Cleared' : 'Active';
    await client.query(
      'UPDATE loans SET balance=$1,amount_repaid=$2,status=$3,updated_at=NOW() WHERE id=$4',
      [balAfter, newRepaid, newStatus, loan.id]
    );
    await client.query('COMMIT');
    await auditLog(pool, req.user.id, req.user.email, 'Loans', 'REPAYMENT',
      String(loan.id), { balance: balBefore }, { balance: balAfter },
      `${loan.loan_ref}: UGX ${amount_paid.toLocaleString()} received. Balance: ${balBefore} → ${balAfter}`, req.ip);
    res.json({ success: true, balance_after: balAfter, status: newStatus });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// PUT update loan
router.put('/:id', requireAuth, requireRole('admin','treasurer'), async (req, res) => {
  try {
    const old = await pool.query('SELECT * FROM loans WHERE id=$1', [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ error: 'Not found' });
    const o = old.rows[0];
    const { status=o.status, notes=o.notes, purpose=o.purpose } = req.body;
    const result = await pool.query(
      'UPDATE loans SET status=$1,notes=$2,purpose=$3,updated_at=NOW() WHERE id=$4 RETURNING *',
      [status,notes,purpose,req.params.id]
    );
    await auditLog(pool, req.user.id, req.user.email, 'Loans', 'EDIT',
      req.params.id, o, result.rows[0],
      `${o.loan_ref} updated: status ${o.status} → ${status}`, req.ip);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function generateSchedule(principal, annualRate, months, startDate) {
  const monthlyRate = annualRate / 12;
  const pmt = monthlyRate > 0
    ? principal * (monthlyRate * Math.pow(1+monthlyRate, months)) / (Math.pow(1+monthlyRate, months)-1)
    : principal / months;
  const rows = [];
  let balance = principal;
  const start = new Date(startDate);
  for (let i = 1; i <= months; i++) {
    const d = new Date(start); d.setMonth(d.getMonth() + i);
    const interest = Math.round(balance * monthlyRate);
    const princ = Math.round(pmt) - interest;
    balance = Math.max(0, balance - princ);
    rows.push({ period: i, date: d.toISOString().split('T')[0],
      payment: Math.round(pmt), principal: princ, interest, balance });
  }
  return rows;
}

module.exports = router;
