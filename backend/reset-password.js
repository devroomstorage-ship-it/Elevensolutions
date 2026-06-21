require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error('Usage:  node reset-password.js  <email>  <new-password>');
  process.exit(1);
}

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false,
  });
  try {
    const hash = await bcrypt.hash(password, 12);
    const upd = await pool.query(
      'UPDATE users SET password_hash = $1, is_active = TRUE WHERE email = $2 RETURNING id, email, role',
      [hash, email]
    );
    if (upd.rows.length) {
      console.log('OK - password reset for ' + upd.rows[0].email + ' (role: ' + upd.rows[0].role + ')');
    } else {
      const ins = await pool.query(
        "INSERT INTO users (email, full_name, role, password_hash, is_active) VALUES ($1, $2, 'super_admin', $3, TRUE) RETURNING id, email, role",
        [email, email.split('@')[0], hash]
      );
      console.log('OK - created new admin ' + ins.rows[0].email + ' (role: ' + ins.rows[0].role + ')');
    }
    console.log('');
    console.log('Log in with:');
    console.log('  email:    ' + email);
    console.log('  password: ' + password);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
