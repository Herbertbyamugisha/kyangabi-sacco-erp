require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── SECURITY MIDDLEWARE ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'sacco_secret_2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000  // 8 hours
  }
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

// ─── STATIC FILES ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ─── ROUTES ──────────────────────────────────────────────────────────────────
app.use('/auth',     require('./routes/auth'));
app.use('/api/members',      require('./routes/members'));
app.use('/api/loans',        require('./routes/loans'));
app.use('/api/savings',      require('./routes/savings'));
app.use('/api/deductions',   require('./routes/deductions'));
app.use('/api/expenditures', require('./routes/expenditures'));
app.use('/api/reports',      require('./routes/reports'));
app.use('/api/settings',     require('./routes/settings'));
app.use('/api/audit',        require('./routes/audit'));
app.use('/api/users',        require('./routes/users'));

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ─── CATCH-ALL: serve frontend ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// ─── ERROR HANDLER ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Server error' : err.message
  });
});

app.listen(PORT, () => {
  console.log(`\n✅ Kyangabi SACCO ERP running on port ${PORT}`);
  console.log(`   ${process.env.NODE_ENV === 'production' ? process.env.APP_URL : 'http://localhost:'+PORT}\n`);
});
