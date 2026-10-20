# WebDocSach

## Cấu trúc thư mục

```text
WebDocSach/
├── public/                 # Website được GitHub Pages xuất bản
│   ├── assets/
│   │   ├── css/            # Giao diện
│   │   ├── images/         # Logo và bìa truyện
│   │   └── js/             # JavaScript phía trình duyệt
│   ├── data/               # Danh sách truyện và nội dung chương
│   ├── index.html           # Trang chủ
│   └── reader.html          # Trang đọc truyện
├── scripts/
│   └── build-chapter-indexes.js # Tạo danh mục chương từ các file truyện
├── src/
│   └── server.js            # Máy chủ Express
├── package.json
└── README_SERVER.md
```

Website đọc danh sách truyện trực tiếp từ `public/data/books.json`. Mỗi thư mục
truyện có `chapters.json` chứa số chương, tiêu đề và đường dẫn tới file nội dung.
Danh mục này giúp trang đọc không phải tải hàng trăm file chỉ để lấy tiêu đề.

## Khởi động

```bash
npm start
```

Sau đó mở `http://localhost:3000`.

## Cập nhật chương

Sau khi thêm, xóa hoặc đổi tên file `.txt`, chạy:

```bash
npm run build:chapters
```

Lệnh này cập nhật `chapters.json` và `index.json` của tất cả truyện. Khi đưa mã
lên nhánh `main`, GitHub Actions cũng tự chạy bước này trước khi xuất bản.
