# Kingdoms of Meridian

MVP game chiến thuật realtime đa nền tảng, dùng PixiJS cho world map isometric và React cho UI. Server là authoritative cho tài nguyên, queue, logistics placeholder và season score.

Toàn bộ tài liệu dự án nằm trong thư mục `docs/`; bắt đầu từ `docs/README.md`.

## Chạy local

Yêu cầu Node.js 22+ (khuyên dùng 24+ cho chạy test TypeScript trực tiếp) và npm 10+.

### Chế độ in-memory (nhanh, không cần database)

```powershell
npm install
npm run build
npm run dev:web   # chạy đồng thời server (watch) + Vite dev server
```

Mở `http://localhost:5173`, đăng nhập bằng dev account và mở thêm một browser tab với tên khác để thấy các city/caravan dùng chung. Không có PostgreSQL/Redis thì server chỉ chạy in-memory với `AUTH_MODE=dev` — dữ liệu mất khi khởi động lại.

### Chế độ persisted (PostgreSQL + Redis)

```powershell
docker compose -f infra/docker-compose.yml up -d
$env:DATABASE_URL = "postgres://kingdoms:kingdoms@localhost:5432/kingdoms"
$env:REDIS_URL = "redis://localhost:6379"
npm run build
npm run db:migrate   # chạy toàn bộ migration trong infra/migrations/ theo thứ tự
npm run dev:web
```

Password mode (`AUTH_MODE=password`) bắt buộc PostgreSQL. Chạy riêng từng phần nếu cần: `npm run dev:server` / `npm run dev:client`.

## Kiểm thử

- `npm test` — unit test toàn bộ workspace (server, shared, client).
- `npm run test:postgres` — integration test với PostgreSQL (cần database, tự bỏ qua nếu thiếu).
- `npm run test:e2e` — Playwright end-to-end trên môi trường dev in-memory (reset thế giới giữa các project).

## MVP interfaces

- `POST /api/auth/dev`: tạo hoặc lấy dev player và token.
- `GET /api/bootstrap`: lấy snapshot có auth bearer token.
- `POST /api/commands/*`: mọi command (build, harvest, routes, caravans, recruit, attack, cancel-army-order, onboarding/ack, alliance, treaty, spy…) trả về `CommandResponse` chia sẻ `{ commandId, result: accepted|already_processed|rejected, acceptedAt?, snapshot?, data? }` (`code` khi rejected); client áp snapshot ngay từ `snapshot` và xem WebSocket như kênh phụ.
- `GET /health`: health check.
- `GET /metrics`: Prometheus-compatible metrics.
- `ws://localhost:3000/ws`: gửi message `AUTH` (token) sau khi connect để nhận snapshot, battle report và realtime updates; đóng mã `4401` khi token hết hạn/khoá account.

Build queues là hai queue xây dựng và một queue nghiên cứu cho mỗi city. Không có speed-up, power item hoặc mua trực tiếp score trong MVP.

## Domain decisions

Season mặc định dài 14 ngày trong MVP. Điểm tổng dùng `40% military + 35% economy + 25% diplomacy`; khi hết hạn, server chốt ranking từ state, lưu season history/legacy record rồi mở season mới. Schema đã có thêm logistics, diplomacy, espionage, world events, analytics và legacy để mở rộng mà không đổi lại boundary.

Client chỉ vẽ và gửi input. Kết quả command, tài nguyên, queue completion và score đều do server tạo. Rate-limit dùng Redis nếu có `REDIS_URL`, nếu không có thì fallback về bucket trong process để local development không bị chặn.

## Packaging

Web/PWA là target đầu tiên. Client production output nằm trong `apps/client/dist-web`; `apps/client/capacitor.config.ts` đã sẵn sàng cho Capacitor; Tauri sẽ được thêm sau khi web MVP ổn định để không tạo thêm runtime state riêng.
