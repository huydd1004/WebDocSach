require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 3000;

async function getConn() {
  return await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'webdocsach'
  });
}

function authMiddleware(req, res, next) {
  const token = req.headers['authorization'] ? req.headers['authorization'].split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'devsecret');
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Health
app.get('/api/ping', (req, res) => res.json({ ok: true }));

// Auth: register
app.post('/api/register', async (req, res) => {
  const { user, pass } = req.body;
  if (!user || !pass) return res.status(400).json({ error: 'Missing' });
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT id FROM users WHERE username = ?', [user]);
    if (rows.length) return res.status(409).json({ error: 'User exists' });
    const hash = await bcrypt.hash(pass, 10);
    // if first user, make admin
    const [countRows] = await conn.execute('SELECT COUNT(*) as c FROM users');
    const role = (countRows[0].c === 0 && user === 'admin') ? 'admin' : 'user';
    await conn.execute('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [user, hash, role]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  } finally { conn.end(); }
});

// Auth: login
app.post('/api/login', async (req, res) => {
  const { user, pass } = req.body;
  if (!user || !pass) return res.status(400).json({ error: 'Missing' });
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT id, password_hash, role FROM users WHERE username = ?', [user]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid' });
    const u = rows[0];
    const ok = await bcrypt.compare(pass, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid' });
    const token = jwt.sign({ id: u.id, user, role: u.role }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '7d' });
    return res.json({ token, user, role: u.role });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  } finally { conn.end(); }
});

// Books: public list (reads from DB if present, otherwise fallback to data/books.json)
app.get('/api/books', async (req, res) => {
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT id, title, author, status, date, cover, genre FROM books');
    if (rows && rows.length) return res.json(rows.map(r => ({ ...r, genre: r.genre ? JSON.parse(r.genre) : [] })));
  } catch (e) {
    // ignore and fallback
  } finally { conn.end(); }
  // fallback
  const fs = require('fs');
  try {
    const raw = fs.readFileSync('./data/books.json','utf8');
    return res.json(JSON.parse(raw));
  } catch (e) {
    return res.json([]);
  }
});

// Admin: create/update/delete books (protected)
app.post('/api/books', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { id, title, author, status, date, cover, genre } = req.body;
  if (!id || !title) return res.status(400).json({ error: 'Missing' });
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT id FROM books WHERE id = ?', [id]);
    const g = genre ? JSON.stringify(genre) : JSON.stringify([]);
    if (rows.length) {
      await conn.execute('UPDATE books SET title=?, author=?, status=?, date=?, cover=?, genre=? WHERE id=?', [title, author, status, date, cover, g, id]);
    } else {
      await conn.execute('INSERT INTO books (id, title, author, status, date, cover, genre) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, title, author, status, date, cover, g]);
    }
    return res.json({ ok: true });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); } finally { conn.end(); }
});

app.delete('/api/books/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const id = req.params.id;
  const conn = await getConn();
  try { await conn.execute('DELETE FROM books WHERE id=?', [id]); return res.json({ ok: true }); } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); } finally { conn.end(); }
});

// Progress: save and get (protected)
app.get('/api/progress/:bookId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const bookId = req.params.bookId;
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT chapter, updated_at FROM progress WHERE user_id=? AND book_id=?', [userId, bookId]);
    if (!rows.length) return res.json(null);
    return res.json(rows[0]);
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); } finally { conn.end(); }
});

app.post('/api/progress', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { bookId, chapter } = req.body;
  if (!bookId || !chapter) return res.status(400).json({ error: 'Missing' });
  const conn = await getConn();
  try {
    const [rows] = await conn.execute('SELECT id FROM progress WHERE user_id=? AND book_id=?', [userId, bookId]);
    if (rows.length) {
      await conn.execute('UPDATE progress SET chapter=?, updated_at=NOW() WHERE user_id=? AND book_id=?', [chapter, userId, bookId]);
    } else {
      await conn.execute('INSERT INTO progress (user_id, book_id, chapter) VALUES (?,?,?)', [userId, bookId, chapter]);
    }
    return res.json({ ok: true });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); } finally { conn.end(); }
});

app.listen(PORT, () => console.log('Server listening on', PORT));
