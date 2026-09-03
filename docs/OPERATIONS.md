# Vận hành local và môi trường

## Local quick start

Không cần Docker nếu chỉ muốn phát triển nhanh bằng state in-memory. Chạy cả hai
process trong một cửa sổ PowerShell:

```powershell
npm install
npm run dev:web
```

Hoặc chạy riêng ở hai cửa sổ PowerShell:

```powershell
# Terminal 1
npm run dev:server

# Terminal 2
npm run dev:client
```

Chỉ bật Docker khi cần dữ liệu persisted qua PostgreSQL/Redis. Docker chạy các
dependency; hai npm dev process vẫn chạy trên host:

```powershell
npm install
docker compose -f infra/docker-compose.yml up -d
$env:DATABASE_URL = "postgres://kingdoms:kingdoms@localhost:5432/kingdoms"
$env:REDIS_URL = "redis://localhost:6379"
npm run db:migrate
```

Sau đó chạy server/client trong cùng PowerShell đã đặt biến môi trường, hoặc đặt
lại hai biến trên trong terminal chạy server:

```powershell
npm run dev:server
npm run dev:client
```

## Migration runner (Phase 7A)

- `npm run db:migrate` — apply các migration chưa chạy, mỗi file trong một transaction, có advisory lock và ghi `schema_migrations` (id + sha256 checksum).
- `npm run db:migrate:check` — kiểm tra toàn bộ checksum đã apply; exit non-zero nếu lệch hoặc còn pending. Fail trong deploy nếu checksum lệch.
- `npm run db:migrate:baseline` — baseline 001–011 cho database tạo trước khi có runner. Chỉ thành công khi đủ toàn bộ bảng/index bắt buộc; từ chối nếu `schema_migrations` đã có bản ghi.
- `npm run test:postgres` — reset schema trên database kết thúc bằng `_test` (`TEST_DATABASE_URL`), migrate 2 lần (idempotency), chạy toàn bộ integration tests, kiểm tra checksum.

## Outbox worker (Phase 7A)

- `npm run worker:outbox` — process riêng claim outbox `FOR UPDATE SKIP LOCKED`, XADD at-least-once vào stream `kingdoms.events.v1`, retry exponential 1s→5 phút, dead-letter sau 10 lần lỗi sang `kingdoms.events.dlq.v1`. Metric trên cổng `OUTBOX_METRICS_PORT` (mặc định 9101).
- Consumer xa hơn phải deduplicate theo `event.id`; duplicate do crash giữa publish và update là hành vi hợp lệ.

## Environment

- `PORT`: mặc định `3000`.
- `HOST`: mặc định `0.0.0.0`.
- `DATABASE_URL`: có thể bỏ trống duy nhất khi dùng `AUTH_MODE=dev`; password mode sẽ fail fast với `DATABASE_REQUIRED`.
- `AUTH_MODE`: mặc định `dev`; production/staging đặt `password`.
- `CLIENT_ORIGIN`: origin duy nhất được CORS trong password mode, bắt buộc là origin hợp lệ.
- `REDIS_URL`: bỏ trống để dùng in-process rate-limit fallback; production bắt buộc.
- `METRICS_TOKEN`: token bảo vệ `GET /metrics` trong password mode (production bắt buộc ≥32 ký tự).
- `TRUST_PROXY`: `true` chỉ khi chạy sau reverse proxy (Caddy).
- `SEASON_DURATION_MS`: mặc định 14 ngày.
- `WORLD_EVENT_SPAWN_CHANCE`: xác suất spawn event mỗi tick khi chưa có event active; mặc định `1/600`.
- `WORLD_EVENT_TYPE`: để trống để chọn ngẫu nhiên; có thể khóa một event type trong môi trường test/staging.
- `IDEMPOTENCY_WINDOW`: số command id gần nhất mỗi process giữ trong RAM để trả lời "đã xử lý chưa?" mà không cần truy vấn; mặc định `20000`, tối thiểu `1000`. Đây là **cache**, không phải nguồn sự thật: unique index `event_ledger_command_idx` cộng point query trong transaction của command vẫn chặn trùng khi id rơi ra ngoài window. Tăng lên tốn RAM, giảm xuống chỉ thêm một round trip cho retry cũ.
- `VITE_API_URL`: mặc định `http://localhost:3000`; để trống khi build qua Caddy (origin-relative).

