ALTER TABLE bank_accounts ADD COLUMN credit_limit INTEGER;

ALTER TABLE bank_balance_snapshots ADD COLUMN statement_balance INTEGER;
ALTER TABLE bank_balance_snapshots ADD COLUMN payment_due_date TEXT;
ALTER TABLE bank_balance_snapshots ADD COLUMN no_payment_needed INTEGER;

ALTER TABLE connector_settings ADD COLUMN public_config TEXT;
ALTER TABLE bank_balance_snapshots ADD COLUMN statement_closing_date TEXT;

CREATE TABLE IF NOT EXISTS credit_card_bills (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  source_id TEXT NOT NULL,
  billing_period TEXT NOT NULL,        -- "2026-05"
  statement_amount INTEGER,
  minimum_payment INTEGER,
  paid_amount INTEGER,
  is_paid INTEGER,                     -- 0/1
  payment_due_date TEXT,
  statement_closing_date TEXT,
  currency TEXT NOT NULL DEFAULT 'TWD',
  raw_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(connector_id, account_id, billing_period)
);

CREATE INDEX IF NOT EXISTS idx_credit_card_bills_account_period
  ON credit_card_bills (account_id, billing_period);
