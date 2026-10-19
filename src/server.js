const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDirectory = path.join(__dirname, '..', 'public');

app.use(express.json());

app.use(express.static(publicDirectory, {
  index: 'index.html',
  extensions: ['html']
}));

app.get('/api/books', (req, res) => {
  const filePath = path.join(publicDirectory, 'data', 'books.json');
  if (!fs.existsSync(filePath)) {
    res.json([]);
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(Array.isArray(data) ? data : []);
  } catch (error) {
    res.status(500).json({ error: 'Không thể đọc danh sách truyện.' });
  }
});

app.listen(PORT, () => {
  console.log(`\nWebDocSach server đang chạy tại: http://localhost:${PORT}\n`);
});
