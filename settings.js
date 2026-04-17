// settings.js
const express = require('express');
const router = express.Router();
const { pool, auditLog } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, async (req,res) => {
  try { res.json((await pool.query('SELECT * FROM settings ORDER BY key')).rows); }
  catch(e){ res.status(500).json({error:e.message}); }
});
router.put('/', requireAuth, requireRole('admin'), async (req,res) => {
  const entries = Object.entries(req.body);
  try {
    for(const [key,value] of entries)
      await pool.query('UPDATE settings SET value=$1,updated_by=$2,updated_at=NOW() WHERE key=$3',[value,req.user.id,key]);
    await auditLog(pool,req.user.id,req.user.email,'Settings','UPDATE',null,null,null,`Settings updated: ${entries.map(([k])=>k).join(', ')}`,req.ip);
    res.json({success:true});
  } catch(e){ res.status(500).json({error:e.message}); }
});
module.exports = router;
