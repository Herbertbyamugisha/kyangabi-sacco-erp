-- ═══════════════════════════════════════════════════════════════════════════
-- KYANGABI CRATER RESORT STAFF SACCO — DATABASE SCHEMA
-- Run this in your PostgreSQL database ONCE to set up all tables
-- ═══════════════════════════════════════════════════════════════════════════

-- USERS & AUTHENTICATION
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  google_id VARCHAR(100) UNIQUE,
  email VARCHAR(150) UNIQUE NOT NULL,
  full_name VARCHAR(120),
  picture TEXT,
  role VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('admin','treasurer','secretary','viewer')),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MEMBERS REGISTER
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  reg_no VARCHAR(20) UNIQUE NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  national_id VARCHAR(30),
  staff_type VARCHAR(20) CHECK (staff_type IN ('Permanent','Semi-Permanent','Casual')),
  department VARCHAR(60),
  phone VARCHAR(30),
  email VARCHAR(100),
  date_joined DATE NOT NULL,
  monthly_savings INTEGER DEFAULT 20000,
  share_contribution INTEGER DEFAULT 40000,
  registration_fee INTEGER DEFAULT 40000,
  status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active','Inactive','Suspended','Exited')),
  guarantor_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
  next_of_kin VARCHAR(120),
  remarks TEXT,
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- LOANS REGISTER
CREATE TABLE IF NOT EXISTS loans (
  id SERIAL PRIMARY KEY,
  loan_ref VARCHAR(20) UNIQUE NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id),
  loan_type VARCHAR(30) CHECK (loan_type IN ('Long Term','Quick Loan','Emergency Loan','MABUGO')),
  loan_date DATE NOT NULL,
  principal BIGINT NOT NULL,
  interest_amount BIGINT NOT NULL,
  annual_rate NUMERIC(5,2) DEFAULT 15.00,
  duration_months INTEGER NOT NULL,
  monthly_instalment BIGINT,
  total_payable BIGINT,
  amount_repaid BIGINT DEFAULT 0,
  balance BIGINT,
  guarantor_id INTEGER REFERENCES members(id),
  purpose TEXT,
  status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active','Cleared','Defaulted','Restructured','Pending')),
  disbursed_by INTEGER REFERENCES users(id),
  approved_by VARCHAR(80),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- LOAN REPAYMENTS
