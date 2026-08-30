# Kingdoms of Meridian — Tiến trình và Roadmap

> Cập nhật lần cuối: 2026-08-29

## Trạng thái hiện tại

**Phase 2 — Economy và logistics: hoàn thành local gate**

Đã chạy được vòng end-to-end local: dev account → world snapshot → PixiJS map → build command → server validation → economy/caravan tick → WebSocket update.

### Đã hoàn thành

- [x] npm workspace, TypeScript strict và shared package.
- [x] PostgreSQL migration, Redis/Docker Compose và `.env.example`.
- [x] Dev auth/session, REST API và WebSocket gateway.
- [x] World map isometric, city, hero, army và caravan placeholder.
- [x] Economy tick, resources và `2 build queues + 1 research queue`.
- [x] Ownership, cost, idempotency, rate-limit và server-side validation.
- [x] Ba trục score, season weights, deterministic ranking và legacy scaffold.
- [x] Structured logging, `/metrics`, unit tests và GitHub Actions CI.
- [x] Bộ tài liệu dự án trong thư mục `docs/`.

### Còn thiếu để đóng Phase 1

- [x] Chạy `infra/migrations/001_initial.sql` trên PostgreSQL thật; đã tạo 34 bảng.
- [x] Restart server và xác nhận city/queue/score/caravan load lại từ PostgreSQL.
- [x] Browser E2E login → build → WebSocket update → reconnect.
- [x] Kiểm tra trực quan trên browser và mobile viewport.

## Phase 1 — MVP vertical slice

**Mục tiêu:** hai người chơi cùng kingdom, nhìn thấy entity của nhau, xây dựng được và state survive restart.

**Tiêu chí hoàn thành:** PostgreSQL persistence đã kiểm chứng; command giả mạo/spam bị từ chối; CI xanh; hai tab nhận cùng snapshot.

## Phase 2 — Economy và logistics thật: hoàn thành local gate

### Thứ tự milestone đã chốt

1. Phase 2A.1: relational resource nodes, depletion/recovery, depots, routes, caravans.
2. Phase 2A.2: atomic command persistence, durable idempotency, delivery/throughput acceptance.
3. Phase 2B.1: outbox/event ledger.
4. Phase 2B.2: resource recovery.
5. Phase 2B.3: escort/ambush; ambush seed phải được lưu trong event record.
6. Phase 2B.4: army supply.
7. Phase 2B.5: economy score.
8. Phase 2B.6: integration/E2E.

Sau mỗi milestone phải chạy verification và cập nhật docs/GAME-DESIGN.md nếu thêm hoặc đổi công thức/luật gameplay.

**Mục tiêu:** logistics là gameplay trung tâm thay vì marker placeholder.

- [x] Resource node theo region với depletion/recovery.
- [x] Depot, capacity, route distance và travel time.
- [x] Caravan cargo, hộ tống, delivery và ambush.
- [x] Supply, morale và attrition theo khoảng cách/thời gian.
- [x] Economy score từ throughput và resource hiếm.
- [x] Outbox/event ledger cho economy và caravan.
- [x] Integration tests cho delivery, ambush, retry và reconnect.

**Tiêu chí hoàn thành:** cắt tuyến có tác động kinh tế đo được; quân xa supply suy yếu; event log tái dựng được kết quả.

## Phase 3 — Combat chiến thuật

**Mục tiêu:** combat không quyết định chỉ bằng tiền hoặc tổng quân.

- [ ] Infantry/cavalry/archer và counter matrix.
- [ ] Terrain, formation, timing, morale và command cap.
- [ ] Deterministic server-side battle simulation.
- [ ] Battle report bất biến và anti-replay validation.
- [x] Military Score từ objective, territory và battle outcome.
- [ ] Faction modifier làm thay đổi cách chơi, không bán power.
- [ ] Battle worker khi simulation cần scale độc lập.

**Tiêu chí hoàn thành:** cùng input/seed cho cùng report; terrain/counter/supply tạo khác biệt; client không sửa được kết quả.

## Phase 4 — Alliance và diplomacy

**Mục tiêu:** trục ngoại giao có quyền lực phân tán và audit được.

- [ ] Alliance lifecycle, roles và contribution diminishing returns.
- [ ] Treaty proposal, acceptance, expiry và violation.
- [ ] Voting, term limits và audit log.
- [x] Diplomacy Score từ treaty objective, reputation và mediation.
- [ ] Chat, mail và moderation boundary.
- [ ] Permission matrix và concurrent treaty tests.

