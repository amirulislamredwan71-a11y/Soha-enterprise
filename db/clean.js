// db/clean.js - Complete purge of all mock, dummy, and sample data from SOHA ENTERPRISE SQLite database
const db = require('./database');
const { generateSalt, hashPassword } = require('./auth');

function cleanAllMockData() {
    console.log('--- PURGING ALL MOCK DATA FROM SOHA ENTERPRISE DATABASE ---');

    db.exec(`PRAGMA foreign_keys = OFF;`);

    // 1. Wipe all operational, sample, and transactional data
    db.exec(`
        DELETE FROM user_sessions;
        DELETE FROM outstanding_confirmations;
        DELETE FROM collections;
        DELETE FROM forecasts;
        DELETE FROM sales_transactions;
        DELETE FROM users;
        DELETE FROM customers;
        DELETE FROM products;
        DELETE FROM employees;
    `);

    // Reset autoincrement sequences
    try {
        db.exec(`
            DELETE FROM sqlite_sequence WHERE name IN (
                'users', 'employees', 'customers', 'products',
                'sales_transactions', 'forecasts', 'collections', 'outstanding_confirmations'
            );
        `);
    } catch (e) {
        // In case sqlite_sequence table is not present
    }

    db.exec(`PRAGMA foreign_keys = ON;`);

    // 2. Insert ONLY the real Main Admin account
    const adminSalt = generateSalt();
    const adminHash = hashPassword('admin123', adminSalt);

    const insertAdmin = db.prepare(`
        INSERT INTO users (username, password_hash, salt, full_name, role, phone, employee_id, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);

    insertAdmin.run('admin', adminHash, adminSalt, 'SOHA Master Admin', 'main_admin', '01700000000', null);

    console.log('✔ All mock sales transactions deleted.');
    console.log('✔ All mock collections deleted.');
    console.log('✔ All mock forecasts deleted.');
    console.log('✔ All mock customers deleted.');
    console.log('✔ All mock products deleted.');
    console.log('✔ All mock employees deleted.');
    console.log('✔ All mock sub-accounts deleted.');
    console.log('✔ All previous sessions cleared.');
    console.log('✔ Clean Main Admin account established: username: admin');
    console.log('--- DATABASE IS NOW 100% CLEAN AND READY FOR PRODUCTION DATA ---');
}

if (require.main === module) {
    cleanAllMockData();
}

module.exports = cleanAllMockData;
