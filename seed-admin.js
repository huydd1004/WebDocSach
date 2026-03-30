// seed-admin.js — Tạo tài khoản admin đầu tiên
// Chạy: node seed-admin.js <username> <password>

const path = require('path');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const BCRYPT_ROUNDS = 10;

const args = process.argv.slice(2);
const username = args[0] || 'admin';
const password = args[1] || 'admin123';

(async () => {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    // Update to admin role & reset password
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    db.prepare('UPDATE users SET password = ?, role = ? WHERE id = ?').run(hashed, 'admin', existing.id);
    console.log(`✅ Updated user "${username}" to admin with new password.`);
  } else {
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hashed, 'admin');
    console.log(`✅ Created admin user "${username}".`);
  }

  db.close();
})();
