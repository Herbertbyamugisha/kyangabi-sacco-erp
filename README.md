# KYANGABI CRATER RESORT STAFF SACCO — ERP SYSTEM
## Complete Deployment Guide — Get Live in 30 Minutes (Free)

---

## ARCHITECTURE
```
Browser → Railway (Node.js + Express) → PostgreSQL Database
         ↑
         Google OAuth2 (Gmail login)
```

---

## STEP 1: Create a Free Google Cloud Project (10 minutes)

1. Go to https://console.cloud.google.com
2. Click **"New Project"** → name it "Kyangabi SACCO ERP" → Create
3. In the left menu go to **APIs & Services → OAuth consent screen**
   - User Type: **External**
   - App name: "Kyangabi SACCO ERP"
   - Support email: your Gmail
   - Click Save and Continue (skip scopes, skip test users)
4. Go to **APIs & Services → Credentials**
   - Click **"+ Create Credentials" → OAuth 2.0 Client IDs**
   - Application type: **Web application**
   - Name: "SACCO ERP"
   - Authorized redirect URIs: add `https://YOUR-APP.railway.app/auth/google/callback`
     (you'll get this URL in Step 3 — come back and add it)
   - Click Create
5. **COPY** the Client ID and Client Secret (you need these in Step 3)

---

## STEP 2: Deploy Database on Railway (5 minutes — Free)

1. Go to https://railway.app → Sign up with GitHub (free)
2. Click **"New Project"**
3. Select **"Provision PostgreSQL"**
4. Click on the PostgreSQL service → go to **"Connect"** tab
5. Copy the **"DATABASE_URL"** (looks like: `postgresql://postgres:xxxxx@xxx.railway.app:5432/railway`)
6. Click on **"Query"** tab → paste the entire contents of `backend/schema.sql` → Run
   (This creates all tables and inserts your 47 members)

---

## STEP 3: Deploy the App on Railway (10 minutes)

### Option A: Deploy from GitHub (Recommended)
1. Push this folder to a GitHub repository (https://github.com → New repo → upload files)
2. In Railway: **New Project → Deploy from GitHub repo**
3. Select your repository
4. Railway auto-detects Node.js and deploys

### Option B: Deploy with Railway CLI
```bash
npm install -g @railway/cli
railway login
cd sacco-erp/backend
railway init
railway up
```

### Set Environment Variables in Railway:
Go to your service → **Variables** tab → Add each one:

```
DATABASE_URL          = (paste from Step 2)
JWT_SECRET            = kyangabi_sacco_jwt_secret_2026_very_long_random_string_here
SESSION_SECRET        = kyangabi_session_secret_2026_another_long_random_string
GOOGLE_CLIENT_ID      = (from Step 1)
GOOGLE_CLIENT_SECRET  = (from Step 1)
GOOGLE_REDIRECT_URI   = https://YOUR-APP.railway.app/auth/google/callback
APP_URL               = https://YOUR-APP.railway.app
FRONTEND_URL          = https://YOUR-APP.railway.app
ADMIN_EMAIL           = your.treasurer.email@gmail.com
NODE_ENV              = production
PORT                  = 3000
```

---

## STEP 4: Get Your HTTPS URL

After deployment, Railway gives you a URL like:
**`https://kyangabi-sacco-erp-production.railway.app`**

Go back to Google Cloud Console → your OAuth credentials → add this URL to "Authorized redirect URIs":
`https://kyangabi-sacco-erp-production.railway.app/auth/google/callback`

---

## STEP 5: First Login

1. Visit your Railway URL
2. Click **"Sign in with Google"**
3. The email matching `ADMIN_EMAIL` gets **admin** role automatically
4. All other Gmail users who sign in get **viewer** role by default
5. The Admin can promote users to treasurer/secretary via the **Users** tab

---

## USER ROLES

| Role       | Access |
|------------|--------|
| admin      | Full access + user management + settings |
| treasurer  | Read + write everything except user management |
| secretary  | Read + write members, savings, deductions |
| viewer     | Read-only access |

---

## FOLDER STRUCTURE
```
sacco-erp/
├── backend/
│   ├── server.js          ← Main Express server
│   ├── db.js              ← PostgreSQL connection
│   ├── schema.sql         ← Run this first to set up database
│   ├── package.json       ← Dependencies
│   ├── .env.example       ← Copy to .env and fill in values
│   ├── middleware/
│   │   └── auth.js        ← JWT authentication
│   └── routes/
│       ├── auth.js        ← Google OAuth
│       ├── members.js     ← Members CRUD
│       ├── loans.js       ← Loans + repayments
│       ├── savings.js     ← Savings entries
│       ├── deductions.js  ← Monthly deductions
│       ├── expenditures.js← Daily expenditure
│       ├── reports.js     ← Dashboard + reports
│       ├── settings.js    ← SACCO config
│       ├── audit.js       ← Audit trail
│       └── users.js       ← User management
└── frontend/
    └── public/
        └── index.html     ← Complete single-page application
```

---

## CUSTOM DOMAIN (Optional — UGX 50,000/year)

1. Buy domain from Namecheap: e.g. `kyangabisacco.org` (~$10/yr)
2. In Railway: Settings → Domains → Add custom domain
3. At Namecheap: add CNAME record pointing to Railway URL
4. Update `GOOGLE_REDIRECT_URI` and `APP_URL` in Railway variables

---

## LOCAL DEVELOPMENT (For IT/Developer)

```bash
# 1. Install PostgreSQL locally
# 2. Create database
createdb sacco_db
psql sacco_db < backend/schema.sql

# 3. Install dependencies
cd backend
npm install

# 4. Create .env file
cp .env.example .env
# Edit .env with your values

# 5. Start server
npm run dev

# 6. Open browser
# http://localhost:3000
```

---

## SUPPORT CONTACTS
- Railway docs: https://docs.railway.app
- Google OAuth: https://developers.google.com/identity/protocols/oauth2
- PostgreSQL: https://www.postgresql.org/docs/

---

## SECURITY NOTES
- All passwords are JWT-secured — no raw passwords stored
- Google handles all authentication — SACCO never sees passwords
- All data changes are logged with timestamp + user in audit_log table
- HTTPS is automatic on Railway (TLS/SSL included free)
- Session tokens expire after 8 hours

---

*Kyangabi Crater Resort Staff SACCO ERP v2.0 — 2026*
