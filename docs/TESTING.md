# Kiểm thử và Definition of Done

## Commands

```powershell
npm run typecheck
npm run build
npm test
```

CI chạy các lệnh trên trong `.github/workflows/ci.yml` cùng PostgreSQL và Redis service containers.

## Test layers

- Shared unit: season weights, Zod schema và protocol shape.
- Domain unit: economy tick, queue limits, cost, ownership, idempotency và season finalization.
- Infrastructure integration: PostgreSQL migration, load/save, Redis rate-limit và outbox.
- Transport integration: REST auth/bootstrap/build, status codes và WebSocket snapshot.
- Browser E2E: login → map → build → server update → reconnect.
- Load/security: command spam, malformed payload, replayed command, unauthorized entity và multi-instance season lock.

## Acceptance criteria MVP

- Hai tab thấy cùng kingdom, city, hero, army và caravan.
- Server từ chối thay đổi resource, cost, score hoặc kết quả bằng payload client.
- Mỗi city có tối đa hai build queues và một research queue.
- Build command ghi nhận đúng ownership, cost và completion.
- Reconnect không mất snapshot khi PostgreSQL đã bật.
- Rate-limit trả `429` hoặc WebSocket `RATE_LIMITED`.
- Season score deterministic và finalization tạo ranking/legacy record.
- CI pass typecheck, build, unit tests và migration checks.

## Definition of Done

Một task chỉ được đánh dấu xong khi:

1. Domain rule có test phù hợp.
2. API/protocol/schema docs đã cập nhật nếu cần.
3. Không có logic authoritative mới đặt trong client.
4. `npm run typecheck`, `npm run build` và `npm test` đều pass.
5. Roadmap được cập nhật ở `docs/ROADMAP.md`.
