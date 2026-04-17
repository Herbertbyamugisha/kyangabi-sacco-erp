const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

// Helper: log to audit_log
async function auditLog(client_or_pool, userId, userEmail, module, action, recordId, oldValues, newValues, description, ip) {
  try {
    await (client_or_pool).query(
      `INSERT INTO audit_log (user_id,user_email,module,action,record_id,old_values,new_values,description,ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [userId, userEmail, module, action, recordId,
       oldValues ? JSON.stringify(oldValues) : null,
       newValues ? JSON.stringify(newValues) : null,
       description, ip || null]
    );
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

module.exports = { pool, auditLog };
