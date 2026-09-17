-- SOHA ENTERPRISE Database Schema
-- Real SQLite relational tables for enterprise sales, forecasts, collections, users, and reporting

CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    designation TEXT NOT NULL DEFAULT 'TSO',
    phone TEXT NOT NULL,
    territory TEXT DEFAULT 'Dhaka Region',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('main_admin', 'sub_admin', 'tso_officer')),
    phone TEXT,
    employee_id INTEGER REFERENCES employees(id),
    is_active INTEGER DEFAULT 1,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    territory TEXT DEFAULT 'Dhaka Region',
    credit_limit REAL DEFAULT 1000000,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    pack_size TEXT,
    trade_price REAL NOT NULL,
    category TEXT DEFAULT 'Agrovet & Veterinary',
    stock_qty INTEGER DEFAULT 500,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_no TEXT UNIQUE NOT NULL,
    date TEXT NOT NULL,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    customer_id INTEGER REFERENCES customers(id),
    product_id INTEGER REFERENCES products(id),
    qty INTEGER NOT NULL DEFAULT 0,
    unit_price REAL NOT NULL DEFAULT 0,
    total_price REAL NOT NULL DEFAULT 0,
    bonus_qty INTEGER NOT NULL DEFAULT 0,
    discount_amt REAL NOT NULL DEFAULT 0,
    dues REAL NOT NULL DEFAULT 0,
    coll_cash REAL NOT NULL DEFAULT 0,
    coll_comm REAL NOT NULL DEFAULT 0,
    payment_status TEXT DEFAULT 'Unpaid',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS forecasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    year_month TEXT NOT NULL,
    target_qty INTEGER NOT NULL DEFAULT 0,
    target_amount REAL NOT NULL DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_no TEXT UNIQUE NOT NULL,
    date TEXT NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    amount REAL NOT NULL DEFAULT 0,
    payment_method TEXT DEFAULT 'Cash',
    bank_name TEXT,
    cheque_no TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outstanding_confirmations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    confirmed_amount REAL NOT NULL,
    confirmed_date TEXT NOT NULL,
    confirmed_by TEXT NOT NULL,
    status TEXT DEFAULT 'Confirmed',
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_transactions(date);
CREATE INDEX IF NOT EXISTS idx_sales_emp ON sales_transactions(employee_id);
CREATE INDEX IF NOT EXISTS idx_sales_cust ON sales_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_prod ON sales_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_forecast_emp_month ON forecasts(employee_id, year_month);
CREATE INDEX IF NOT EXISTS idx_coll_date ON collections(date);
