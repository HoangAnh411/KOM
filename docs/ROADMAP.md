Kingdoms of Meridian — Tiến trình và Roadmap

> Cập nhật lần cuối: 2026-09-01

## Trạng thái hiện tại

**Phase 5, Phase 6 và auth/moderation baseline: hoàn thành local, PostgreSQL integration và browser E2E gate**

Đã xác nhận typecheck, build, unit/regression, PostgreSQL restart/multi-instance integration và Playwright desktop/mobile đều pass. Auth/session PostgreSQL, frozen moderation, world-event NPC, alliance vote và season archive đã có acceptance coverage.

### Đã hoàn thành

- [X] npm workspace, TypeScript strict và shared package.
- [X] PostgreSQL migration, Redis/Docker Compose và `.env.example`.
- [X] Dev auth/session, REST API và WebSocket gateway.
- [X] World map isometric, city, hero, army và caravan placeholder.
- [X] Economy tick, resources và `2 build queues + 1 research queue`.
- [X] Ownership, cost, idempotency, rate-limit và server-side validation.
- [X] Ba trục score, season weights, deterministic ranking và legacy scaffold.
- [X] Structured logging, `/metrics`, unit tests và GitHub Actions CI.
- [X] Bộ tài liệu dự án trong thư mục `docs/`.
- [X] `npm run typecheck` pass.
- [X] `npm test` pass: 73 test, 0 fail (12 PostgreSQL/Redis integration được tách riêng và đều pass với dịch vụ thật).
- [X] REST routes cho alliance/treaty.
- [X] Playwright E2E desktop/mobile: 10 scenario pass, gồm restore, moderation, alliance vote, mob migration và season archive.

### Còn thiếu để đóng Phase 1

- [X] Chạy `infra/migrations/001_initial.sql` trên PostgreSQL thật; đã tạo 34 bảng.
- [X] Restart server và xác nhận city/queue/score/caravan load lại từ PostgreSQL.
- [X] Browser E2E login → build → WebSocket update → reconnect.
- [X] Kiểm tra trực quan trên browser và mobile viewport.

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

- [X] Resource node theo region với depletion/recovery.
- [X] Depot, capacity, route distance và travel time.
- [X] Caravan cargo, hộ tống, delivery và ambush.
- [X] Supply, morale và attrition theo khoảng cách/thời gian.
- [X] Economy score từ throughput và resource hiếm.
- [X] Outbox/event ledger cho economy và caravan.
- [X] Integration tests cho delivery, ambush, retry và reconnect.

**Tiêu chí hoàn thành:** cắt tuyến có tác động kinh tế đo được; quân xa supply suy yếu; event log tái dựng được kết quả.

## Phase 3 — Combat chiến thuật

**Mục tiêu:** combat không quyết định chỉ bằng tiền hoặc tổng quân.

- [X] Infantry/cavalry/archer và counter matrix.
- [X] Terrain, formation, timing, morale và command cap.
- [X] Deterministic server-side battle simulation.
- [X] Battle report bất biến và anti-replay validation.
- [X] Military Score từ objective, territory và battle outcome.
- [X] Faction modifier làm thay đổi cách chơi, không bán power.
- [ ] Battle worker khi simulation cần scale độc lập.

**Tiêu chí hoàn thành:** cùng input/seed cho cùng report; terrain/counter/supply tạo khác biệt; client không sửa được kết quả.

## Phase 4 — Alliance và diplomacy

**Mục tiêu:** trục ngoại giao có quyền lực phân tán và audit được.

- [X] Alliance lifecycle, roles và contribution diminishing returns ở domain layer.
- [X] Treaty proposal, acceptance, expiry và violation ở domain layer.
- [X] Voting, term limits và audit log qua event ledger/outbox.
- [X] Diplomacy Score từ treaty objective, reputation và mediation.
- [ ] Chat, mail và moderation boundary — deferred Phase 7.
- [X] Permission matrix và duplicate/concurrent treaty guard (domain + unique DB index).

**Tiêu chí hoàn thành:** alliance có thể thắng bằng treaty/reputation; tiền không mua phiếu, role hoặc score.

## Phase 5 — Espionage và world events

**Mục tiêu:** thêm lớp thông tin, rủi ro và biến động bản đồ.

- [X] Spy missions với cost, duration, accuracy và cooldown ở server domain.
- [X] Sabotage, steal và counter-intelligence; misinformation còn thiếu.
- [X] Report access control theo actor và audit command; audit persistence đầy đủ còn thiếu.
- [X] Resource depletion theo node/vùng.
- [X] Thiên tai, dịch bệnh và di cư mob deterministic; NPC combat dùng shared resolver và audit seed/input/result.
- [X] Theo dõi faction win rate, spy success rate và ignored objectives theo season.

**Tiêu chí hoàn thành:** thông tin có giá trị và rủi ro; event tạo lựa chọn chứ không gây wipe không thể phục hồi.

## Phase 6 — Season production loop

**Mục tiêu:** season mở, kết thúc, snapshot, legacy và reset minh bạch.

