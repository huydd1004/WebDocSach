# WebDocSach

## Cấu trúc thư mục

```text
WebDocSach/
├── public/                 # Nội dung được gửi tới trình duyệt
│   ├── assets/
│   │   ├── css/            # Giao diện
│   │   ├── images/         # Logo và bìa truyện
│   │   └── js/             # JavaScript phía trình duyệt
│   ├── data/               # Danh sách truyện và nội dung chương
│   ├── index.html           # Trang chủ
│   └── reader.html          # Trang đọc truyện
├── src/
│   └── server.js            # Máy chủ Express
├── package.json
└── README_SERVER.md
```

Máy chủ phục vụ website và API `GET /api/books`, lấy dữ liệu từ
`public/data/books.json`.

## Khởi động

```bash
npm start
```

Sau đó mở `http://localhost:3000`.
