// reports.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const [members, loans, savings, expenditure] = await Promise.all([
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='Active') as active FROM members`),
      pool.query(`SELECT COUNT(*) FILTER(WHERE status='Active') as active_loans,
                   COUNT(*) FILTER(WHERE status='Cleared') as cleared_loans,
                   COUNT(*) FILTER(WHERE status='Defaulted') as defaulted_loans,
                   COALESCE(SUM(balance) FILTER(WHERE status='Active'),0) as outstanding,
                   COALESCE(SUM(principal),0) as total_disbursed FROM loans`),
      pool.query(`SELECT COALESCE(SUM(amount),0) as total_savings,
                   COALESCE(SUM(amount) FILTER(WHERE year=EXTRACT(YEAR FROM NOW()) AND month=EXTRACT(MONTH FROM NOW())),0) as this_month
                   FROM savings_entries`),
      pool.query(`SELECT COALESCE(SUM(amount) FILTER(WHERE EXTRACT(YEAR FROM transaction_date)=EXTRACT(YEAR FROM NOW())),0) as ytd_exp,
                   COALESCE(SUM(amount) FILTER(WHERE EXTRACT(YEAR FROM transaction_date)=EXTRACT(YEAR FROM NOW()) AND EXTRACT(MONTH FROM transaction_date)=EXTRACT(MONTH FROM NOW())),0) as this_month_exp
                   FROM expenditures WHERE is_void=false`),
    ]);
    res.json({
      members: members.rows[0],
      loans: loans.rows[0],
      savings: savings.rows[0],
      expenditure: expenditure.rows[0]
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/monthly/:year/:month', requireAuth, async (req, res) => {
  const { year, month } = req.params;
  try {
    const [savings, deductions, expenditure, newMembers, loanDisb] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(amount),0) as total FROM savings_entries WHERE year=$1 AND month=$2',[year,month]),
      pool.query('SELECT COALESCE(SUM(total_deduction),0) as total FROM monthly_deductions WHERE year=$1 AND month=$2',[year,month]),
      pool.query(`SELECT category, SUM(amount) as total FROM expenditures WHERE EXTRACT(YEAR FROM transaction_date)=$1 AND EXTRACT(MONTH FROM transaction_date)=$2 AND is_void=false GROUP BY category`,[year,month]),
      pool.query(`SELECT COUNT(*) FROM members WHERE EXTRACT(YEAR FROM date_joined)=$1 AND EXTRACT(MONTH FROM date_joined)=$2`,[year,month]),
      pool.query(`SELECT COALESCE(SUM(principal),0) as total FROM loans WHERE EXTRACT(YEAR FROM loan_date)=$1 AND EXTRACT(MONTH FROM loan_date)=$2`,[year,month]),
    ]);
    res.json({ year, month, savings: savings.rows[0], deductions: deductions.rows[0], expenditure: expenditure.rows, newMembers: newMembers.rows[0], loanDisbursements: loanDisb.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/trial-balance/:year', requireAuth, async (req, res) => {
  try {
    const y = req.params.year;
    const [sav, loans, exp, inc] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(amount),0) as total FROM savings_entries WHERE year<=$1',[y]),
      pool.query('SELECT COALESCE(SUM(balance),0) as outstanding, COALESCE(SUM(amount_repaid),0) as repaid FROM loans WHERE EXTRACT(YEAR FROM loan_date)<=$1',[y]),
      pool.query(`SELECT category, COALESCE(SUM(amount),0) as total FROM expenditures WHERE EXTRACT(YEAR FROM transaction_date)<=$1 AND is_void=false GROUP BY category`,[y]),
      pool.query(`SELECT COALESCE(SUM(l.interest_amount),0) as interest_income FROM loans l WHERE EXTRACT(YEAR FROM l.loan_date)<=$1`,[y]),
    ]);
    res.json({ year: y, savings_total: sav.rows[0], loans: loans.rows[0], expenditures: exp.rows, income: inc.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
