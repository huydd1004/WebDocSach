// ============================================================
// WebDocSach — Backend Server
// Express + SQLite (better-sqlite3) + bcrypt + JWT
// ============================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

// --------------- Config ---------------
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.sqlite');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES = '7d';
const BCRYPT_ROUNDS = 10;

// --------------- Database Init ---------------
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id TEXT NOT NULL,
    chapter INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, book_id)
  );
`);

// --------------- Helpers ---------------
function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Chưa đăng nhập.' });
  }
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
  }
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ admin mới có quyền.' });
    }
    next();
  });
}

// --------------- Express App ---------------
const app = express();
app.use(express.json());

// Serve static files
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html']
}));

// ==========================================
// AUTH API
// ==========================================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin.' });
    if (username.length < 3) return res.status(400).json({ error: 'Tên đăng nhập phải có ít nhất 3 ký tự.' });
    if (password.length < 4) return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 4 ký tự.' });

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại.' });

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hashed, 'user');

    res.json({ message: 'Đăng ký thành công.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Lỗi server.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin.' });

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });

    const token = generateToken(user);
    res.json({ token, user: { username: user.username, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Lỗi server.' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { username, newPassword } = req.body;
    if (!username || !newPassword) return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin.' });
    if (newPassword.length < 4) return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 4 ký tự.' });

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(404).json({ error: 'Tên đăng nhập không tồn tại.' });

    const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);

    res.json({ message: 'Đặt lại mật khẩu thành công.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Lỗi server.' });
  }
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT username, role FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User không tồn tại.' });
  res.json({ user });
});

// ==========================================
// READING PROGRESS API
// ==========================================

app.get('/api/progress', authRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM progress WHERE user_id = ?').all(req.user.id);
  const map = {};
  rows.forEach(r => { map[r.book_id] = { chapter: r.chapter, updated: r.updated_at }; });
  res.json(map);
});

app.get('/api/progress/:bookId', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM progress WHERE user_id = ? AND book_id = ?').get(req.user.id, req.params.bookId);
  if (!row) return res.json({ chapter: null });
  res.json({ chapter: row.chapter, updated: row.updated_at });
});

app.post('/api/progress/:bookId', authRequired, (req, res) => {
  const { chapter } = req.body;
  if (!chapter || isNaN(Number(chapter))) return res.status(400).json({ error: 'Chapter không hợp lệ.' });

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO progress (user_id, book_id, chapter, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, book_id) DO UPDATE SET chapter = excluded.chapter, updated_at = excluded.updated_at`
  ).run(req.user.id, req.params.bookId, Number(chapter), now);
  res.json({ ok: true });
});

// ==========================================
// BOOKS API (Admin)
// ==========================================

app.get('/api/books', (req, res) => {
  // Always read from books.json for consistency
  const filePath = path.join(__dirname, 'data', 'books.json');
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return res.json(data);
  }
  res.json([]);
});

app.post('/api/books', adminRequired, (req, res) => {
  const { id, title, author, status, date, cover, genre } = req.body;
  if (!id || !title) return res.status(400).json({ error: 'id và title là bắt buộc.' });

  // Update books.json
  const filePath = path.join(__dirname, 'data', 'books.json');
  let list = [];
  if (fs.existsSync(filePath)) {
    list = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  const idx = list.findIndex(b => b.id === id);
  if (idx >= 0) {
    list[idx] = { id, title, author: author || '', status: status || '', date: date || '', cover: cover || '', genre: Array.isArray(genre) ? genre : [] };
  } else {
    list.push({ id, title, author: author || '', status: status || '', date: date || '', cover: cover || '', genre: Array.isArray(genre) ? genre : [] });
  }
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
  res.json({ ok: true });
});

app.delete('/api/books/:id', adminRequired, (req, res) => {
  const filePath = path.join(__dirname, 'data', 'books.json');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Truyện không tồn tại.' });
  let list = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const idx = list.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Truyện không tồn tại.' });
  list.splice(idx, 1);
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
  res.json({ ok: true });
});

// ==========================================
// CHAPTER CONTENT API (Admin)
// ==========================================

// Lấy danh sách chương của 1 truyện (dựa vào index.json nếu có, hoặc liệt kê file .txt)
app.get('/api/chapters/:bookId', adminRequired, (req, res) => {
  const bookId = req.params.bookId;
  const bookDir = path.join(__dirname, 'data', bookId);
  let chapters = [];
  // Ưu tiên đọc index.json nếu có
  const indexPath = path.join(bookDir, 'index.json');
  if (fs.existsSync(indexPath)) {
    try {
      const idx = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      if (idx && idx.total) {
        for (let i = 1; i <= idx.total; ++i) chapters.push(i);
      }
    } catch {}
  } else {
    // Liệt kê file .txt trong các thư mục phần
    if (fs.existsSync(bookDir)) {
      const parts = fs.readdirSync(bookDir).filter(f => f.startsWith('phần '));
      parts.forEach(part => {
        const partDir = path.join(bookDir, part);
        fs.readdirSync(partDir).forEach(f => {
          if (f.endsWith('.txt')) {
            const chap = parseInt(f.replace('.txt',''));
            if (!isNaN(chap)) chapters.push(chap);
          }
        });
      });
      chapters.sort((a,b)=>a-b);
    }
  }
  res.json({ chapters });
});

// Xem nội dung 1 chương
app.get('/api/chapter/:bookId/:chapter', adminRequired, (req, res) => {
  const { bookId, chapter } = req.params;
  const part = Math.ceil(Number(chapter)/200);
  const filePath = path.join(__dirname, 'data', bookId, `phần ${part}`, `${chapter}.txt`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Chương không tồn tại.' });
  res.type('text').send(fs.readFileSync(filePath, 'utf-8'));
});

// Thêm/sửa nội dung chương
app.post('/api/chapter/:bookId/:chapter', adminRequired, (req, res) => {
  const { bookId, chapter } = req.params;
  const { content } = req.body;
  if (!content || typeof content !== 'string') return res.status(400).json({ error: 'Thiếu nội dung.' });
  const part = Math.ceil(Number(chapter)/200);
  const dir = path.join(__dirname, 'data', bookId, `phần ${part}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${chapter}.txt`);
  fs.writeFileSync(filePath, content, 'utf-8');
  res.json({ ok: true });
});

// Xóa chương
app.delete('/api/chapter/:bookId/:chapter', adminRequired, (req, res) => {
  const { bookId, chapter } = req.params;
  const part = Math.ceil(Number(chapter)/200);
  const filePath = path.join(__dirname, 'data', bookId, `phần ${part}`, `${chapter}.txt`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Chương không tồn tại.' });
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// ==========================================
// Start server
// ==========================================
app.listen(PORT, () => {
  console.log(`\n🚀 WebDocSach server (SQLite) đang chạy tại: http://localhost:${PORT}\n`);
});
