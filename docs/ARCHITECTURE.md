# Kiến trúc hệ thống

## Nguyên tắc

- Client chỉ render, giữ UI state và gửi input.
- Server là authoritative cho tài nguyên, queue, logistics, combat, score và season.
- Shared package chứa type, schema và protocol; không chứa quyền quyết định gameplay ở client.
- PostgreSQL là nguồn dữ liệu bền vững; Redis là state nóng, pub/sub, rate-limit và job coordination.
- Mỗi domain có command handler, policy validation, repository và event boundary riêng.

## Cấu trúc runtime

```text
Browser / Capacitor / Tauri
        │
        ├── REST: auth, bootstrap, commands không cần stream
        └── WebSocket: snapshot, entity updates, event notifications
                    │
              Node.js API + WS gateway
                    │
        ┌───────────┼───────────┬────────────┐
        │           │           │            │
      World      Economy     Logistics     Social
        │           │           │            │
      Battle     Seasons     Diplomacy    Espionage
                    │
          PostgreSQL + Redis + workers
```

## Client

- PixiJS v7 render bản đồ isometric, city, army, hero và caravan.
- React render HUD, menu, resource panel, queue và score.
- `apps/client/src/api.ts` chỉ gọi API/protocol; không tính cost hay kết quả gameplay.
- `/admin` được chọn trước khi mount `GameProvider` và lazy-load một entry riêng. Admin API giữ access token trong memory, dùng cookie `admin_refresh_token` riêng và không import gameplay token state, Pixi hoặc WebSocket.
- PWA là target đầu tiên; Capacitor và Tauri dùng cùng client build.
- Map render có thể được thay asset mà không thay domain state.

## Server

- Fastify xử lý REST, auth middleware và response code.
- WebSocket `ws` phát snapshot hiện tại và nhận command.
- Domain state hiện có in-memory store để chạy MVP không cần service phụ; khi có `DATABASE_URL`, snapshot được persist vào PostgreSQL.
- Redis rate-limit được dùng khi có `REDIS_URL`; local fallback chỉ dành cho development.
- Economy tick và season check chạy server-side; production sẽ tách worker theo kingdom/shard.

## Identity và admin boundary

Auth tạo principal phân biệt `player` và `admin`. Gameplay REST cùng `/ws` chỉ nhận player principal; `/api/admin/*` account routes chỉ nhận admin principal. Hai loại refresh family và cookie path không dùng chéo được. Admin hợp lệ không cần hàng `players`, còn credential admin gửi vào player login chỉ nhận lỗi generic.

Admin read model chỉ trả DTO bounded cho dashboard, player status/detail, season gần đây và attributable audit; không trả `WorldSnapshot`, resource, building, queue, army, password hash hoặc token digest. Mutation ban/unban/đóng mùa gọi domain store hiện có và gắn audit context. `ADMIN_TOKEN` là compatibility seam tạm thời chỉ cho ba mutation cũ; nó không đọc admin data và không xác thực gameplay.

Forced season close cần cả reason và current season ID mà UI đã hiển thị. Store kiểm ID trong finalization transaction, nên một confirmation cũ không thể đóng season vừa chuyển.

## Command lifecycle

```text
request
  → auth/session
  → transport rate-limit
  → schema validation
  → idempotency/version/ownership
  → domain rule + resource transaction
  → PostgreSQL commit + outbox event
  → Redis pub/sub
  → WebSocket snapshot/update
```

Không tin client timestamp, cost, score, battle result hoặc resource amount.

## Scaling path

1. MVP: một Node process, một kingdom, snapshot persistence.
2. Beta: domain repositories, outbox publisher, Redis Streams và worker tick.
3. Production: gateway stateless, shard theo `kingdom_id`, Economy/Battle worker riêng.
4. Combat simulation nặng có thể tách Go service sau khi có profiling chứng minh cần thiết; protocol vẫn giữ trong shared contract.
