# Kingdoms of Meridian

MVP game chiến thuật realtime đa nền tảng, dùng PixiJS cho world map isometric và React cho UI. Server là authoritative cho tài nguyên, queue, logistics placeholder và season score.

Toàn bộ tài liệu dự án nằm trong thư mục `docs/`; bắt đầu từ `docs/README.md`.

## Chạy local

Yêu cầu Node.js 22+ và npm 10+.

```powershell
npm install
docker compose -f infra/docker-compose.yml up -d
$env:DATABASE_URL = "postgres://kingdoms:kingdoms@localhost:5432/kingdoms"
$env:REDIS_URL = "redis://localhost:6379"
npm run build
npm run dev:server
```

Migration hiện được cung cấp tại `infra/migrations/001_initial.sql`; chạy file này trước khi bật persistence PostgreSQL. Nếu chưa cấu hình database/Redis, server vẫn chạy in-memory để thử UI.

Trong terminal thứ hai:

```powershell
npm run dev:client
```

Mở `http://localhost:5173`, đăng nhập bằng dev account và mở thêm một browser tab với tên khác để thấy các city/caravan dùng chung.

## MVP interfaces

- `POST /api/auth/dev`: tạo hoặc lấy dev player và token.
- `GET /api/bootstrap`: lấy snapshot có auth bearer token.
- `POST /api/commands/build`: gửi command xây dựng đã được server kiểm tra.
- `GET /health`: health check.
- `GET /metrics`: Prometheus-compatible metrics.
- `ws://localhost:3000/ws?token=...`: snapshot và realtime updates.

Build queues là hai queue xây dựng và một queue nghiên cứu cho mỗi city. Không có speed-up, power item hoặc mua trực tiếp score trong MVP.

## Domain decisions

Season mặc định dài 14 ngày trong MVP. Điểm tổng dùng `40% military + 35% economy + 25% diplomacy`; khi hết hạn, server chốt ranking từ state, lưu season history/legacy record rồi mở season mới. Schema đã có thêm logistics, diplomacy, espionage, world events, analytics và legacy để mở rộng mà không đổi lại boundary.

Client chỉ vẽ và gửi input. Kết quả command, tài nguyên, queue completion và score đều do server tạo. Rate-limit dùng Redis nếu có `REDIS_URL`, nếu không có thì fallback về bucket trong process để local development không bị chặn.

## Packaging

Web/PWA là target đầu tiên. Client production output nằm trong `apps/client/dist-web`; `apps/client/capacitor.config.ts` đã sẵn sàng cho Capacitor; Tauri sẽ được thêm sau khi web MVP ổn định để không tạo thêm runtime state riêng.