Validation toàn bộ env bằng Zod lúc khởi động; `NODE_ENV=production` yêu cầu `AUTH_MODE=password`, PostgreSQL/Redis, `ADMIN_TOKEN`/`METRICS_TOKEN` ≥32 ký tự và `CLIENT_ORIGIN` HTTPS, và fail fast khi vi phạm.

## Kiểm tra

- `GET /health` — kiểm tra process (alias tương thích).
- `GET /health/live` — process còn chạy.
- `GET /health/ready` — 200 khi state đã load, PostgreSQL/Redis ping được và tick không trễ quá 3 chu kỳ; ngược lại 503 kèm lý do (`state_not_loaded`, `shutting_down`, `postgres`, `redis`, `tick_lag`).
- `GET /metrics` — cần `Authorization: Bearer $METRICS_TOKEN` trong password mode.
- Server log structured JSON qua Fastify/Pino.
- Không ghi token, password, secret hoặc nội dung chat nhạy cảm.
- Graceful shutdown khi `SIGTERM`/`SIGINT`: readiness về 503, dừng timer, đóng WebSocket code 1012, chờ tick/save hiện tại commit, đóng PostgreSQL/Redis.

## Troubleshooting

- Không có PostgreSQL: chỉ dev auth chạy được và state không survive restart. Password mode bắt buộc PostgreSQL.
- Client không kết nối: kiểm tra `VITE_API_URL`, port 3000 và WebSocket URL.
- Build fail do shared types: chạy `npm run build` ở root để build shared trước server/client.
- Port đã dùng: đặt `$env:PORT` khác và cập nhật `VITE_API_URL`.
- Database cũ không qua được baseline: chạy `npm run db:migrate:baseline` xem bảng/index nào thiếu, đối chiếu với migration, rebuild database dev hoặc xử lý qua support pipeline.

## Production stack (Phase 7A)

```powershell
# 1. Tạo .env.prod từ infra/.env.prod.example với secret thật (--env-file nội suy ${VAR} trong compose)
# 2. Xây và chạy full stack + Caddy (TLS tự động qua Let's Encrypt).
# Service migrate chạy 001-latest và phải hoàn tất trước khi game/outbox khởi động.
docker compose --env-file .env.prod -f infra/docker-compose.prod.yml up -d --build
# 3. Prometheus/Grafana tùy chọn
docker compose --env-file .env.prod --profile observability -f infra/docker-compose.prod.yml up -d
```

Offline smoke dùng override và host port 18081 mặc định (có thể đổi bằng `SMOKE_PORT`):

```powershell
docker compose --env-file .env.prod -f infra/docker-compose.prod.yml -f infra/docker-compose.smoke.yml up -d --build
```

- Caddy phục vụ client static, TLS, reverse proxy `/api` và `/ws`; không public PostgreSQL, Redis hoặc `/metrics`.
- PostgreSQL/Redis dùng named volume + health check + restart policy. Secret chỉ ở `.env.prod` (không commit).
- Trước khi bật profile observability, chép đúng `METRICS_TOKEN` (không thêm newline) vào `infra/backup/prometheus.token`; file này đã được gitignore. Prometheus scrape `game:3000/metrics` bằng token đó và `outbox:9101/metrics` trong internal network.

## Backup và restore drill