**Tiêu chí hoàn thành:** alliance có thể thắng bằng treaty/reputation; tiền không mua phiếu, role hoặc score.

## Phase 5 — Espionage và world events

**Mục tiêu:** thêm lớp thông tin, rủi ro và biến động bản đồ.

- [ ] Spy missions với cost, duration, accuracy và cooldown.
- [ ] Sabotage, misinformation và counter-intelligence.
- [ ] Report access control và audit event.
- [ ] Resource depletion theo vùng.
- [ ] Thiên tai, dịch bệnh và di cư mob.
- [ ] Theo dõi faction win rate, spy success rate và ignored objectives.

**Tiêu chí hoàn thành:** thông tin có giá trị và rủi ro; event tạo lựa chọn chứ không gây wipe không thể phục hồi.

## Phase 6 — Season production loop

**Mục tiêu:** season mở, kết thúc, snapshot, legacy và reset minh bạch.

- [x] `SCHEDULED → ACTIVE → FINALIZING → CLOSED`.
- [x] `40% military + 35% economy + 25% diplomacy`.
- [x] Deterministic tie-break.
- [x] Ranking/legacy scaffold.
- [ ] Persist season snapshot/ranking/legacy ở bảng riêng.
- [ ] Distributed lock và retry-safe finalization.
- [ ] Versioned next-season reset template.
- [ ] Kingdom/player/alliance reputation xuyên mùa.
- [ ] Historical buildings và public season archive.
- [ ] Admin early-close command có permission và audit.

**Tiêu chí hoàn thành:** ranking không đổi sau chốt; reset đúng policy; legacy chỉ tạo danh tiếng/title/cosmetic.

## Phase 7 — Production hardening

**Mục tiêu:** sẵn sàng load test, vận hành và anti-cheat thực tế.

- [ ] PostgreSQL repository riêng cho từng domain.
- [ ] Shard theo `kingdom_id`.
- [ ] Stateless WebSocket gateway, economy worker và battle worker.
- [ ] Redis Streams/outbox publisher.
- [ ] OpenTelemetry traces và dashboard metrics.
- [ ] Load test WebSocket, tick, queue và caravan.
- [ ] Abuse detection, ban/audit workflow.
- [ ] Backup/restore, migration rollback và disaster recovery runbook.
- [ ] Security review auth, permissions, input và secrets.

**Tiêu chí hoàn thành:** có SLO, load profile, alert và recovery khi worker/gateway restart.

## Phase 8 — Đa nền tảng và phát hành

**Mục tiêu:** một gameplay codebase cho web, mobile và desktop.

- [ ] PWA service worker và offline shell.
- [ ] Capacitor iOS/Android shell.
- [ ] Tauri desktop shell.
- [ ] Touch controls, safe area và viewport nhỏ.
- [ ] Texture/asset optimization và bundle splitting.
- [ ] Crash reporting, versioned client protocol và update strategy.
- [ ] Store/privacy policy/terms cho từng nền tảng.

**Tiêu chí hoàn thành:** cùng protocol chạy ổn trên ba target; không tạo gameplay logic riêng ở client.

## Monetization guardrails

- [x] Không bán tướng, quân, tech, resource chiến đấu hoặc score.
- [x] Không bán speed-up tạo power kinh tế.
- [x] Queue baseline công bằng.
- [ ] Cosmetic catalog và versioned item definitions.
- [ ] Battle pass chỉ cosmetic/title.
- [ ] Test shop item không có power modifier.
- [ ] Audit review trước mỗi thay đổi monetization.

## Asset roadmap

- [x] `assets/heroes/`, `units/`, `buildings/`, `icons/`.
- [x] License policy trong `assets/CREDITS.md`.
- [x] PixiJS Graphics placeholder.
- [ ] Chọn pack cụ thể từ nguồn có license rõ ràng.
- [ ] Ghi URL, tác giả, license và version cho từng file.
- [ ] Art style guide cho hero/unit/building/icon.
- [ ] AI portrait concept sau khi có art direction.
- [ ] Blender low-poly pipeline nếu 2D không đủ readability.

## Bước tiếp theo

1. Chốt release branch cho Phase 2.
2. Bắt đầu Phase 3: combat tactical.
3. Giữ các gate regression: `npm run build`, `npm test`, Playwright desktop/mobile và PostgreSQL migrations.
## Quy tắc cập nhật

Sau mỗi feature/bugfix, cập nhật checkbox, trạng thái, test đã chạy và tài liệu domain liên quan. Không đánh dấu hoàn thành nếu chưa đạt tiêu chí nghiệm thu của phase.

