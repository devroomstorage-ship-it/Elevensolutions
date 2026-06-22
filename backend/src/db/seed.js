require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

async function seed() {
  const sqlPath = path.join(__dirname, 'seed.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('Seed data applied.');
  } catch (err) {
    if (
      err.code === '23505' ||
      String(err.message || '').includes('duplicate key')
    ) {
      console.log('Seed data already appears to exist. Skipping.');
      return;
    }

    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();