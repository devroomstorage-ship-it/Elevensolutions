require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

async function seed() {
  try {
    const existing = await pool.query('SELECT COUNT(*)::int AS count FROM users');

    if (existing.rows[0].count > 0) {
      console.log('Seed data already exists. Skipping seed.');
      return;
    }

    const sqlPath = path.join(__dirname, 'seed.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await pool.query(sql);
    console.log('Seed data applied.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();