# Vận hành local và môi trường

## Local quick start

```powershell
npm install
docker compose -f infra/docker-compose.yml up -d
```

Chạy migration `infra/migrations/001_initial.sql` bằng psql hoặc công cụ quản trị PostgreSQL, sau đó đặt:

```powershell
$env:DATABASE_URL = "postgres://kingdoms:kingdoms@localhost:5432/kingdoms"
$env:REDIS_URL = "redis://localhost:6379"
```

Chạy server và client ở hai terminal:

```powershell
npm run dev:server
npm run dev:client
```

## Environment

- `PORT`: mặc định `3000`.
- `HOST`: mặc định `0.0.0.0`.
- `DATABASE_URL`: bỏ trống để dùng in-memory local fallback.
- `REDIS_URL`: bỏ trống để dùng in-process rate-limit fallback.
- `SEASON_DURATION_MS`: mặc định 14 ngày.
- `VITE_API_URL`: mặc định `http://localhost:3000`.

Mẫu biến môi trường nằm ở `.env.example`.

## Kiểm tra

- `GET /health` kiểm tra process.
- `GET /metrics` kiểm tra command count, latency và runtime metrics.
- Server log structured JSON qua Fastify/Pino.
- Không ghi token, password, secret hoặc nội dung chat nhạy cảm.

## Troubleshooting

- Không có PostgreSQL/Redis: server vẫn chạy nhưng state không survive restart.
- Client không kết nối: kiểm tra `VITE_API_URL`, port 3000 và WebSocket URL.
- Build fail do shared types: chạy `npm run build` ở root để build shared trước server/client.
- Port đã dùng: đặt `$env:PORT` khác và cập nhật `VITE_API_URL`.

## Production checklist

- Dùng auth thật, TLS, secret manager và database credentials riêng.
- Không bật in-memory fallback.
- Chạy migration trước deploy app.
- Có backup/restore, distributed lock season và outbox worker.
- Có alert cho WebSocket disconnect, command rejection, tick lag và database errors.
