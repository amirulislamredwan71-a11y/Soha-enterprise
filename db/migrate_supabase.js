// db/migrate_supabase.js - Migrate Schema & Seed Admin into Supabase PostgreSQL
const fs = require('node:fs');
const path = require('node:path');
const { pool, query } = require('./postgres');
const { generateSalt, hashPassword } = require('./auth');

async function migrate() {
    console.log('--- STARTING SUPABASE POSTGRESQL MIGRATION ---');
    try {
        let schemaSql = fs.readFileSync(path.join(__dirname, 'schema.postgres.sql'), 'utf-8');
        schemaSql = schemaSql.replace(/^\uFEFF/, '').trim();

        console.log('1. Applying PostgreSQL schema to Supabase...');
        await query(schemaSql);
        console.log('✔ All 9 PostgreSQL tables and indexes created successfully in Supabase!');

        // 2. Ensure Main Admin exists
        const checkAdmin = await query("SELECT id FROM users WHERE username = 'admin'");
        if (checkAdmin.rows.length === 0) {
            console.log('2. Seeding clean Main Admin account...');
            const salt = generateSalt();
            const hash = hashPassword('admin123', salt);
            await query(`
                INSERT INTO users (username, password_hash, salt, full_name, role, phone, employee_id, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
            `, ['admin', hash, salt, 'SOHA Master Admin', 'main_admin', '01700000000', null]);
            console.log('✔ Main Admin account created on Supabase: username: admin');
        } else {
            console.log('✔ Main Admin account already exists on Supabase.');
        }

        // 3. Verify tables
        const tablesRes = await query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        `);
        console.log('--- SUPABASE LIVE TABLES ---');
        tablesRes.rows.forEach(r => console.log('  • ' + r.table_name));

        console.log('--- MIGRATION COMPLETED SUCCESSFULLY ---');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    migrate();
}

module.exports = migrate;
