# API và realtime protocol

## REST

### `POST /api/auth/dev`

Request:

```json
{"displayName":"Lan","factionId":"meridian"}
```

Response gồm `token`, `player` và `snapshot`. Đây là auth development; chưa dùng cho production.

### `GET /api/bootstrap`

Header: `Authorization: Bearer <token>`.

Trả về player hiện tại và world snapshot dùng để khởi tạo client.

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

Kết nối: `ws://localhost:3000/ws?token=<token>`.

Server gửi message `SNAPSHOT` chứa kingdom, season, cities, caravans, armies, heroes, scores và faction catalog.

Client gửi message `BUILD_START` với `commandId`, `cityId`, `buildingId` và `queueType`.

Lỗi có dạng `ERROR` với code ổn định như `RATE_LIMITED`, `QUEUE_LIMIT_REACHED`, `CITY_ACCESS_DENIED`, `INSUFFICIENT_RESOURCES`.

## Quy tắc protocol

- Mọi write command phải có `commandId` duy nhất.
- Client không gửi authoritative cost, score, battle result hoặc server timestamp.
- Version field sẽ được thêm khi chuyển từ snapshot store sang repository transaction.
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
