// db/postgres.js - Supabase PostgreSQL Connection Pool for SOHA ENTERPRISE
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.tywfxohzvgqeohadmiri:Soha2026%40%26%24@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres';

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle Supabase PostgreSQL client:', err);
});

module.exports = {
    pool,
    query: (text, params) => pool.query(text, params)
};