- [X] `SCHEDULED → ACTIVE → FINALIZING → CLOSED`.
- [X] `40% military + 35% economy + 25% diplomacy`.
- [X] Deterministic tie-break.
- [X] Ranking/legacy scaffold.
- [X] Persist season snapshot/ranking/legacy ở bảng riêng.
- [X] PostgreSQL advisory lock và retry-safe finalization.
- [X] Versioned hard-reset template `v1_hard_reset`.
- [X] Cross-season player reputation cosmetic-only; alliance structure được giữ lại.
- [X] Historical buildings, season stats và authenticated season archive.
- [X] Admin early-close command có token permission và audit.

**Tiêu chí hoàn thành:** ranking không đổi sau chốt; reset đúng policy; legacy chỉ tạo danh tiếng/title/cosmetic.

## Phase 7 — Production hardening

**Mục tiêu:** sẵn sàng load test, vận hành và anti-cheat thực tế.

**Phase 7A Closed Beta Production Gate: baseline kỹ thuật hoàn thành; còn hai operational drill trước beta**

- [ ] PostgreSQL repository riêng cho từng domain (đã có repository theo domain, tổ chức tiếp ở 7B).
- [ ] Shard theo `kingdom_id`.
- [ ] Stateless WebSocket gateway, economy worker và battle worker (deferred 7B).
- [X] Redis Streams/outbox publisher: migration 012, claim SKIP LOCKED, retry exponential 1s→5m, DLQ sau 10 lỗi, envelope `{id,type,payload,createdAt}`, metrics backlog/age/latency/retry/DLQ.
- [X] Migration runner: advisory lock, `schema_migrations` + checksum, transaction từng file, `db:migrate` / `db:migrate:check` / `db:migrate:baseline` / `test:postgres`.
- [X] Env validation bằng Zod + production gate (AUTH_MODE=password, PG/Redis, token ≥32 ký tự, CLIENT_ORIGIN HTTPS).
- [X] Security baseline: headers, body limit 64 KB, request timeout, trustProxy, exact Origin trên refresh/logout, `/health` + `/health/live` + `/health/ready` (PG/Redis ping + tick lag ≤3 cycles), `/metrics` bảo vệ bằng METRICS_TOKEN, graceful shutdown SIGTERM/SIGINT (WS 1012).
- [X] Production compose: game + outbox worker + PG/Redis + Caddy (TLS, proxy `/api` `/ws`), profile Prometheus/Grafana, secrets qua `.env.prod`.
- [X] Backup (`pg_dump` daily/7 + weekly/4, checksum, log) và restore drill script; drill trước beta + mỗi tháng.
- [X] Prometheus/Grafana dashboard và alert rules cho health, tick, WebSocket, persistence, outbox và DLQ; OpenTelemetry traces deferred 7B.
- [X] Load-test harness k6: 100 WS 15 phút, 10 cmd/s, reconnect burst, duplicate commandId; seed/verify CLI chỉ nhận DB hậu tố `_loadtest`.
- [ ] Chạy full load test 15 phút và lưu report trước beta.
- [X] Ban/unban baseline, atomic audit/session revoke, frozen entities và action guards; abuse detection nâng cao còn deferred.
- [X] CI thành 8 gates: `npm ci` → migrate fresh → idempotency+checksum → typecheck/build → PostgreSQL integration → unit/regression → Playwright desktop/mobile → `git diff --check`.
- [ ] Restore drill log trong operations runbook (trước beta).
- [ ] Security review auth, permissions, input và secrets.

**Tiêu chí hoàn thành:** có SLO, load profile, alert và recovery khi worker/gateway restart.

## Phase 7B — Web Playable Alpha, local-first

**Mục tiêu:** bản alpha chơi được trên web với toàn bộ gameplay loop trong một tiến trình local, giữ gate chất lượng như production.

- [X] Migration 013 + `gameRules` catalog chia sẻ (building/recruit/supply/market/placement).
- [X] Thị trường (Thương cảng Meridian), đặt thành phố có kiểm tra khoảng cách, vùng tiếp tế (supply zones) theo depot.
- [X] Raider NPC engine (săn quân người chơi, respawn, không nhắm mob).
- [X] Truy đuổi lệnh tấn công (attack order + seed) và `cancel-army-order`.
- [X] Onboarding 8 bước có kiểm chứng server-side, persisted qua `player_onboarding`; 2 bước ack từ client.
- [X] Client refactor: snapshot như state duy nhất, API command → snapshot sink, WebSocket reconnect có backoff + close 4401 xử lý token.
- [X] PixiJS map tương tác: zoom neo con trỏ, pan, focus city; vẽ market/city/army/raider/mob/pursuit.
- [X] UI kinh tế & logistics: khai thác, tuyến route, cargo editor, caravan + hộ tống, facility build queue.
- [X] UI quân đội & combat: tuyển quân (bước 10), đội hình, tấn công confirm, hủy lệnh, battle report modal.
- [X] Onboarding checklist “Đi tới” + drawer nâng cao (alliance vote, spy labels, season archive); không có chat/mail.
- [X] DX: `npm run dev:web` một lệnh cho server+client, unit test client (error map), 3 spec e2e mới (economy/army/onboarding), README 2 chế độ chạy.