CREATE TABLE IF NOT EXISTS loan_repayments (
  id SERIAL PRIMARY KEY,
  loan_id INTEGER NOT NULL REFERENCES loans(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  payment_date DATE NOT NULL,
  amount_paid BIGINT NOT NULL,
  principal_portion BIGINT,
  interest_portion BIGINT,
  balance_before BIGINT,
  balance_after BIGINT,
  payment_method VARCHAR(30) DEFAULT 'Payroll Deduction',
  reference_no VARCHAR(40),
  recorded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SAVINGS LEDGER (monthly entries per member)
CREATE TABLE IF NOT EXISTS savings_entries (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount BIGINT NOT NULL DEFAULT 0,
  share_amount BIGINT DEFAULT 0,
  reg_fee BIGINT DEFAULT 0,
  payment_method VARCHAR(30) DEFAULT 'Payroll Deduction',
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(member_id, year, month)
);

-- MONTHLY DEDUCTIONS (payroll sheet per member per month)
CREATE TABLE IF NOT EXISTS monthly_deductions (
  id SERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  savings_amount BIGINT DEFAULT 0,
  shares_amount BIGINT DEFAULT 0,
  lt_loan_amount BIGINT DEFAULT 0,
  quick_loan_amount BIGINT DEFAULT 0,
  guarantor_recovery BIGINT DEFAULT 0,
  mabugo_amount BIGINT DEFAULT 0,
  other_deduction BIGINT DEFAULT 0,
  total_deduction BIGINT DEFAULT 0,
  is_finalised BOOLEAN DEFAULT false,
  finalised_at TIMESTAMP,
  finalised_by INTEGER REFERENCES users(id),
  recorded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(member_id, year, month)
);

-- EXPENDITURE (daily entries)
CREATE TABLE IF NOT EXISTS expenditures (
  id SERIAL PRIMARY KEY,
  ref_no VARCHAR(30) UNIQUE NOT NULL,
  transaction_date DATE NOT NULL,
  category VARCHAR(60) NOT NULL,
  sub_category VARCHAR(80),
  amount BIGINT NOT NULL,
  description TEXT NOT NULL,
  payee VARCHAR(120),
  payment_method VARCHAR(30) DEFAULT 'Cash',
  voucher_no VARCHAR(40),
  approved_by VARCHAR(60),
  recorded_by INTEGER REFERENCES users(id),
  is_void BOOLEAN DEFAULT false,
  void_reason TEXT,
  voided_by INTEGER REFERENCES users(id),
  voided_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INCOME (non-savings income entries)
CREATE TABLE IF NOT EXISTS income_entries (
  id SERIAL PRIMARY KEY,
  ref_no VARCHAR(30) UNIQUE NOT NULL,
  transaction_date DATE NOT NULL,
  category VARCHAR(60) NOT NULL,
  amount BIGINT NOT NULL,
  description TEXT,
  received_from VARCHAR(120),
  payment_method VARCHAR(30) DEFAULT 'Cash',
  recorded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AUDIT TRAIL (immutable log)
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  user_email VARCHAR(150),
  module VARCHAR(40) NOT NULL,
  action VARCHAR(40) NOT NULL,
  record_id VARCHAR(40),
  old_values JSONB,
  new_values JSONB,
  description TEXT NOT NULL,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SACCO SETTINGS
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(60) PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── DEFAULT SETTINGS ───────────────────────────────────────────────────────
INSERT INTO settings (key, value, description) VALUES
  ('sacco_name',        'Kyangabi Crater Resort Staff SACCO', 'SACCO full name'),
  ('reg_number',        'SACCO/2023/001',                     'Registration number'),
  ('address',           'Kyangabi Crater Resort, Uganda',     'Physical address'),
  ('lt_interest_rate',  '15',                                 'Long term loan annual interest rate %'),
  ('ql_interest_rate',  '20',                                 'Quick loan annual interest rate %'),
  ('min_savings',       '20000',                              'Minimum monthly savings UGX'),
  ('mabugo_amount',     '10000',                              'MABUGO monthly contribution UGX'),
  ('reg_fee',           '40000',                              'Member registration fee UGX'),
  ('share_value',       '40000',                              'Share value UGX'),
  ('loan_multiplier',   '3',                                  'Max loan = X times savings'),
  ('financial_year',    'January',                            'Financial year start month'),
  ('chairperson',       '',                                   'SACCO Chairperson name'),
  ('treasurer',         '',                                   'SACCO Treasurer name'),
  ('secretary',         '',                                   'SACCO Secretary name')
ON CONFLICT (key) DO NOTHING;

-- ─── INDEXES FOR PERFORMANCE ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_reg_no ON members(reg_no);
CREATE INDEX IF NOT EXISTS idx_loans_member ON loans(member_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_savings_member_year ON savings_entries(member_id, year);
CREATE INDEX IF NOT EXISTS idx_deductions_year_month ON monthly_deductions(year, month);
CREATE INDEX IF NOT EXISTS idx_expenditures_date ON expenditures(transaction_date);
CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_log(module);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ─── TRIGGER: auto-update updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_members_updated
  BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_loans_updated
  BEFORE UPDATE ON loans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER trg_deductions_updated
  BEFORE UPDATE ON monthly_deductions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── SEED MEMBERS (from existing 2024 data) ─────────────────────────────────
INSERT INTO members (reg_no,full_name,staff_type,date_joined,monthly_savings,status) VALUES
('001','Kayondo Charles','Permanent','2023-01-20',20000,'Active'),
('002','Byaruhanga Samuel','Permanent','2023-01-20',150000,'Active'),
('003','Eseru Sonniah Jacqueline','Permanent','2023-01-20',60000,'Active'),
('004','Agudiku Alfred','Permanent','2023-01-20',40000,'Active'),
('009','Ngobi Gerald','Permanent','2023-01-20',50000,'Active'),
('010','Twesigye Evaristo','Permanent','2023-01-20',30000,'Active'),
('011','Kembabazi Irene','Permanent','2023-01-20',30000,'Active'),
('012','Mutegeki Rodgers','Permanent','2023-01-20',30000,'Active'),
('017','Muhindo Harriet','Permanent','2023-01-20',20000,'Active'),
('021','Mwitale Wilbroad','Permanent','2023-01-20',30000,'Active'),
('022','Sunday Vincent Kagwa','Permanent','2023-01-20',50000,'Active'),
('024','Bakyenga Pius','Permanent','2023-01-20',20000,'Active'),
('027','Kakuru Anold','Permanent','2023-01-20',30000,'Active'),
('028','Mucunguzi Deus','Permanent','2023-01-20',25000,'Active'),
('029','Bigirwamukama Francis','Permanent','2023-01-20',20000,'Active'),
('030','Natumanya Ivan','Permanent','2023-01-20',20000,'Active'),
('033','Mugizi Brian','Permanent','2023-01-20',25000,'Active'),
('041','Ampirwe Evaristo','Semi-Permanent','2023-01-20',25000,'Active'),
('042','Musinguzi Ambrose','Semi-Permanent','2023-01-20',25000,'Active'),
('043','Nuwagaba Norbert','Permanent','2023-01-20',30000,'Active'),
('048','Beinomugisha Amos','Permanent','2023-01-20',20000,'Active'),
('052','Muzoora Aggrey','Permanent','2023-01-20',30000,'Active'),
('053','Nkamwesiga Richard','Permanent','2023-01-20',20000,'Active'),
('058','Tumusiime Olivia','Permanent','2023-01-20',20000,'Active'),
('060','Natukunda Alima','Semi-Permanent','2023-01-20',50000,'Active'),
('061','Mugisha Richard','Semi-Permanent','2023-01-20',30000,'Active'),
('062','Masoma Derrick','Semi-Permanent','2023-01-20',30000,'Active'),
('063','Kabugho Immaculate','Semi-Permanent','2023-03-01',50000,'Active'),
('064','Mumbere William','Semi-Permanent','2023-03-01',20000,'Active'),
('065','Kyomukama Caroline','Semi-Permanent','2023-07-01',20000,'Active'),
('066','Kule Festo','Semi-Permanent','2023-08-01',100000,'Active'),
('067','Natukunda Vincent','Semi-Permanent','2023-08-01',50000,'Active'),
('068','Ssewanyana Robert','Semi-Permanent','2023-08-01',50000,'Active'),
('069','Bwemi Dennis','Semi-Permanent','2023-08-01',20000,'Active'),
('070','Ngabirano Ronnet','Semi-Permanent','2023-10-01',70000,'Active'),
('071','Turyatunga Edson','Permanent','2023-01-20',20000,'Active'),
('072','Kiiza Mariuth','Permanent','2023-01-20',30000,'Active'),
('073','Naturiinda Caroline','Permanent','2023-01-20',20000,'Active'),
('074','Kato Jimmy','Permanent','2023-01-20',20000,'Active'),
('075','Ahimbisibwe Posiano','Semi-Permanent','2024-06-01',20000,'Active'),
('076','Tusiime Edwine','Semi-Permanent','2024-07-01',20000,'Active'),
('077','Ssemwogerere Joel','Semi-Permanent','2024-12-01',20000,'Active'),
('079','Tibeijuka Zaverio','Permanent','2024-12-01',20000,'Active'),
('080','Byaruhanga Lawrence','Permanent','2024-12-01',50000,'Active'),
('081','Kaakyo Pamela','Permanent','2023-03-01',30000,'Active'),
('082','Kule Silvester','Permanent','2023-03-01',40000,'Active'),
('083','Naturiinda Caroline','Permanent','2023-01-20',20000,'Active')
ON CONFLICT (reg_no) DO NOTHING;
