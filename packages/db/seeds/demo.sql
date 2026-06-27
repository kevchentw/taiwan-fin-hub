-- Demo data for Taiwan Fin Hub.
-- This script is intentionally destructive for app data: it clears the current
-- records and writes a complete demo dataset for public/demo deployments.

PRAGMA foreign_keys = OFF;

DELETE FROM classification_overrides;
DELETE FROM classification_rules;
DELETE FROM classification_categories;
DELETE FROM invoice_line_items;
DELETE FROM invoices;
DELETE FROM investment_transactions;
DELETE FROM investment_positions;
DELETE FROM bank_transactions;
DELETE FROM bank_balance_snapshots;
DELETE FROM bank_accounts;
DELETE FROM net_worth_history;
DELETE FROM manual_assets;
DELETE FROM exchange_rates;
DELETE FROM connector_settings;

PRAGMA foreign_keys = ON;

INSERT INTO classification_categories
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

INSERT INTO classification_rules
  (id, category_id, target_type, field, operator, pattern, priority, enabled, is_system, source, description, created_at, updated_at) VALUES
  ('system:bank:salary-keywords',      'salary',     'bank_transaction', 'any_text', 'regex', '薪|salary|payroll|工資|獎金|bonus',                                          110, 1, 1, 'system', '薪資相關關鍵字',   '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:bank:transfer-keywords',    'transfer',   'bank_transaction', 'any_text', 'regex', '轉帳|轉入|轉出|匯款|transfer|remit|atm|跨行',                                105, 1, 1, 'system', '轉帳相關關鍵字',   '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:bank:food-keywords',        'food',       'bank_transaction', 'any_text', 'regex', '餐|飯|咖啡|飲|food|restaurant|cafe|mcdonald|starbucks|ubereats|foodpanda', 100, 1, 1, 'system', '餐飲相關關鍵字',   '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:shared:transport-keywords', 'transport',  NULL,               'any_text', 'regex', '交通|捷運|高鐵|台鐵|加油|停車|uber|taxi|metro|rail|parking|fuel',            100, 1, 1, 'system', '交通相關關鍵字',   '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:bank:investment-keywords',  'investment', 'bank_transaction', 'any_text', 'regex', '投資|證券|股票|基金|etf|broker|tdcc|交割',                                    100, 1, 1, 'system', '投資相關關鍵字',   '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:shared:fee-keywords',       'fee',        NULL,               'any_text', 'regex', '手續|管理費|利息|fee|charge|interest',                                         90, 1, 1, 'system', '手續費相關關鍵字', '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:bank:shopping-keywords',    'shopping',   'bank_transaction', 'any_text', 'regex', '購物|商店|百貨|超商|market|store|shop|momo|pchome|costco|全聯|統一|seven|family', 90, 1, 1, 'system', '購物相關關鍵字', '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:shared:insurance-keywords', 'insurance',  NULL,               'any_text', 'regex', '健保|勞保|保費|保險|insurance',                                                95, 1, 1, 'system', '保險相關關鍵字',   '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('system:bank:creditcard-payment',   'transfer',   'bank_transaction', 'any_text', 'regex', '信用卡.*繳|繳卡費|credit.?card.*(pay|bill|repay)',                            106, 1, 1, 'system', '信用卡繳費',       '2026-06-22T00:00:00.000Z', '2026-06-22T00:00:00.000Z'),
  ('demo:user:rent',                   'housing',    'bank_transaction', 'any_text', 'contains', '房租',                                                                      200, 1, 0, 'demo',   'Demo 自訂房租分類', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z');

INSERT INTO connector_settings
  (id, connector_id, encrypted_config, sync_cursor, created_at, updated_at) VALUES
  ('demo-setting-einvoice', 'einvoice', '{"demo":true,"connector":"einvoice"}', '2026-06', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('demo-setting-tdcc',     'tdcc',     '{"demo":true,"connector":"tdcc"}',     '2026-06-24', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('demo-setting-esun',     'esun',     '{"demo":true,"connector":"esun"}',     '2026-06-24', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z');

INSERT INTO exchange_rates (currency, rate_to_twd, updated_at) VALUES
  ('JPY', 0.215, '2026-06-24T09:00:00.000Z'),
  ('USD', 31.60, '2026-06-24T09:00:00.000Z'),
  ('EUR', 34.50, '2026-06-24T09:00:00.000Z');

INSERT INTO bank_accounts
  (id, connector_id, source_id, institution_name, account_name, account_type, currency, raw_payload, created_at, updated_at, bank_code, account_last4, canonical_account_id) VALUES
  ('bank:esun:twd-main',      'esun', 'ESUN-808-001234', '玉山銀行',     '數位綜合存款',       'savings', 'TWD', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z', '808', '1234', NULL),
  ('bank:tdcc:twd-payroll',   'tdcc', 'TDCC-812-008899', '台新銀行',     '薪轉戶',             'checking', 'TWD', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z', '812', '8899', NULL),
  ('bank:tdcc:usd-savings',   'tdcc', 'TDCC-013-006688', '國泰世華銀行', '外幣活存',           'savings', 'USD', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z', '013', '6688', NULL),
  ('bank:esun:credit-world',  'esun', 'ESUN-CARD-7766',  '玉山銀行',     '玉山世界卡',         'credit', 'TWD', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z', '808', '7766', NULL),
  ('bank:tdcc:settlement',    'tdcc', 'TDCC-920-004455', '元大證券',     '證券交割款項帳戶',   'settlement_cash', 'TWD', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z', '920', '4455', NULL);

INSERT INTO bank_balance_snapshots
  (id, connector_id, account_id, source_id, balance, available_balance, currency, as_of_at, raw_payload, created_at, updated_at) VALUES
  ('bal:esun:twd-main:2026-06-24',     'esun', 'bank:esun:twd-main',     '2026-06-24T09:00:00', 286420, 286420, 'TWD', '2026-06-24T09:00:00.000Z', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('bal:tdcc:twd-payroll:2026-06-24',  'tdcc', 'bank:tdcc:twd-payroll',  '2026-06-24T09:00:00', 742880, 742880, 'TWD', '2026-06-24T09:00:00.000Z', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('bal:tdcc:usd-savings:2026-06-24',  'tdcc', 'bank:tdcc:usd-savings',  '2026-06-24T09:00:00', 12640, 12640, 'USD', '2026-06-24T09:00:00.000Z', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('bal:esun:credit-world:2026-06-24', 'esun', 'bank:esun:credit-world', '2026-06-24T09:00:00', 38210, 261790, 'TWD', '2026-06-24T09:00:00.000Z', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('bal:tdcc:settlement:2026-06-24',   'tdcc', 'bank:tdcc:settlement',   '2026-06-24T09:00:00', 53420, 53420, 'TWD', '2026-06-24T09:00:00.000Z', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z');

INSERT INTO bank_transactions
  (id, connector_id, account_id, source_id, posted_date, authorized_at, amount, currency, description, counterparty, raw_payload, created_at, updated_at) VALUES
  ('txn:payroll:2026-01',        'tdcc', 'bank:tdcc:twd-payroll',  'PAYROLL-2026-01',       '2026-01-05', NULL,  126000, 'TWD', '一月薪資入帳',       '群星科技股份有限公司', '{"demo":true}', '2026-01-05T10:00:00.000Z', '2026-01-05T10:00:00.000Z'),
  ('txn:bonus:2026-01',          'tdcc', 'bank:tdcc:twd-payroll',  'BONUS-2026-01',         '2026-01-20', NULL,  180000, 'TWD', '年終獎金',           '群星科技股份有限公司', '{"demo":true}', '2026-01-20T10:00:00.000Z', '2026-01-20T10:00:00.000Z'),
  ('txn:rent:2026-01',           'tdcc', 'bank:tdcc:twd-payroll',  'RENT-2026-01',          '2026-01-06', NULL,  -32000, 'TWD', '房租轉帳',           '林小姐',               '{"demo":true}', '2026-01-06T10:00:00.000Z', '2026-01-06T10:00:00.000Z'),
  ('txn:insurance:2026-01',      'tdcc', 'bank:tdcc:twd-payroll',  'INS-2026-01',           '2026-01-15', NULL,  -12680, 'TWD', '保險費扣款',         '南山人壽',             '{"demo":true}', '2026-01-15T10:00:00.000Z', '2026-01-15T10:00:00.000Z'),
  ('txn:broker:202601',          'tdcc', 'bank:tdcc:twd-payroll',  'BROKER-TRANSFER-0108',  '2026-01-08', NULL,  -70000, 'TWD', '證券交割款轉出',     '元大證券',             '{"demo":true}', '2026-01-08T10:00:00.000Z', '2026-01-08T10:00:00.000Z'),
  ('txn:card:department:2026-01','esun', 'bank:esun:credit-world', 'CARD-DEPT-2026-01',     '2026-01-22', '2026-01-22T14:10:00.000Z', -18600, 'TWD', '信用卡消費', '新光三越', '{"demo":true}', '2026-01-22T14:10:00.000Z', '2026-01-22T14:10:00.000Z'),
  ('txn:payroll:2026-02',        'tdcc', 'bank:tdcc:twd-payroll',  'PAYROLL-2026-02',       '2026-02-05', NULL,  126000, 'TWD', '二月薪資入帳',       '群星科技股份有限公司', '{"demo":true}', '2026-02-05T10:00:00.000Z', '2026-02-05T10:00:00.000Z'),
  ('txn:rent:2026-02',           'tdcc', 'bank:tdcc:twd-payroll',  'RENT-2026-02',          '2026-02-06', NULL,  -32000, 'TWD', '房租轉帳',           '林小姐',               '{"demo":true}', '2026-02-06T10:00:00.000Z', '2026-02-06T10:00:00.000Z'),
  ('txn:lunar:2026-02',          'tdcc', 'bank:tdcc:twd-payroll',  'LUNAR-2026-02',         '2026-02-12', NULL,  -36000, 'TWD', '春節紅包與採買',     '家庭支出',             '{"demo":true}', '2026-02-12T10:00:00.000Z', '2026-02-12T10:00:00.000Z'),
  ('txn:broker:202602',          'tdcc', 'bank:tdcc:twd-payroll',  'BROKER-TRANSFER-0210',  '2026-02-10', NULL,  -45000, 'TWD', '證券交割款轉出',     '元大證券',             '{"demo":true}', '2026-02-10T10:00:00.000Z', '2026-02-10T10:00:00.000Z'),
  ('txn:card:grocery:2026-02',   'esun', 'bank:esun:credit-world', 'CARD-GROCERY-2026-02',  '2026-02-19', '2026-02-19T13:20:00.000Z', -6200, 'TWD', '信用卡消費', 'Costco 內湖店', '{"demo":true}', '2026-02-19T13:20:00.000Z', '2026-02-19T13:20:00.000Z'),
  ('txn:payroll:2026-03',        'tdcc', 'bank:tdcc:twd-payroll',  'PAYROLL-2026-03',       '2026-03-05', NULL,  127000, 'TWD', '三月薪資入帳',       '群星科技股份有限公司', '{"demo":true}', '2026-03-05T10:00:00.000Z', '2026-03-05T10:00:00.000Z'),
  ('txn:rent:2026-03',           'tdcc', 'bank:tdcc:twd-payroll',  'RENT-2026-03',          '2026-03-06', NULL,  -32000, 'TWD', '房租轉帳',           '林小姐',               '{"demo":true}', '2026-03-06T10:00:00.000Z', '2026-03-06T10:00:00.000Z'),
  ('txn:tax:2026-03',            'tdcc', 'bank:tdcc:twd-payroll',  'TAX-2026-03',           '2026-03-12', NULL,  -28500, 'TWD', '稅費繳納',           '財政部',               '{"demo":true}', '2026-03-12T10:00:00.000Z', '2026-03-12T10:00:00.000Z'),
  ('txn:broker:202603',          'tdcc', 'bank:tdcc:twd-payroll',  'BROKER-TRANSFER-0311',  '2026-03-11', NULL,  -52000, 'TWD', '證券交割款轉出',     '元大證券',             '{"demo":true}', '2026-03-11T10:00:00.000Z', '2026-03-11T10:00:00.000Z'),
  ('txn:card:phone:2026-03',     'esun', 'bank:esun:credit-world', 'CARD-PHONE-2026-03',    '2026-03-18', '2026-03-18T19:40:00.000Z', -31500, 'TWD', '信用卡消費', 'Apple Store', '{"demo":true}', '2026-03-18T19:40:00.000Z', '2026-03-18T19:40:00.000Z'),
  ('txn:payroll:2026-04',        'tdcc', 'bank:tdcc:twd-payroll',  'PAYROLL-2026-04',       '2026-04-05', NULL,  127000, 'TWD', '四月薪資入帳',       '群星科技股份有限公司', '{"demo":true}', '2026-04-05T10:00:00.000Z', '2026-04-05T10:00:00.000Z'),
  ('txn:rent:2026-04',           'tdcc', 'bank:tdcc:twd-payroll',  'RENT-2026-04',          '2026-04-06', NULL,  -32000, 'TWD', '房租轉帳',           '林小姐',               '{"demo":true}', '2026-04-06T10:00:00.000Z', '2026-04-06T10:00:00.000Z'),
  ('txn:travel:2026-04',         'tdcc', 'bank:tdcc:twd-payroll',  'TRAVEL-2026-04',        '2026-04-17', NULL,  -42000, 'TWD', '清明連假旅遊',       '旅行社',               '{"demo":true}', '2026-04-17T10:00:00.000Z', '2026-04-17T10:00:00.000Z'),
  ('txn:broker:202604',          'tdcc', 'bank:tdcc:twd-payroll',  'BROKER-TRANSFER-0408',  '2026-04-08', NULL,  -65000, 'TWD', '證券交割款轉出',     '元大證券',             '{"demo":true}', '2026-04-08T10:00:00.000Z', '2026-04-08T10:00:00.000Z'),
  ('txn:dividend:2026-04',       'tdcc', 'bank:tdcc:settlement',   'DIVIDEND-2026-04',      '2026-04-25', NULL,    2400, 'TWD', 'ETF 收益分配',       '元大台灣50',           '{"demo":true}', '2026-04-25T10:00:00.000Z', '2026-04-25T10:00:00.000Z'),
  ('txn:payroll:2026-05',        'tdcc', 'bank:tdcc:twd-payroll',  'PAYROLL-2026-05',       '2026-05-05', NULL,  128000, 'TWD', '五月薪資入帳',       '群星科技股份有限公司', '{"demo":true}', '2026-05-05T10:00:00.000Z', '2026-05-05T10:00:00.000Z'),
  ('txn:rent:2026-05',           'tdcc', 'bank:tdcc:twd-payroll',  'RENT-2026-05',          '2026-05-06', NULL,  -32000, 'TWD', '房租轉帳',           '林小姐',               '{"demo":true}', '2026-05-06T10:00:00.000Z', '2026-05-06T10:00:00.000Z'),
  ('txn:health:2026-05',         'tdcc', 'bank:tdcc:twd-payroll',  'HEALTH-2026-05',        '2026-05-13', NULL,  -15800, 'TWD', '牙科治療',           '牙醫診所',             '{"demo":true}', '2026-05-13T10:00:00.000Z', '2026-05-13T10:00:00.000Z'),
  ('txn:broker:202605',          'tdcc', 'bank:tdcc:twd-payroll',  'BROKER-TRANSFER-0510',  '2026-05-10', NULL,  -90000, 'TWD', '證券交割款轉出',     '元大證券',             '{"demo":true}', '2026-05-10T10:00:00.000Z', '2026-05-10T10:00:00.000Z'),
  ('txn:card:grocery:2026-05',   'esun', 'bank:esun:credit-world', 'CARD-GROCERY-2026-05',  '2026-05-21', '2026-05-21T12:20:00.000Z', -7200, 'TWD', '信用卡消費', '全聯福利中心', '{"demo":true}', '2026-05-21T12:20:00.000Z', '2026-05-21T12:20:00.000Z'),
  ('txn:payroll:2026-06',        'tdcc', 'bank:tdcc:twd-payroll',  'PAYROLL-2026-06',       '2026-06-05', NULL,  128000, 'TWD', '六月薪資入帳',       '群星科技股份有限公司', '{"demo":true}', '2026-06-05T10:00:00.000Z', '2026-06-05T10:00:00.000Z'),
  ('txn:rent:2026-06',           'tdcc', 'bank:tdcc:twd-payroll',  'RENT-2026-06',          '2026-06-06', NULL,  -32000, 'TWD', '房租轉帳',           '林小姐',               '{"demo":true}', '2026-06-06T10:00:00.000Z', '2026-06-06T10:00:00.000Z'),
  ('txn:transfer:broker:202606', 'tdcc', 'bank:tdcc:twd-payroll',  'BROKER-TRANSFER-0607',  '2026-06-07', NULL,  -50000, 'TWD', '證券交割款轉出',     '元大證券',             '{"demo":true}', '2026-06-07T10:00:00.000Z', '2026-06-07T10:00:00.000Z'),
  ('txn:mrt:2026-06-10',         'esun', 'bank:esun:twd-main',     'MRT-2026-06-10',        '2026-06-10', NULL,     -42, 'TWD', '台北捷運扣款',       '悠遊卡股份有限公司',   '{"demo":true}', '2026-06-10T10:00:00.000Z', '2026-06-10T10:00:00.000Z'),
  ('txn:coffee:2026-06-12',      'esun', 'bank:esun:twd-main',     'COFFEE-2026-06-12',     '2026-06-12', NULL,    -160, 'TWD', '咖啡店消費',         'Fika Fika Cafe',       '{"demo":true}', '2026-06-12T10:00:00.000Z', '2026-06-12T10:00:00.000Z'),
  ('txn:insurance:2026-06-15',   'tdcc', 'bank:tdcc:twd-payroll',  'INS-2026-06-15',        '2026-06-15', NULL,  -12680, 'TWD', '保險費扣款',         '南山人壽',             '{"demo":true}', '2026-06-15T10:00:00.000Z', '2026-06-15T10:00:00.000Z'),
  ('txn:usd-interest:2026-06',   'tdcc', 'bank:tdcc:usd-savings',  'USD-INTEREST-2026-06',  '2026-06-20', NULL,      18, 'USD', '外幣存款利息',       '國泰世華銀行',         '{"demo":true}', '2026-06-20T10:00:00.000Z', '2026-06-20T10:00:00.000Z'),
  ('txn:card:grocery:2026-06',   'esun', 'bank:esun:credit-world', 'CARD-GROCERY-2026-06',  '2026-06-18', '2026-06-18T12:40:00.000Z', -2480, 'TWD', '信用卡消費', '全聯福利中心', '{"demo":true}', '2026-06-18T12:40:00.000Z', '2026-06-18T12:40:00.000Z'),
  ('txn:card:hotel:2026-06',     'esun', 'bank:esun:credit-world', 'CARD-HOTEL-2026-06',    '2026-06-21', '2026-06-21T20:10:00.000Z', -12800, 'TWD', '信用卡消費', '台南晶英酒店', '{"demo":true}', '2026-06-21T20:10:00.000Z', '2026-06-21T20:10:00.000Z'),
  ('txn:dividend:2026-06',       'tdcc', 'bank:tdcc:settlement',   'DIVIDEND-2026-06',      '2026-06-24', NULL,    3820, 'TWD', '股票股利入帳',       '台積電',               '{"demo":true}', '2026-06-24T10:00:00.000Z', '2026-06-24T10:00:00.000Z');

INSERT INTO classification_overrides
  (id, target_type, target_id, category_id, created_at, updated_at) VALUES
  ('override:bank_transaction:txn:card:hotel:2026-06', 'bank_transaction', 'txn:card:hotel:2026-06', 'entertainment', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z');

INSERT INTO invoices
  (id, connector_id, source_id, invoice_number, invoice_date, seller_name, amount, raw_payload, created_at, updated_at) VALUES
  ('inv:einvoice:20260601', 'einvoice', 'EINV-20260601', 'AB12345678', '2026-06-01', '誠品生活股份有限公司', 1280, '{"demo":true}', '2026-06-01T09:00:00.000Z', '2026-06-01T09:00:00.000Z'),
  ('inv:einvoice:20260608', 'einvoice', 'EINV-20260608', 'CD87654321', '2026-06-08', '全聯實業股份有限公司', 2465, '{"demo":true}', '2026-06-08T09:00:00.000Z', '2026-06-08T09:00:00.000Z'),
  ('inv:einvoice:20260616', 'einvoice', 'EINV-20260616', 'EF11223344', '2026-06-16', '台灣高鐵股份有限公司', 1490, '{"demo":true}', '2026-06-16T09:00:00.000Z', '2026-06-16T09:00:00.000Z'),
  ('inv:einvoice:20260622', 'einvoice', 'EINV-20260622', 'GH55667788', '2026-06-22', '好食餐飲有限公司', 860, '{"demo":true}', '2026-06-22T09:00:00.000Z', '2026-06-22T09:00:00.000Z');

INSERT INTO invoice_line_items
  (id, invoice_id, connector_id, invoice_source_id, source_id, line_number, description, quantity, unit_price, amount, raw_payload, created_at, updated_at) VALUES
  ('line:20260601:1', 'inv:einvoice:20260601', 'einvoice', 'EINV-20260601', '1', 1, '商業書籍', 2, 420, 840, '{"demo":true}', '2026-06-01T09:00:00.000Z', '2026-06-01T09:00:00.000Z'),
  ('line:20260601:2', 'inv:einvoice:20260601', 'einvoice', 'EINV-20260601', '2', 2, '文具用品', 1, 440, 440, '{"demo":true}', '2026-06-01T09:00:00.000Z', '2026-06-01T09:00:00.000Z'),
  ('line:20260608:1', 'inv:einvoice:20260608', 'einvoice', 'EINV-20260608', '1', 1, '生鮮蔬果', 1, 820, 820, '{"demo":true}', '2026-06-08T09:00:00.000Z', '2026-06-08T09:00:00.000Z'),
  ('line:20260608:2', 'inv:einvoice:20260608', 'einvoice', 'EINV-20260608', '2', 2, '家庭用品', 1, 1645, 1645, '{"demo":true}', '2026-06-08T09:00:00.000Z', '2026-06-08T09:00:00.000Z'),
  ('line:20260616:1', 'inv:einvoice:20260616', 'einvoice', 'EINV-20260616', '1', 1, '台北至左營車票', 1, 1490, 1490, '{"demo":true}', '2026-06-16T09:00:00.000Z', '2026-06-16T09:00:00.000Z'),
  ('line:20260622:1', 'inv:einvoice:20260622', 'einvoice', 'EINV-20260622', '1', 1, '雙人晚餐', 1, 860, 860, '{"demo":true}', '2026-06-22T09:00:00.000Z', '2026-06-22T09:00:00.000Z');

INSERT INTO investment_positions
  (id, connector_id, source_id, asset_type, symbol, name, quantity, market_value, cash_balance, currency, as_of_date, raw_payload, created_at, updated_at) VALUES
  ('pos:tdcc:2330:2026-06-24', 'tdcc', '2330', 'stock', '2330', '台積電', 1200, 1188000, NULL, 'TWD', '2026-06-24', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('pos:tdcc:2412:2026-06-24', 'tdcc', '2412', 'stock', '2412', '中華電', 3000, 384000, NULL, 'TWD', '2026-06-24', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('pos:tdcc:2881:2026-06-24', 'tdcc', '2881', 'stock', '2881', '富邦金', 4000, 352000, NULL, 'TWD', '2026-06-24', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('pos:tdcc:0050:2026-06-24', 'tdcc', '0050', 'etf',   '0050', '元大台灣50', 5000, 925000, NULL, 'TWD', '2026-06-24', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('pos:tdcc:006208:2026-06-24','tdcc', '006208','etf',  '006208','富邦台50', 2000, 224000, NULL, 'TWD', '2026-06-24', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('pos:tdcc:00878:2026-06-24','tdcc', '00878','etf',   '00878','國泰永續高股息', 12000, 268800, NULL, 'TWD', '2026-06-24', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('pos:tdcc:f001:2026-06-24', 'tdcc', 'FUND-001', 'fund', NULL, '全球科技基金', 1342.88, 412360, NULL, 'TWD', '2026-06-24', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('pos:tdcc:f002:2026-06-24', 'tdcc', 'FUND-002', 'fund', NULL, '台灣平衡基金', 910.5, 180000, NULL, 'TWD', '2026-06-24', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('pos:tdcc:f003:2026-06-24', 'tdcc', 'FUND-003', 'fund', NULL, '新興市場債券基金', 520.16, 135000, NULL, 'TWD', '2026-06-24', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z');

INSERT INTO investment_transactions
  (id, connector_id, account_id, source_id, broker_no, broker_account, broker_name, symbol, name, asset_type, trade_date, posted_date, transaction_code, transaction_name, quantity, price, amount, currency, raw_payload, created_at, updated_at) VALUES
  ('trade:tdcc:20260403:0050',  'tdcc', 'broker:yuan-ta:4455', 'TRADE-20260403-0050',  '9200', '004455', '元大證券', '0050', '元大台灣50', 'etf', '2026-04-03', '2026-04-07', 'B', '買進', 1000, 181.5, -181500, 'TWD', '{"demo":true}', '2026-04-07T09:00:00.000Z', '2026-04-07T09:00:00.000Z'),
  ('trade:tdcc:20260409:2412',  'tdcc', 'broker:yuan-ta:4455', 'TRADE-20260409-2412',  '9200', '004455', '元大證券', '2412', '中華電', 'stock', '2026-04-09', '2026-04-13', 'B', '買進', 1000, 126.0, -126000, 'TWD', '{"demo":true}', '2026-04-13T09:00:00.000Z', '2026-04-13T09:00:00.000Z'),
  ('trade:tdcc:20260415:f001',  'tdcc', 'broker:yuan-ta:4455', 'TRADE-20260415-F001',  '9200', '004455', '元大證券', NULL, '全球科技基金', 'fund', '2026-04-15', '2026-04-16', 'SUB', '基金申購', 180.22, 298.0, -53706, 'TWD', '{"demo":true}', '2026-04-16T09:00:00.000Z', '2026-04-16T09:00:00.000Z'),
  ('trade:tdcc:20260424:2881',  'tdcc', 'broker:yuan-ta:4455', 'TRADE-20260424-2881',  '9200', '004455', '元大證券', '2881', '富邦金', 'stock', '2026-04-24', '2026-04-28', 'B', '買進', 2000, 86.2, -172400, 'TWD', '{"demo":true}', '2026-04-28T09:00:00.000Z', '2026-04-28T09:00:00.000Z'),
  ('trade:tdcc:20260506:2330',  'tdcc', 'broker:yuan-ta:4455', 'TRADE-20260506-2330',  '9200', '004455', '元大證券', '2330', '台積電', 'stock', '2026-05-06', '2026-05-08', 'S', '賣出', 100, 932.0, 93200, 'TWD', '{"demo":true}', '2026-05-08T09:00:00.000Z', '2026-05-08T09:00:00.000Z'),
  ('trade:tdcc:20260513:006208','tdcc', 'broker:yuan-ta:4455', 'TRADE-20260513-006208','9200', '004455', '元大證券', '006208', '富邦台50', 'etf', '2026-05-13', '2026-05-15', 'B', '買進', 1000, 110.8, -110800, 'TWD', '{"demo":true}', '2026-05-15T09:00:00.000Z', '2026-05-15T09:00:00.000Z'),
  ('trade:tdcc:20260520:f002',  'tdcc', 'broker:yuan-ta:4455', 'TRADE-20260520-F002',  '9200', '004455', '元大證券', NULL, '台灣平衡基金', 'fund', '2026-05-20', '2026-05-21', 'SUB', '基金申購', 305.48, 196.0, -59874, 'TWD', '{"demo":true}', '2026-05-21T09:00:00.000Z', '2026-05-21T09:00:00.000Z'),
  ('trade:tdcc:20260527:00878', 'tdcc', 'broker:yuan-ta:4455', 'TRADE-20260527-00878', '9200', '004455', '元大證券', '00878', '國泰永續高股息', 'etf', '2026-05-27', '2026-05-29', 'B', '買進', 3000, 21.55, -64650, 'TWD', '{"demo":true}', '2026-05-29T09:00:00.000Z', '2026-05-29T09:00:00.000Z'),
  ('trade:tdcc:20260604:0050',  'tdcc', 'broker:yuan-ta:4455', 'TRADE-20260604-0050',  '9200', '004455', '元大證券', '0050', '元大台灣50', 'etf', '2026-06-04', '2026-06-08', 'B', '買進', 1000, 185.0, -185000, 'TWD', '{"demo":true}', '2026-06-08T09:00:00.000Z', '2026-06-08T09:00:00.000Z'),
  ('trade:tdcc:20260611:2330',  'tdcc', 'broker:yuan-ta:4455', 'TRADE-20260611-2330',  '9200', '004455', '元大證券', '2330', '台積電', 'stock', '2026-06-11', '2026-06-15', 'B', '買進', 200, 960.0, -192000, 'TWD', '{"demo":true}', '2026-06-15T09:00:00.000Z', '2026-06-15T09:00:00.000Z'),
  ('trade:tdcc:20260617:f003',  'tdcc', 'broker:yuan-ta:4455', 'TRADE-20260617-F003',  '9200', '004455', '元大證券', NULL, '新興市場債券基金', 'fund', '2026-06-17', '2026-06-18', 'SUB', '基金申購', 220.16, 185.0, -40730, 'TWD', '{"demo":true}', '2026-06-18T09:00:00.000Z', '2026-06-18T09:00:00.000Z'),
  ('trade:tdcc:20260620:00878', 'tdcc', 'broker:yuan-ta:4455', 'TRADE-20260620-00878', '9200', '004455', '元大證券', '00878', '國泰永續高股息', 'etf', '2026-06-20', '2026-06-24', 'D', '收益分配', NULL, NULL, 3820, 'TWD', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z'),
  ('trade:tdcc:20260621:f001',  'tdcc', 'broker:yuan-ta:4455', 'TRADE-20260621-F001',  '9200', '004455', '元大證券', NULL, '全球科技基金', 'fund', '2026-06-21', '2026-06-24', 'RED', '部分贖回', 90.0, 307.0, 27630, 'TWD', '{"demo":true}', '2026-06-24T09:00:00.000Z', '2026-06-24T09:00:00.000Z');

INSERT INTO manual_assets
  (id, name, category, note, created_at) VALUES
  ('manual:home-xinyi', '信義區預售屋自備款', 'real_estate', '估值只列自備款與已投入成本', '2026-05-01T09:00:00.000Z'),
  ('manual:policy-a',   '美元儲蓄險保單價值', 'insurance', '每季手動更新一次', '2026-05-01T09:00:00.000Z'),
  ('manual:scooter',    '通勤機車',           'vehicle', '折舊後估值', '2026-05-01T09:00:00.000Z');

WITH RECURSIVE dates(date, n) AS (
  SELECT '2026-04-01', 0
  UNION ALL
  SELECT date(date, '+1 day'), n + 1
  FROM dates
  WHERE date < '2026-06-24'
),
series AS (
  SELECT
    date,
    n,
    1220000
      + CAST((264264 * n) / 84 AS INTEGER)
      + CASE
          WHEN n IN (0, 84) THEN 0
          WHEN n % 14 = 3 THEN 9000
          WHEN n % 14 = 4 THEN 12000
          WHEN n % 14 = 10 THEN -7000
          WHEN n % 14 = 11 THEN -4000
          ELSE 0
        END AS deposit_value,
    CASE
      WHEN n <= 9 THEN 3050000 - CAST((170000 * n) / 9 AS INTEGER)
      WHEN n <= 22 THEN 2880000 + CAST((300000 * (n - 9)) / 13 AS INTEGER)
      WHEN n <= 34 THEN 3180000 + CAST((180000 * (n - 22)) / 12 AS INTEGER)
      WHEN n <= 43 THEN 3360000 - CAST((280000 * (n - 34)) / 9 AS INTEGER)
      WHEN n <= 60 THEN 3080000 + CAST((150000 * (n - 43)) / 17 AS INTEGER)
      WHEN n <= 70 THEN 3230000 - CAST((190000 * (n - 60)) / 10 AS INTEGER)
      ELSE 3040000 + CAST((301800 * (n - 70)) / 14 AS INTEGER)
    END
      + CASE
          WHEN n IN (0, 9, 22, 34, 43, 60, 70, 84) THEN 0
          WHEN n % 9 IN (1, 2) THEN -58000
          WHEN n % 9 IN (4, 5) THEN 52000
          WHEN n % 9 = 7 THEN -34000
          ELSE 0
        END AS stock_value,
    CASE
      WHEN n <= 15 THEN 760000 - CAST((50000 * n) / 15 AS INTEGER)
      WHEN n <= 28 THEN 710000 + CAST((80000 * (n - 15)) / 13 AS INTEGER)
      WHEN n <= 49 THEN 790000 - CAST((100000 * (n - 28)) / 21 AS INTEGER)
      WHEN n <= 63 THEN 690000 + CAST((55000 * (n - 49)) / 14 AS INTEGER)
      ELSE 745000 - CAST((17640 * (n - 63)) / 21 AS INTEGER)
    END
      + CASE
          WHEN n IN (0, 15, 28, 49, 63, 84) THEN 0
          WHEN n % 8 IN (1, 2) THEN -14000
          WHEN n % 8 IN (4, 5) THEN 12000
          WHEN n % 8 = 7 THEN -7000
          ELSE 0
        END AS fund_value,
    1810000 + CAST((70000 * n) / 84 AS INTEGER) AS home_value,
    168000 + CAST((13040 * n) / 84 AS INTEGER)
      + CASE
          WHEN n IN (0, 84) THEN 0
          WHEN n % 21 = 5 THEN 1800
          ELSE 0
        END AS policy_value,
    37000 - CAST((7000 * n) / 84 AS INTEGER) AS scooter_value
  FROM dates
),
asset_series(asset_type, source, id_prefix) AS (
  VALUES
    ('total', 'demo', 'hist:total:'),
    ('deposit', 'bank', 'bank:deposit:'),
    ('stock', 'tdcc', 'tdcc:stock:'),
    ('fund', 'tdcc', 'tdcc:fund:'),
    ('manual:home-xinyi', 'manual', 'manual:manual:home-xinyi:'),
    ('manual:policy-a', 'manual', 'manual:manual:policy-a:'),
    ('manual:scooter', 'manual', 'manual:manual:scooter:')
)
INSERT INTO net_worth_history
  (id, date, net_worth, asset_type, source, snapshotted_at)
SELECT
  asset_series.id_prefix || series.date,
  series.date,
  CASE asset_series.asset_type
    WHEN 'total' THEN deposit_value + stock_value + fund_value + home_value + policy_value + scooter_value
    WHEN 'deposit' THEN deposit_value
    WHEN 'stock' THEN stock_value
    WHEN 'fund' THEN fund_value
    WHEN 'manual:home-xinyi' THEN home_value
    WHEN 'manual:policy-a' THEN policy_value
    WHEN 'manual:scooter' THEN scooter_value
  END,
  asset_series.asset_type,
  asset_series.source,
  series.date || 'T23:59:59.000Z'
FROM series
CROSS JOIN asset_series;