**Tiêu chí hoàn thành:** typecheck/build/test/test:postgres/test:e2e xanh; alpha web chơi được end-to-end trong một local process.

### Đợt rà soát 2026-09-01 — sửa 8 lỗi gameplay (chưa đánh dấu Phase 7B hoàn thành)

- [X] Chi phí tuyển quân đồng bộ client/server: `recruitmentCost()` chia sẻ ở `packages/shared` (giá theo lô 10, hết 10×);
- [X] Route UI mặc định Thương cảng, ẩn điểm đến thành phố (server chỉ cho route tới thành phố của chính mình);
- [X] Vẽ caravan đi chợ trên map (destinationMarketId);
- [X] Raider respawn tôn trọng cooldown khi restart: `seed()` không top-up giữa cooldown, tick không có bản ghi chỉ giương timer;
- [X] Battle người chơi truy đuổi raider ghi ledger `combat.resolved` (điều kiện playerId bên attacker HOẶC defender);
- [X] Supply catch-up chỉ trừ attrition đúng số phút dưới ngưỡng 25, không trừ cả khoảng offline;
- [X] Mọi command endpoint/HTTP trả về `CommandResponse` chia sẻ `{ commandId, result, acceptedAt, snapshot, data }`; client dùng chung contract;
- [X] Map chọn entity + lệnh trực tiếp (di chuyển/tấn công/hợp nhất qua inspector), thay toàn bộ `prompt()` trong HUD bằng form nhập liệu.

**Regression/E2E mới:** contract test trên REST, test ledger pursuit, raider cooldown ×2, supply catch-up, `map-command.spec.ts`, route-creator single select trong `economy.spec.ts`; `production-loop.spec.ts`/`reset.spec.ts` đọc `PLAYWRIGHT_API` và khớp contract `data.*`; client `apiBase` ưu tiên `VITE_API_URL` (bỏ override cứng tới port 3000).

### Đợt rà soát 2026-09-01 — sửa 4 lỗi command/rollback/raider (chưa đánh dấu Phase 7B hoàn thành)

- [X] `cancel-army-order` hủy cả lệnh di chuyển manual (`army.targetX/targetY`), không chỉ attack order; inspector “Hủy lệnh” đồng bộ;
- [X] Mọi nhánh từ chối sớm của command endpoint (unauthenticated 401, banned 403, rate-limit 429) trả đủ `CommandResponse` `{ commandId, result: "rejected", code }` — thay vì chỉ `{ code }`;
- [X] Rollback transaction khôi phục cả nội bộ `CombatRepository.commands` và `OnboardingRepository.commands/progress` (capture/restore giống logistics/espionage) ở cả nhánh in-memory lẫn PostgreSQL; retry cùng `commandId` sau persist fail được xử lý lại;
- [X] Raider respawn timer chỉ chạy khi band thiếu quân: tick xóa `nextRespawnAt` cũ khi đủ target, chỉ giương cooldown khi lần đầu phát hiện thiếu và xóa khi đã đủ lại — không còn spawn tức thì sau khi chết với timestamp hết hạn.

**Regression/E2E mới:** cancel-manual-move trong `combat.test.ts`; contract 401/403/429 trong `app.test.ts`; rollback giải phóng claim combat/onboarding trong `store.test.ts` (in-memory) và `postgres.integration.test.ts` (persist fail mô phỏng qua pool, retry thành công, chi phí trừ đúng một lần); stale expired respawn timer trong `raiders.test.ts`.

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

- [X] Không bán tướng, quân, tech, resource chiến đấu hoặc score.
- [X] Không bán speed-up tạo power kinh tế.
- [X] Queue baseline công bằng.
- [ ] Cosmetic catalog và versioned item definitions.
- [ ] Battle pass chỉ cosmetic/title.
- [ ] Test shop item không có power modifier.
- [ ] Audit review trước mỗi thay đổi monetization.

## Asset roadmap

- [X] `assets/heroes/`, `units/`, `buildings/`, `icons/`.
- [X] License policy trong `assets/CREDITS.md`.
- [X] PixiJS Graphics placeholder.
- [ ] Chọn pack cụ thể từ nguồn có license rõ ràng.
- [ ] Ghi URL, tác giả, license và version cho từng file.
- [ ] Art style guide cho hero/unit/building/icon.
- [ ] AI portrait concept sau khi có art direction.
- [ ] Blender low-poly pipeline nếu 2D không đủ readability.

## Bước tiếp theo

1. Hoàn thiện misinformation của espionage.
2. Phase 7: chat/mail moderation, battle worker và Redis outbox publisher.
3. Bổ sung load test WebSocket/tick/queue/caravan và backup/restore runbook.
4. Giữ các gate regression: `npm run typecheck`, `npm run build`, `npm test`, Playwright desktop/mobile và PostgreSQL migrations.

## Quy tắc cập nhật

Sau mỗi feature/bugfix, cập nhật checkbox, trạng thái, test đã chạy và tài liệu domain liên quan. Không đánh dấu hoàn thành nếu chưa đạt tiêu chí nghiệm thu của phase.
