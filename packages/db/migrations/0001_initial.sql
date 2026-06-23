CREATE TABLE IF NOT EXISTS connector_settings (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  encrypted_config TEXT NOT NULL,
  sync_cursor TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (connector_id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  invoice_number TEXT,
  invoice_date TEXT NOT NULL,
  seller_name TEXT,
  amount INTEGER NOT NULL,
  raw_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (connector_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date
  ON invoices (invoice_date);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  connector_id TEXT NOT NULL,
  invoice_source_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  line_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL,
  unit_price INTEGER,
  amount INTEGER NOT NULL,
  raw_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  UNIQUE (connector_id, invoice_source_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id
  ON invoice_line_items (invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_source
  ON invoice_line_items (connector_id, invoice_source_id);

CREATE TABLE IF NOT EXISTS investment_positions (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('stock', 'etf', 'fund')),
  symbol TEXT,
  name TEXT NOT NULL,
  quantity REAL,
  market_value INTEGER,
  cash_balance INTEGER,
  currency TEXT NOT NULL DEFAULT 'TWD',
  as_of_date TEXT NOT NULL,
  raw_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (connector_id, source_id, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_investment_positions_as_of_date
  ON investment_positions (as_of_date);

CREATE INDEX IF NOT EXISTS idx_investment_positions_asset_type
  ON investment_positions (asset_type);

CREATE TABLE IF NOT EXISTS investment_transactions (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  broker_no TEXT,
  broker_account TEXT,
  broker_name TEXT,
  symbol TEXT,
  name TEXT,
  asset_type TEXT CHECK (asset_type IN ('stock', 'etf', 'fund', 'bond', 'unknown')),
  trade_date TEXT,
  posted_date TEXT,
  transaction_code TEXT,
  transaction_name TEXT,
  quantity REAL,
  price REAL,
  amount INTEGER,
  currency TEXT NOT NULL DEFAULT 'TWD',
  raw_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (connector_id, account_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_investment_transactions_trade_date
  ON investment_transactions (trade_date);

CREATE INDEX IF NOT EXISTS idx_investment_transactions_symbol
  ON investment_transactions (symbol);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  institution_name TEXT,
  account_name TEXT,
  account_type TEXT CHECK (
    account_type IS NULL
    OR account_type IN ('checking', 'savings', 'credit', 'loan', 'settlement_cash', 'stored_value', 'unknown')
  ),
  currency TEXT NOT NULL DEFAULT 'TWD',
  raw_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  bank_code TEXT,
  account_last4 TEXT,
  canonical_account_id TEXT REFERENCES bank_accounts (id),
  UNIQUE (connector_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_match
  ON bank_accounts (bank_code, account_last4, currency);

CREATE TABLE IF NOT EXISTS bank_balance_snapshots (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  balance INTEGER NOT NULL,
  available_balance INTEGER,
  currency TEXT NOT NULL DEFAULT 'TWD',
  as_of_at TEXT NOT NULL,
  raw_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (connector_id, account_id, source_id),
  FOREIGN KEY (account_id) REFERENCES bank_accounts (id)
);

CREATE INDEX IF NOT EXISTS idx_bank_balance_snapshots_account_as_of
  ON bank_balance_snapshots (account_id, as_of_at);

CREATE INDEX IF NOT EXISTS idx_bank_balance_snapshots_as_of
  ON bank_balance_snapshots (as_of_at);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  posted_date TEXT,
  authorized_at TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TWD',
  description TEXT,
  counterparty TEXT,
  raw_payload TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (connector_id, account_id, source_id),
  FOREIGN KEY (account_id) REFERENCES bank_accounts (id)
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_posted_date
  ON bank_transactions (account_id, posted_date);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_posted_date
  ON bank_transactions (posted_date);

CREATE TABLE IF NOT EXISTS net_worth_history (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  net_worth INTEGER NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'total',
  source TEXT NOT NULL,
  snapshotted_at TEXT NOT NULL,
  UNIQUE (source, asset_type, date)
);

CREATE INDEX IF NOT EXISTS idx_net_worth_history_date
  ON net_worth_history (date);

CREATE TABLE IF NOT EXISTS exchange_rates (
  currency TEXT PRIMARY KEY,
  rate_to_twd REAL NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manual_assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classification_categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO classification_categories
  (id, label, sort_order, is_system, created_at, updated_at) VALUES
  ('salary',        '薪資',   1,  1, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('transfer',      '轉帳',   2,  1, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('food',          '餐飲',   3,  1, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('transport',     '交通',   4,  1, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('shopping',      '購物',   5,  1, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('housing',       '居住',   6,  1, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('health',        '醫療',   7,  1, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('education',     '教育',   8,  1, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('entertainment', '娛樂',   9,  1, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('investment',    '投資',   10, 1, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('fee',           '手續費', 11, 1, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('insurance',     '保險',   12, 1, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('tax',           '稅務',   13, 1, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('other',         '其他',   14, 1, '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS classification_overrides (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES classification_categories(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_classification_overrides_category
  ON classification_overrides (category_id);

CREATE TABLE IF NOT EXISTS classification_rules (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES classification_categories(id),
  target_type TEXT,
  field TEXT NOT NULL,
  operator TEXT NOT NULL,
  pattern TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'user',
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_classification_rules_enabled_priority
  ON classification_rules (enabled, target_type, priority);

CREATE INDEX IF NOT EXISTS idx_classification_rules_category
  ON classification_rules (category_id);

INSERT OR IGNORE INTO classification_rules
  (id, category_id, target_type, field, operator, pattern, priority, enabled, is_system, source, description, created_at, updated_at) VALUES
  ('system:bank:salary-keywords',      'salary',     'bank_transaction', 'any_text', 'regex', '薪|salary|payroll|工資|獎金|bonus',                                                        110, 1, 1, 'system', '薪資相關關鍵字',   '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:bank:transfer-keywords',    'transfer',   'bank_transaction', 'any_text', 'regex', '轉帳|轉入|轉出|匯款|transfer|remit|atm|跨行',                                              105, 1, 1, 'system', '轉帳相關關鍵字',   '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:bank:food-keywords',        'food',       'bank_transaction', 'any_text', 'regex', '餐|飯|咖啡|飲|food|restaurant|cafe|mcdonald|starbucks|ubereats|foodpanda',               100, 1, 1, 'system', '餐飲相關關鍵字',   '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:shared:transport-keywords', 'transport',  NULL,               'any_text', 'regex', '交通|捷運|高鐵|台鐵|加油|停車|uber|taxi|metro|rail|parking|fuel',                          100, 1, 1, 'system', '交通相關關鍵字',   '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:bank:investment-keywords',  'investment', 'bank_transaction', 'any_text', 'regex', '投資|證券|股票|基金|etf|broker|tdcc|交割',                                                  100, 1, 1, 'system', '投資相關關鍵字',   '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:shared:fee-keywords',       'fee',        NULL,               'any_text', 'regex', '手續|管理費|利息|fee|charge|interest',                                                       90, 1, 1, 'system', '手續費相關關鍵字', '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:bank:shopping-keywords',    'shopping',   'bank_transaction', 'any_text', 'regex', '購物|商店|百貨|超商|market|store|shop|momo|pchome|costco|全聯|統一|seven|family',           90, 1, 1, 'system', '購物相關關鍵字',   '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:shared:insurance-keywords', 'insurance',  NULL,               'any_text', 'regex', '健保|勞保|保費|保險|insurance',                                                              95, 1, 1, 'system', '保險相關關鍵字',   '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:bank:creditcard-payment',   'transfer',   'bank_transaction', 'any_text', 'regex', '信用卡.*繳|繳卡費|credit.?card.*(pay|bill|repay)',                                          106, 1, 1, 'system', '信用卡繳費',       '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z');
