// db/database.js - SQLite Database connection using native node:sqlite
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'bonafide.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Open or create SQLite database
const db = new DatabaseSync(DB_PATH);

// Initialize schema
function initSchema() {
    const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schemaSql);
}

initSchema();

module.exports = db;
