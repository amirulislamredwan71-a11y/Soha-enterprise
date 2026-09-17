-- db/schema.postgres.sql - SOHA ENTERPRISE Relational PostgreSQL Schema for Supabase

-- 1. Employees (Sales Officers & Territory Managers)
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    designation VARCHAR(100) DEFAULT 'TSO',
    phone VARCHAR(50),
    territory VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users (Authentication & RBAC: Main Admin & Sub-Accounts)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('main_admin', 'sub_admin', 'tso_officer')),
    phone VARCHAR(50),
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    is_active INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. User Sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    token VARCHAR(255) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Customers (Dealers, Feed Stores, Dairy & Poultry Farms)
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(50),
    address TEXT,
    territory VARCHAR(150),
    credit_limit NUMERIC(15, 2) DEFAULT 1000000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Products (Veterinary & Poultry Medicines, Feed Supplements)
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    pack_size VARCHAR(50),
    trade_price NUMERIC(12, 2) NOT NULL,
    category VARCHAR(100) DEFAULT 'Agrovet',
    stock_qty INTEGER DEFAULT 500,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Sales Transactions (Invoices)
CREATE TABLE IF NOT EXISTS sales_transactions (
    id SERIAL PRIMARY KEY,
    invoice_no VARCHAR(100) UNIQUE NOT NULL,
    date DATE NOT NULL,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    qty INTEGER NOT NULL DEFAULT 0,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
    bonus_qty INTEGER DEFAULT 0,
    discount_amt NUMERIC(12, 2) DEFAULT 0,
    dues NUMERIC(15, 2) DEFAULT 0,
    coll_cash NUMERIC(15, 2) DEFAULT 0,
    coll_comm NUMERIC(15, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Monthly Sales Forecasts & Targets
CREATE TABLE IF NOT EXISTS forecasts (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    year_month VARCHAR(7) NOT NULL,
    target_qty INTEGER NOT NULL DEFAULT 0,
    target_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_employee_product_month UNIQUE(employee_id, product_id, year_month)
);

-- 8. Payment Collections (Money Receipts)
CREATE TABLE IF NOT EXISTS collections (
    id SERIAL PRIMARY KEY,
    receipt_no VARCHAR(100) UNIQUE NOT NULL,
    date DATE NOT NULL,
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    amount NUMERIC(15, 2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'Cash',
    bank_name VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Outstanding Balance Confirmations & Audits
CREATE TABLE IF NOT EXISTS outstanding_confirmations (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
    confirmed_amount NUMERIC(15, 2) NOT NULL,
    confirmed_date DATE NOT NULL,
    confirmed_by VARCHAR(150) NOT NULL,
    status VARCHAR(50) DEFAULT 'Confirmed',
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_transactions(date);
CREATE INDEX IF NOT EXISTS idx_sales_emp ON sales_transactions(employee_id);
CREATE INDEX IF NOT EXISTS idx_sales_cust ON sales_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_forecast_month ON forecasts(year_month);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token);
