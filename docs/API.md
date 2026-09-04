# API và realtime protocol

## REST

### Password authentication

`POST /api/auth/register` nhận `{ username, password, factionId, displayName? }`; `POST /api/auth/login` nhận `{ username, password }`. Password mode yêu cầu `AUTH_MODE=password` và PostgreSQL. Access token chỉ sống 15 phút; refresh secret chỉ nằm trong HttpOnly SameSite=Strict cookie và được rotate tại `POST /api/auth/refresh`. `POST /api/auth/logout` revoke session.

`POST /api/admin/player/ban` và `/unban` nhận `{ playerId, reason }`, yêu cầu `Authorization: Bearer <ADMIN_TOKEN>`. Ban trả `ACCOUNT_BANNED` cho account và đánh dấu city/army/caravan là `frozen`; endpoint bị disable khi token rỗng.

### `POST /api/auth/dev`

Request:

```json
{"displayName":"Lan","factionId":"meridian"}
```

Response gồm `token`, `player` và `snapshot`. Đây là auth development; chưa dùng cho production.

### `GET /api/bootstrap`

Header: `Authorization: Bearer <token>`.

Trả về player hiện tại và world snapshot dùng để khởi tạo client.

### `GET /api/season-history`

Yêu cầu Bearer player token. Trả public ranking các season đã đóng và chỉ trả legacy/reputation cosmetic của chính người xem.

### `POST /api/admin/season/close`

Yêu cầu `Authorization: Bearer <ADMIN_TOKEN>` và body `{ "reason": "..." }`. Endpoint finalize ngay trong request; trả `ADMIN_DISABLED` khi chưa cấu hình token và ghi `admin_actions` khi thành công.

### `POST /api/commands/build`

Header: `Authorization: Bearer <token>`.

Request:

```json
{"commandId":"unique-command-id","cityId":"city-id","buildingId":"warehouse","queueType":"build"}
```

Server kiểm tra season, rate-limit, schema, ownership, queue capacity, resource cost và idempotency trước khi chấp nhận.

### `GET /health`, `/health/live`, `/health/ready` và `GET /metrics`

- `/health` và `/health/live` dùng cho liveness — luôn `{ ok: true }` khi process còn sống.
- `/health/ready` là readiness thật: trả 503 kèm `reason` khi đang shutdown (`shutting_down`), chưa nạp state (`state_not_loaded`), PostgreSQL hoặc Redis không ping được (`postgres` / `redis`), hoặc tick trễ hơn `tickMs * 3` (`tick_lag`). Nhiều lỗi cùng lúc trả `reason: "unhealthy"` kèm mảng `checks`.
- `/metrics` trả Prometheus-compatible metrics. Ở `AUTH_MODE=password` cần `Authorization: Bearer <METRICS_TOKEN>`; ở dev mode không yêu cầu auth. Trong prod compose, Caddy không public `/metrics`, `/health/ready` và `/api/dev/*` ra ngoài.

## WebSocket

Kết nối: `ws://localhost:3000/ws`, sau đó gửi `{ "type": "AUTH", "token": "<access-token>" }` trong tối đa 5 giây. Token trên query string không được chấp nhận.

Server gửi message `SNAPSHOT` chứa kingdom, season, cities, caravans, armies, heroes, scores, alliance, treaty, spy mission của người xem, world event và faction catalog.

Gameplay command đi qua REST; WebSocket dùng cho snapshot và battle report realtime sau khi xác thực. Sau khi `AUTH` thành công, server **bỏ qua mọi message client gửi tiếp** (socket vẫn mở) — không có đường command nào qua WS.

Nhịp push: broadcast là change-driven và được coalesce vào vòng tick (`tickMs`, mặc định 1000 ms) — `requestBroadcast()` chỉ bật cờ, chính tick mới gửi snapshot. Hệ quả: (a) một REST command tới được các client trong vòng ≤ ~1 tick (đo trên dev in-memory: 0,2–1,0 s), (b) thế giới không thay đổi thì không có push nào, vì tài nguyên chỉ đổi qua harvest/caravan/queue chứ không trickle thụ động.

Lỗi có dạng `ERROR` với code ổn định như `RATE_LIMITED`, `QUEUE_LIMIT_REACHED`, `CITY_ACCESS_DENIED`, `INSUFFICIENT_RESOURCES`. REST command còn có thể trả 503 `DEPENDENCY_UNAVAILABLE` khi dependency bắt buộc (Redis) không dùng được ở production.

