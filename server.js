const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html']
}));

app.get('/api/books', (req, res) => {
  const filePath = path.join(__dirname, 'data', 'books.json');
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
