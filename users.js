const express = require('express');
const router = express.Router();
const { pool, auditLog } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('admin'), async (req,res) => {
  try { res.json((await pool.query('SELECT id,email,full_name,picture,role,is_active,last_login,created_at FROM users ORDER BY created_at DESC')).rows); }
  catch(e){ res.status(500).json({error:e.message}); }
});

router.put('/:id/role', requireAuth, requireRole('admin'), async (req,res) => {
  const { role } = req.body;
  if(!['admin','treasurer','secretary','viewer'].includes(role)) return res.status(400).json({error:'Invalid role'});
  try {
    const old = await pool.query('SELECT * FROM users WHERE id=$1',[req.params.id]);
    await pool.query('UPDATE users SET role=$1 WHERE id=$2',[role,req.params.id]);
    await auditLog(pool,req.user.id,req.user.email,'Users','ROLE_CHANGE',req.params.id,
      {role:old.rows[0]?.role},{role},`User ${old.rows[0]?.email} role changed to ${role}`,req.ip);
    res.json({success:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});

router.put('/:id/toggle', requireAuth, requireRole('admin'), async (req,res) => {
  try {
    const r = await pool.query('UPDATE users SET is_active=NOT is_active WHERE id=$1 RETURNING *',[req.params.id]);
    await auditLog(pool,req.user.id,req.user.email,'Users','STATUS_CHANGE',req.params.id,
      null,{is_active:r.rows[0].is_active},
      `User ${r.rows[0].email} ${r.rows[0].is_active?'activated':'deactivated'}`,req.ip);
    res.json(r.rows[0]);
  } catch(e){ res.status(500).json({error:e.message}); }
});

module.exports = router;
