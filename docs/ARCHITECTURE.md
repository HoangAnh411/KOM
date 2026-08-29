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
- PWA là target đầu tiên; Capacitor và Tauri dùng cùng client build.
- Map render có thể được thay asset mà không thay domain state.

## Server

- Fastify xử lý REST, auth middleware và response code.
- WebSocket `ws` phát snapshot hiện tại và nhận command.
- Domain state hiện có in-memory store để chạy MVP không cần service phụ; khi có `DATABASE_URL`, snapshot được persist vào PostgreSQL.
- Redis rate-limit được dùng khi có `REDIS_URL`; local fallback chỉ dành cho development.
- Economy tick và season check chạy server-side; production sẽ tách worker theo kingdom/shard.

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