- `BACKUP_DIR=<mounted-off-host-dir> ./infra/backup/backup.sh` — pg_dump custom format mỗi ngày, giữ 7 daily + 4 weekly, ghi checksum/size/status vào `backup.log` (không ghi credentials). Script từ chối thư mục trong repository; local drill phải ghi rõ `BACKUP_ALLOW_LOCAL=1`. Cron đề xuất: `0 2 * * *`.
- `TEST_DATABASE_URL=... ./infra/backup/restore.sh <dump>` — restore vào database mới (`*_test`), chạy `db:migrate:check` và smoke bootstrap (game_state + users + outbox). Yêu cầu stack prod đang chạy.
- Restore drill phải thực hiện trước closed beta và mỗi tháng; ghi kết quả (file, thời gian, kết quả) vào runbook.

### Kết quả drill

- **2026-09-02** — `npm run drill:web-beta`; báo cáo đầy đủ: [`infra/backup/drill-report.md`](../infra/backup/drill-report.md). 3/3 pass: Redis kill, game kill (outbox chạy độc lập), backup → drop → restore. RPO 0 ms — sentinel row ghi vào `event_ledger` *trước* khi dump vẫn còn sau restore; RTO 5795 ms so với ngưỡng 30 phút.
- Kỳ hạn kế tiếp: **2026-10-02** (cadence hằng tháng ở trên). Job `recovery-drill` trong `.github/workflows/ci.yml` chạy `drill:web-beta` theo cron hằng tháng (ngày 2, 03:07 UTC) và upload `drill-report.md` làm artifact; vẫn phải copy số RPO/RTO vào mục này bằng tay vì job không commit vào repo. Job đó **chưa từng chạy** — nối dây xong nhưng chưa quan sát được kết quả trên runner.
- Giới hạn của lần drill này: `scripts/drill-web-beta.mjs:120` gọi `docker compose exec postgres pg_dump -f /tmp/dump.sql`, **không** chạy `infra/backup/backup.sh` / `restore.sh`. Vậy nên hai script ở trên — custom format, retention 7 daily + 4 weekly, checksum/size vào `backup.log`, guard `BACKUP_ALLOW_LOCAL` — vẫn chưa được kiểm chứng lần nào; drill tháng sau nên đi qua đúng hai script đó để tick được cả đường cron thật.

## Load test (Phase 7A)

Môi trường cô lập trên database hậu tố `_loadtest`:

1. Tạo DB `kingdoms_loadtest`, chạy `npm run db:migrate` với `DATABASE_URL` trỏ tới nó, khởi động game server (có outbox worker) trỏ cùng DB.
2. `LOADTEST_DATABASE_URL=... LOADTEST_BASE_URL=http://... npm run test:loadtest:seed` — tạo trực tiếp 120 tài khoản trong DB cô lập, phát fresh load-test session và lưu fixture tại `e2e/loadtest/loadtest-fixture.json`. CLI từ chối nếu DB không có hậu tố `_loadtest`; không thay đổi rate-limit API công khai.
3. `k6 run e2e/loadtest/loadtest.js` — 100 WebSocket 15 phút, 10 command/s, reconnect burst, duplicate commandId.
4. `LOADTEST_DATABASE_URL=... npm run test:loadtest:verify` — outbox backlog < 100 và drain < 30s.

Ngưỡng đạt: command p95 < 250 ms, p99 < 750 ms; lỗi ngoài gameplay < 1%; WS connect/reconnect > 99%; outbox backlog < 100, drain trong 30 giây sau khi Redis phục hồi.

## Production checklist

- Dùng auth thật, TLS, secret manager và database credentials riêng.
- Không bật in-memory fallback; Redis/PostgreSQL bắt buộc.
- Chạy migration trước deploy app; `db:migrate:check` phải pass trong deploy.
- Chạy PostgreSQL integration test với `TEST_DATABASE_URL` trỏ tới database test đã migrate.
- Có backup/restore, distributed lock season và outbox worker.
- Có alert cho WebSocket disconnect, command rejection, tick lag và database errors.
- Restore drill trước beta và hằng tháng.
