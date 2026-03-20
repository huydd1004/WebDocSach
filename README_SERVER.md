# WebDocSach — Backend setup

This project adds a minimal Express + MySQL backend for storing users, books, and reading progress.

Steps to run locally:

1. Copy `.env.example` to `.env` and edit your DB credentials.

2. Create the database and tables. Using MySQL CLI or a client, run `migrations.sql`:

```sql
-- in mysql client
source migrations.sql;
```

3. Install dependencies:

```bash
npm install
```

4. Start the server:

```bash
npm start
```

5. The server runs on port specified in `.env` (default 3000). Frontend will call `/api/...` endpoints relative to same host. If serving frontend from a static server, update `server.js` CORS origin accordingly.

Notes:
- Authentication uses JWT tokens returned from `/api/login`. The token is stored client-side in `localStorage` session object by the frontend.
- This is a minimal backend intended to replace client-side localStorage persistence. It's not production hardened.
