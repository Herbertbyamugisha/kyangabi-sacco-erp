// audit.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('admin','treasurer'), async (req,res) => {
  const { module: mod, from, to, limit=200 } = req.query;
  let q = 'SELECT a.*,u.full_name FROM audit_log a LEFT JOIN users u ON a.user_id=u.id WHERE 1=1';
  const p=[];
  if(mod){ p.push(mod); q+=` AND a.module=$${p.length}`; }
  if(from){ p.push(from); q+=` AND a.created_at>=$${p.length}`; }
  if(to){ p.push(to); q+=` AND a.created_at<=$${p.length}`; }
  q+=` ORDER BY a.created_at DESC LIMIT ${parseInt(limit)}`;
  try { res.json((await pool.query(q,p)).rows); }
  catch(e){ res.status(500).json({error:e.message}); }
});

router.get('/monthly/:year/:month', requireAuth, requireRole('admin','treasurer'), async (req,res) => {
  try {
    const {year,month}=req.params;
    const r = await pool.query(
      `SELECT module, action, COUNT(*) as count FROM audit_log
       WHERE EXTRACT(YEAR FROM created_at)=$1 AND EXTRACT(MONTH FROM created_at)=$2
       GROUP BY module,action ORDER BY count DESC`, [year,month]);
    res.json(r.rows);
  } catch(e){ res.status(500).json({error:e.message}); }
});

module.exports = router;
