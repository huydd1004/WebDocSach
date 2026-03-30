# WebDocSach — Backend Server

## Tech Stack
- **Express** — Web server & API
- **better-sqlite3** — Database (SQLite, không cần cài riêng)
- **bcrypt** — Hash mật khẩu an toàn
- **jsonwebtoken** — JWT authentication

## Cài đặt & Chạy

```bash
# 1. Cài dependencies
npm install

# 2. Tạo tài khoản admin (mặc định: admin / admin123)
node seed-admin.js admin admin123

# 3. Chạy server
npm start
# Server chạy tại: http://localhost:3000
```

## API Endpoints

### Auth
| Method | URL | Mô tả |
|--------|-----|--------|
| POST | `/api/auth/register` | Đăng ký (`{username, password}`) |
| POST | `/api/auth/login` | Đăng nhập → trả về JWT token |
| POST | `/api/auth/forgot-password` | Đặt lại mật khẩu (`{username, newPassword}`) |
| GET | `/api/auth/me` | Thông tin user hiện tại (cần token) |

### Reading Progress (cần đăng nhập)
| Method | URL | Mô tả |
|--------|-----|--------|
| GET | `/api/progress` | Lấy tất cả tiến độ đọc |
| GET | `/api/progress/:bookId` | Lấy tiến độ 1 truyện |
| POST | `/api/progress/:bookId` | Lưu tiến độ (`{chapter}`) |

### Books
| Method | URL | Mô tả |
|--------|-----|--------|
| GET | `/api/books` | Danh sách truyện (public) |
| POST | `/api/books` | Thêm/sửa truyện (admin only) |
| DELETE | `/api/books/:id` | Xóa truyện (admin only) |

## Ghi chú
- Database tự động tạo file `database.sqlite` khi chạy lần đầu
- Sách từ `data/books.json` được import tự động vào DB khi DB trống
- JWT token hết hạn sau 7 ngày
- Frontend vẫn hoạt động offline với localStorage khi không có server
