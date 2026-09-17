// db/migrate_invoices.js - Create invoices and invoice_items tables in Supabase
const db = require('./postgres');

async function migrateInvoices() {
    console.log('--- CREATING INVOICES AND INVOICE_ITEMS TABLES IN SUPABASE ---');

    const sql = `
    CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_no VARCHAR(100) UNIQUE NOT NULL,
        date DATE NOT NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
        subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0,
        discount_amt NUMERIC(15, 2) DEFAULT 0,
        total_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
        coll_cash NUMERIC(15, 2) DEFAULT 0,
        dues NUMERIC(15, 2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
        invoice_no VARCHAR(100) NOT NULL,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        qty INTEGER NOT NULL DEFAULT 1,
        unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
        total_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
        bonus_qty INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE sales_transactions DROP CONSTRAINT IF EXISTS sales_transactions_invoice_no_key;

    CREATE INDEX IF NOT EXISTS idx_invoices_no ON invoices(invoice_no);
    CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);
    CREATE INDEX IF NOT EXISTS idx_invoices_cust ON invoices(customer_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_emp ON invoices(employee_id);
    CREATE INDEX IF NOT EXISTS idx_items_invoice ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_items_prod ON invoice_items(product_id);
    `;

    try {
        await db.query(sql);
        console.log('✔ Invoices and invoice_items tables created successfully in Supabase!');
        process.exit(0);
    } catch (err) {
        console.error('Migration error:', err);
        process.exit(1);
    }
}

migrateInvoices();
