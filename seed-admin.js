require('dotenv').config();
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

const ADMIN_USER = process.env.SEED_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.SEED_ADMIN_PASS || 'admin123';

async function getConn() {
  return await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'webdocsach'
  });
}

(async function seed(){
  const hash = await bcrypt.hash(ADMIN_PASS, 10);
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT id FROM users WHERE username = ?', [ADMIN_USER]);
    if (rows.length) {
      console.log('User exists:', ADMIN_USER);
      return process.exit(0);
    }
    await conn.execute('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [ADMIN_USER, hash, 'admin']);
    console.log('Admin user created:', ADMIN_USER);
    process.exit(0);
  } catch (e) {
    console.error('Error seeding admin:', e);
    process.exit(1);
  } finally { conn.end(); }
})();
