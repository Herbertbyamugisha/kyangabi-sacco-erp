const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { pool, auditLog } = require('../db');

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Step 1: Redirect user to Google
router.get('/google', (req, res) => {
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    prompt: 'select_account'
  });
  res.redirect(url);
});

// Step 2: Google redirects back here with code
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=auth_failed');
  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Only allow Gmail accounts
    if (!email.endsWith('@gmail.com') && !email.endsWith('@googlemail.com')) {
      const allowedEmails = (process.env.ALLOWED_EMAILS || '').split(',').filter(Boolean);
      if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
        return res.redirect('/?error=not_allowed');
      }
    }

    // Upsert user
    const adminEmail = process.env.ADMIN_EMAIL || '';
    const role = email === adminEmail ? 'admin' : 'viewer';

    const result = await pool.query(
      `INSERT INTO users (google_id, email, full_name, picture, role, last_login)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (email) DO UPDATE SET
         google_id = EXCLUDED.google_id,
         full_name = EXCLUDED.full_name,
         picture = EXCLUDED.picture,
         last_login = NOW()
       RETURNING *`,
      [googleId, email, name, picture, role]
    );
    const user = result.rows[0];

    if (!user.is_active) {
      return res.redirect('/?error=account_suspended');
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.full_name, role: user.role, picture: user.picture },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    req.session.token = token;

    await auditLog(pool, user.id, user.email, 'Auth', 'LOGIN',
      String(user.id), null, null, `${user.full_name} logged in via Google`, req.ip);

    // Redirect with token in URL fragment (SPA-friendly)
    res.redirect(`/app?token=${token}`);
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect('/?error=server_error');
  }
});

// Verify token (frontend calls this on load)
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || req.session?.token;
  if (!token) return res.status(401).json({ authenticated: false });
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ authenticated: true, user });
  } catch {
    res.status(401).json({ authenticated: false });
  }
});

// Logout
router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || req.session?.token;
  if (token) {
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      await auditLog(pool, user.id, user.email, 'Auth', 'LOGOUT',
        String(user.id), null, null, `${user.name} logged out`, req.ip);
    } catch {}
  }
  req.session.destroy();
  res.json({ success: true });
});

module.exports = router;
