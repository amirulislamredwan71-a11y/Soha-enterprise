// db/auth.js - Cryptographic Password Hashing & Verification
const crypto = require('node:crypto');

function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

function verifyPassword(password, salt, hash) {
    const computed = hashPassword(password, salt);
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
}

function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

module.exports = {
    generateSalt,
    hashPassword,
    verifyPassword,
    generateSessionToken
};
