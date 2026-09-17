// db/seed.js - Initialize clean production database for SOHA ENTERPRISE (Zero-Mock Policy)
const cleanAllMockData = require('./clean');

function seed() {
    cleanAllMockData();
}

if (require.main === module) {
    seed();
}

module.exports = seed;
