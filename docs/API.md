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

### `GET /health` và `GET /metrics`

- `/health` dùng cho liveness.
- `/metrics` trả Prometheus-compatible metrics, không yêu cầu auth trong local MVP.

## WebSocket

Kết nối: `ws://localhost:3000/ws`, sau đó gửi `{ "type": "AUTH", "token": "<access-token>" }` trong tối đa 5 giây. Token trên query string không được chấp nhận.

Server gửi message `SNAPSHOT` chứa kingdom, season, cities, caravans, armies, heroes, scores, alliance, treaty, spy mission của người xem, world event và faction catalog.

Gameplay command đi qua REST; WebSocket dùng cho snapshot và battle report realtime sau khi xác thực.

Lỗi có dạng `ERROR` với code ổn định như `RATE_LIMITED`, `QUEUE_LIMIT_REACHED`, `CITY_ACCESS_DENIED`, `INSUFFICIENT_RESOURCES`.

## Quy tắc protocol

- Mọi write command phải có `commandId` duy nhất.
- Client không gửi authoritative cost, score, battle result hoặc server timestamp.
- Event ledger, outbox và state của mỗi REST command được commit trong cùng transaction khi PostgreSQL được bật.
- Thay đổi breaking phải tăng protocol version và cập nhật shared package cùng API docs.

## Rate-limit mặc định

- Read REST: 60/phút/player.
- Write REST: 20/phút/player.
- WebSocket command: 30/phút/player.
- Command tốn kém như spy/battle/caravan reroute: 5/phút/player khi được bật.
- Login: 10/phút/IP.


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