## Quy tắc protocol

- Mọi write command phải có `commandId` duy nhất.
- Client không gửi authoritative cost, score, battle result hoặc server timestamp.
- Event ledger, outbox và state của mỗi REST command được commit trong cùng transaction khi PostgreSQL được bật.
- Thay đổi breaking phải tăng protocol version và cập nhật shared package cùng API docs.

## Rate-limit mặc định

Mỗi hạn mức là một bucket theo `key` trong `apps/server/src/app.ts`; vượt hạn mức trả HTTP 429 với code `RATE_LIMITED`.

- Write command REST: 20/phút/player — key `write:<playerId>` (`app.ts:98`).
- Command tốn kém (spy 5/phút, combat 10/phút): **hạn mức có nhưng bucket chưa tách** — mọi command vẫn đếm chung `write:<playerId>`, nên tiêu hạn mức bằng lệnh build cũng làm lệnh spy kế tiếp bị 429, và `attack` chạy ở 20 thay vì 10. Cần tách bucket theo nhóm command để khớp thiết kế này.
- Register: 3/giờ/IP — `register:<ip>`.
- Login ở `AUTH_MODE=password`: 5 lần mỗi 15 phút, khoá theo IP **và** username — `login:<ip>:<username>`.
- Login dev (`POST /api/auth/dev`): 30/phút/IP — `login:<ip>`.
- Refresh: 30/phút/IP — `refresh:<ip>`.
- Admin: moderation 10/phút/IP, season close 5/phút/IP — `admin:<ip>`.
- Read REST (`/api/bootstrap`, `/api/season-history`, `/api/battles`): **hiện không có rate-limit**.
- WebSocket: không có hạn mức command, vì WS không nhận command (xem mục WebSocket).

Ở production limiter **fail-closed**: khi Redis không dùng được, request trả 503 `DEPENDENCY_UNAVAILABLE` chứ không cho qua.


### Logistics commands

- `POST /api/commands/harvest` thu hoạch tối đa 50 resource từ node trong phạm vi và cần depot.
- `POST /api/commands/routes` tạo route giữa hai city cùng player; distance và travel time do server tính.
- `POST /api/commands/caravans` trừ cargo tại source, giới hạn bởi depot capacity, rồi delivery tại destination.
- `POST /api/commands/escort` gắn army của player vào caravan đang di chuyển.
- `POST /api/commands/ambush` resolve deterministic; seed được lưu trong caravan và event ledger.

### Alliance và treaty commands

- `POST /api/commands/alliance/create` tạo alliance và gán người tạo làm leader.
- `POST /api/commands/alliance/join` và `POST /api/commands/alliance/leave` quản lý membership.
- `POST /api/commands/alliance/contribute` đóng góp tài nguyên với diminishing returns.
- `POST /api/commands/alliance/member` cho leader promote, demote hoặc kick; không thể kick leader.
- `POST /api/commands/alliance/notice` cho leader/officer cập nhật notice.
- `POST /api/commands/alliance/vote/open` mở vote đổi leader trong 24 giờ.
- `POST /api/commands/alliance/vote/cast` cho mỗi member bỏ một phiếu; cần số phiếu yes lớn hơn 50% tổng membership.
- `POST /api/commands/treaty/propose` tạo đề nghị treaty.
- `POST /api/commands/treaty/respond` chấp nhận hoặc từ chối đề nghị.
- `POST /api/commands/treaty/break` phá treaty đang active và áp dụng phạt reputation.

### Espionage commands

- `POST /api/commands/spy/launch` khởi chạy scout, sabotage hoặc steal mission.
- `POST /api/commands/spy/counter-intel` bật phản gián có cost và cooldown server-side.
- Snapshot chỉ trả spy mission do player đang xem khởi chạy.

### World events và NPC

- `mob_migration` tạo 2–3 army có `ownerType: "npc"`, không có `ownerPlayerId` và gắn `sourceWorldEventId`.
- NPC hành động mỗi 10 giây, tìm player army trong Manhattan radius 3, tiến một tile và giao chiến khi cùng tile.
- NPC battle dùng cùng deterministic combat resolver; ledger lưu event id, seed, input và battle report để audit/replay.
