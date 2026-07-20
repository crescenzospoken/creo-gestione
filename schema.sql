CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'in corso',
  tags TEXT NOT NULL DEFAULT '[]',
  data TEXT,
  due_date TEXT,
  date_created TEXT,
  date_done TEXT,
  reparto TEXT NOT NULL DEFAULT '',
  clientela TEXT NOT NULL DEFAULT '',
  demografia TEXT NOT NULL DEFAULT '',
  modello TEXT NOT NULL DEFAULT '',
  stato_lav TEXT NOT NULL DEFAULT '',
  sentiment TEXT NOT NULL DEFAULT '',
  pagato TEXT NOT NULL DEFAULT '',
  sellout TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  prezzo REAL,
  spese REAL,
  tax_refund INTEGER NOT NULL DEFAULT 0,
  stile TEXT NOT NULL DEFAULT '[]',
  lenti TEXT NOT NULL DEFAULT '[]',
  upsell TEXT NOT NULL DEFAULT '[]',
  eta TEXT NOT NULL DEFAULT '[]',
  rx TEXT NOT NULL DEFAULT '',
  cu_updated TEXT,
  clickup_url TEXT NOT NULL DEFAULT '',
  sort_order REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_data ON orders(data);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_name ON orders(name);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  order_id TEXT,
  order_name TEXT,
  action TEXT,
  field TEXT DEFAULT '',
  old_value TEXT,
  new_value TEXT
);
