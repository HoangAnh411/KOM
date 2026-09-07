Kingdoms of Meridian — Tiến trình và Roadmap

## World 3D v2 — triển khai 2026-09-05

- [X] Chuyển runtime world map từ Pixi placeholder sang Three.js orthographic isometric; pan, wheel/pinch zoom và click selection.
- [X] World 256×256, seed/anchor/seat scale đồng bộ, server và client vẫn dùng chung terrain/tỉnh.
- [X] Terrain thật ở `assets/world3d/meridian-256-v2/terrain-lod0.glb`; thành, cây, đá, chợ, caravan và quân dùng GLB CC0 Kenney. Manifest semantic cho phép thay asset sau mà không đổi gameplay/save ID.
- [X] Bốn silhouette thành theo faction; thành chưa biết không lộ faction, tên hay owner.
- [X] Fog khám phá vĩnh viễn trong season bằng bitmask compact; quân địch chưa khám phá bị lọc server-side.
- [X] Scout report là snapshot có timestamp/accuracy, không phải cửa hậu đọc state live.
- [X] Click thành chỉ mở thông tin; **Vào thành** hoặc wheel/pinch zoom sâu trên thành mình để vào. Zoom ra quay về world, giữ camera; không tự thoát khi đang đặt/sửa building và không vào thành nước ngoài.
- [X] Protocol v4 có `world` + `exploration`; season mới lưu `worldId`. Migration 016 ghi phiên bản trong SQL. Server từ chối save khác phiên bản trước khi nạp tọa độ; không tự chuyển save 36×36.
- [ ] Cutover database 36×36 đang chạy sang mùa 256×256: cần quy trình migration riêng. Bản hiện tại dùng database mới; database cũ tiếp tục dùng release v1.
- [ ] Asset cuối do art team thay bộ CC0 tạm; thêm LOD/chunk streaming thật và GPU/mobile profiling trước beta.

> Cập nhật lần cuối: 2026-09-03

## Trạng thái hiện tại

**Phase 5, Phase 6, Phase 7A và Phase 7B (Web Playable Alpha, đóng ngày 2026-09-01): hoàn thành local + PostgreSQL integration + browser E2E gate. Phase 7C: toàn bộ mục automated đã xanh, còn đúng một mục manual acceptance (mục cuối của Phase 7C bên dưới). Phase 7D — production/beta hardening — đã landing ở `f6085a4` (2026-09-02).**

Đã xác nhận typecheck, build, unit/regression, PostgreSQL restart/multi-instance integration và Playwright đều pass. Từ 7C suite Playwright là Chromium desktop (project `mobile` đã bỏ; `password-auth` gated `E2E_PROD_SMOKE=1`) — xem mục “Test matrix” của Phase 7C. Auth/session PostgreSQL, frozen moderation, world-event NPC, alliance vote và season archive đã có acceptance coverage.

Roadmap này có section Phase 7D bên dưới (viết sau khi đọc lại code, vì `f6085a4` không sửa roadmap). `verify:web-beta` (`npm audit --audit-level=high` + `test:prod-smoke`) và `drill:web-beta` đã được nối vào `.github/workflows/ci.yml`: `npm audit` thành gate 10 của job `verify`, còn hai việc cần Docker tách ra hai job riêng (`prod-smoke`, `recovery-drill`). Hai job đó **đã xanh lần đầu ngày 2026-09-03** trên run `33707793916` (`workflow_dispatch`, ref `perf/command-path`) — máy contributor không có Docker nên CI là chỗ duy nhất quan sát được.

**Toàn bộ công việc sau `f6085a4` đang nằm ở bảy PR chưa merge** (2026-09-03): #1 `feat/situation-room` (shell Situation Room, base `main`) → #2 `docs/truth-pass` → #3 `feat/rate-limit-buckets` (P0.1 + security review) → #5 `perf/command-path` (S-5 + P0.2 + P0.3) → #6 `feat/hud-overhaul` (cải tổ HUD vòng 2, 8 commit) → #7 `feat/espionage-misinformation` (C.1), cộng #4 `fix/postgres-test-isolation` (base `main`) sửa race làm gate 5 đỏ ngẫu nhiên. `main` vẫn đứng ở `f6085a4`. PR #5 là PR đầu tiên có **cả 10 gate xanh** (run `33707700712`), PR #6 cũng 10/10 (run `33759437598`) — nhưng gate 5 và 7 đỏ *ngẫu nhiên*, nên một lần xanh không phải bằng chứng race đã hết; PR #4 vẫn là bản sửa thật của gate 5. Gate 7 (Playwright, `map-command.spec.ts` chọn phải NPC `mob_migration` cùng ô) **đã có bản sửa** ở `1d9acc1` trong PR #6: nguyên nhân là `pickAt()` để thứ tự `snapshot.armies` phân xử thế hoà khoảng cách, nên khi mob đứng cùng ô thì quân của chính người chơi không chọn được — spec không đổi một dòng.

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
- [X] Sabotage, steal, counter-intelligence và misinformation (cắm lên một đối thủ, bóp méo scout report của họ về ta trong 20 phút).
- [X] Report access control theo actor và audit command; mission resolve ghi `spy.<missionType>.<status>` và `spy.misinformation.consumed` vào event ledger.
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
- [X] Security baseline: headers, body limit 64 KB, request timeout, trustProxy, exact Origin trên refresh/logout, `/health` + `/health/live` + `/health/ready` (PG/Redis ping + tick lag ≤3 cycles), `/metrics` bảo vệ bằng METRICS_TOKEN, graceful shutdown SIGTERM/SIGINT (WS 1012). — `TRUST_PROXY` từ security review giờ là **số hop** chứ không phải boolean (`"true"` vẫn nhận, nghĩa là 1 hop); xem S-1 trong `docs/SECURITY-REVIEW.md`.
- [X] Production compose: game + outbox worker + PG/Redis + Caddy (TLS, proxy `/api` `/ws`), profile Prometheus/Grafana, secrets qua `.env.prod`.
- [X] Backup (`pg_dump` daily/7 + weekly/4, checksum, log) và restore drill script; drill trước beta + mỗi tháng.
- [X] Prometheus/Grafana dashboard và alert rules cho health, tick, WebSocket, persistence, outbox và DLQ; OpenTelemetry traces deferred 7B.
- [X] Load-test harness k6: 100 WS 15 phút, 10 cmd/s, reconnect burst, duplicate commandId; seed/verify CLI chỉ nhận DB hậu tố `_loadtest`.
- [ ] Chạy full load test 15 phút và lưu report trước beta. — command path đã hết chi phí tuyến tính theo lịch sử season (P0.2 + P0.3 xong) và sức chứa map đã mở (P0.4 xong: **135 ô** đặt thành phố, đo được, so với 14 trước đó — dư cho profile 120 người), nên còn **một** thứ chặn: `k6` chưa cài ở máy contributor. Xem section "Command path và sức chứa" bên dưới.
- [X] Ban/unban baseline, atomic audit/session revoke, frozen entities và action guards; abuse detection nâng cao còn deferred.
- [X] CI thành 10 gates: `npm ci` → migrate fresh → idempotency+checksum → typecheck/build → PostgreSQL integration → unit/regression → Playwright Chromium desktop (7C) → `check:bundle` → `git diff --check` → `npm audit --audit-level=high`. Hai việc cần Docker (`test:prod-smoke`, `drill:web-beta`) là job riêng — xem Phase 7D.
- [X] Restore drill log trong operations runbook (trước beta). — chạy 2026-09-02 qua `drill:web-beta`: 3/3 pass, RPO 0 ms, RTO 5795 ms; kết quả ở mục "Kết quả drill" của `docs/OPERATIONS.md`, báo cáo đầy đủ ở `infra/backup/drill-report.md`. Caveat đã ghi trong runbook: drill dùng `docker compose exec postgres pg_dump`, nên `infra/backup/backup.sh` / `restore.sh` vẫn chưa được kiểm chứng.
- [X] Security review auth, permissions, input và secrets. — `docs/SECURITY-REVIEW.md` (2026-09-02): 10 finding, 2 High đã sửa kèm test hồi quy (`request.ip` do client tự khai làm vô hiệu mọi hạn mức theo IP; snapshot phát nội thất city của mọi người chơi), 1 Low hardening (redact `password`). **S-5 (`ambush` không có tiền đề không gian) đã được owner chốt 2026-09-03 và đã sửa xong**: đòi người tấn công có quân còn sống trong bán kính Manhattan 3 quanh vị trí caravan hiện tại, và `ambush` chuyển sang bucket `combat` (10/phút) — xem section "Command path và sức chứa" bên dưới. Hai việc còn treo cho owner: có bắt buộc `TRUST_PROXY` ở production hay không (S-9), và xác nhận lại chuỗi Caddy → Fastify trên stack thật (S-1, máy contributor không có Docker); thêm S-7 (Zod cho hai route admin) và S-8 (trần WS connection) chờ gộp/chốt số.

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

### Đợt rà soát 2026-09-01 — sửa 8 lỗi gameplay (đã hoàn thành; Phase 7B đóng ngày 2026-09-01)

- [X] Chi phí tuyển quân đồng bộ client/server: `recruitmentCost()` chia sẻ ở `packages/shared` (giá theo lô 10, hết 10×);
- [X] Route UI mặc định Thương cảng, ẩn điểm đến thành phố (server chỉ cho route tới thành phố của chính mình);
- [X] Vẽ caravan đi chợ trên map (destinationMarketId);
- [X] Raider respawn tôn trọng cooldown khi restart: `seed()` không top-up giữa cooldown, tick không có bản ghi chỉ giương timer;
- [X] Battle người chơi truy đuổi raider ghi ledger `combat.resolved` (điều kiện playerId bên attacker HOẶC defender);
- [X] Supply catch-up chỉ trừ attrition đúng số phút dưới ngưỡng 25, không trừ cả khoảng offline;
- [X] Mọi command endpoint/HTTP trả về `CommandResponse` chia sẻ `{ commandId, result, acceptedAt, snapshot, data }`; client dùng chung contract;
- [X] Map chọn entity + lệnh trực tiếp (di chuyển/tấn công/hợp nhất qua inspector), thay toàn bộ `prompt()` trong HUD bằng form nhập liệu.

**Regression/E2E mới:** contract test trên REST, test ledger pursuit, raider cooldown ×2, supply catch-up, `map-command.spec.ts`, route-creator single select trong `economy.spec.ts`; `production-loop.spec.ts`/`reset.spec.ts` đọc `PLAYWRIGHT_API` và khớp contract `data.*`; client `apiBase` ưu tiên `VITE_API_URL` (bỏ override cứng tới port 3000).

### Đợt rà soát 2026-09-01 — sửa 4 lỗi command/rollback/raider (đã hoàn thành; Phase 7B đóng ngày 2026-09-01)

- [X] `cancel-army-order` hủy cả lệnh di chuyển manual (`army.targetX/targetY`), không chỉ attack order; inspector “Hủy lệnh” đồng bộ;
- [X] Mọi nhánh từ chối sớm của command endpoint (unauthenticated 401, banned 403, rate-limit 429) trả đủ `CommandResponse` `{ commandId, result: "rejected", code }` — thay vì chỉ `{ code }`;
- [X] Rollback transaction khôi phục cả nội bộ `CombatRepository.commands` và `OnboardingRepository.commands/progress` (capture/restore giống logistics/espionage) ở cả nhánh in-memory lẫn PostgreSQL; retry cùng `commandId` sau persist fail được xử lý lại;
- [X] Raider respawn timer chỉ chạy khi band thiếu quân: tick xóa `nextRespawnAt` cũ khi đủ target, chỉ giương cooldown khi lần đầu phát hiện thiếu và xóa khi đã đủ lại — không còn spawn tức thì sau khi chết với timestamp hết hạn.

**Regression/E2E mới:** cancel-manual-move trong `combat.test.ts`; contract 401/403/429 trong `app.test.ts`; rollback giải phóng claim combat/onboarding trong `store.test.ts` (in-memory) và `postgres.integration.test.ts` (persist fail mô phỏng qua pool, retry thành công, chi phí trừ đúng một lần); stale expired respawn timer trong `raiders.test.ts`.

## Phase 7C — Web Closed Alpha, desktop polish

**Mục tiêu:** bản alpha web khép kín trên desktop: shell HUD kiểu game, command pipeline chống mất lệnh, validation trước khi gửi, map Pixi theo lớp, protocol versioning và battle history phân trang.

- [X] Desktop shell: top bar 56px (tài nguyên/score/đếm ngược mùa/connection pill), nav rail 64px, map trung tâm, context panel 360px, action bar 72px; dưới 1024px hiện thông báo “viewport desktop chưa được hỗ trợ”. — **superseded**: shell này (và cả thông báo “viewport desktop chưa được hỗ trợ”) không còn trong code. Hiện tại là Situation Room: `apps/client/src/layout.ts` có 3 band (`compact` <1024px, `medium` ≥1024px, `wide` ≥1440px), map luôn mounted và giữ một track chính, hai column (kingdom/activity) collapse được — ở band `compact` chúng thành flyout loại trừ nhau thay vì chặn viewport. **Cập nhật 2026-09-03:** vòng 1 của shell này tự để lại **hai slot rỗng có nhãn** (cột hoạt động là skeleton `aria-hidden`, nửa phải command tray là hộp trống còn bị `display: none` dưới 1024px) cộng một rule bridge CSS chờ cột được lắp hết từ panel. Cả ba đã đóng ở vòng 2 — xem mục [Cải tổ HUD](#cải-tổ-hud--situation-room-vòng-2) bên dưới.
- [X] GameProvider: selection/interaction/active panel/connection/pending commands; `runCommand` với commandId client-mint, dedupe trùng lệnh đang bay dùng chung Promise/kết quả thật, timeout 10s → “uncertain” + nút “Thử lại” tái dùng cùng id và chặn double-retry, pending lưu sessionStorage theo player, logout xoá.
- [X] Toasts tự đóng sau 4s và không chặn pointer (không đè lên UI để click). — **2026-09-03**: thân toast vẫn `pointer-events: none` đúng như dòng này yêu cầu, nhưng `pointer-events: auto` giờ được bật lại **chỉ trên nút đóng**, vì `onClick` cũ đặt trên thân là code không bao giờ chạy được. Layer thành `role="status"` + `aria-live="polite"`, Escape đóng cái mới nhất.
- [X] Validation trước khi gửi: logistics (cargo ≤ sức chứa depot, cargo ≤ kho, harvest ≤ còn lại, route/depot hợp lệ) và action bar (ownership, frozen, strength, tile, unit type, merge ≤ 500).
- [X] Pixi map theo layer với `Map<entityId, DisplayObject>`; terrain rebuild chỉ khi kingdom/terrain đổi; `setInteraction()` chuyển chế độ; pan/zoom giữ nguyên; dynamic import sau login; mọi chunk ≤ 500 KiB.
- [X] `protocolVersion: 1` trong snapshot: client khoá lệnh + băng cảnh báo khi lệch version.
- [X] Battle report: snapshot chỉ gửi 20 bản mới nhất mỗi viewer; `BATTLE_REPORT` live chỉ cho participant; `ATTACK_CANCELED` chỉ cho owner.
- [X] `GET /api/battles` keyset pagination (limit mặc định 20, clamp 1–50, cursor base64url `{createdAt,id}` với ISO timestamp + UUID strict, chỉ thấy trận mình tham gia); migration 014 partial index cho attacker/defender.
- [X] Phá hiệp ước bằng modal React có focus trap + Escape + mô tả “−150 danh tiếng”, thay cho `confirm()` native.
- [X] Drawer nâng cao (alliance/espionage/events/archive/diplomacy) lazy-load khi mở lần đầu.
- [X] Test matrix: shared unit **20**, client unit **157**, server unit **160** (145 pass + 15 skip vì gate PostgreSQL; +8 của C.1 misinformation, +2 của `1d9acc1` là client (146 → 148), và vòng thiết kế lại bản đồ (P0.4 → M-6) đưa shared từ 3 lên **20** — `map-size.test.ts` giữ một nguồn sự thật cho kích thước, `world-map.test.ts` giữ bất biến của thế giới vẽ tay, `index.test.ts` giữ thang điểm lãnh thổ và version gate — cộng client 148 → **157** (trần texture 4096, sàn zoom thành hàm của extent, `terrainSig` theo digest, `seatSig` ba màu, gate tên tỉnh, và ô lỵ sở trong tray) và server 151 → **160** (mỏ trả đúng tỉnh, thành phố phân bố theo tỉnh, `territory.test.ts` thuần cho luật chiếm vùng)), PostgreSQL (015 fresh/rerun/checksum + `/api/battles` dùng index + phân trang + cursor invalid + sống sót restart; chỉ bật integration bằng `RUN_POSTGRES_INTEGRATION` trong runner để gate chạy lặp an toàn), Playwright **29 test / 15 file** = 10 gốc + 1 `[reset-world]` setup + 5 regression 7C + 3 layout Situation Room + 9 của vòng cải tổ HUD (2 activity feed, 2 command tray, 2 HUD gate, 3 chrome/a11y) + **1 của M-6** (`territory.spec.ts`: đóng quân lên ô lỵ sở → **một** hàng feed sống qua stream, ô bên cạnh nói ai giữ, hàng feed nhảy đúng panel); `password-auth` là project riêng, chỉ chạy khi `E2E_PROD_SMOKE=1` (nên **không** nằm trong 29 ở trên). Năm regression 7C (double-submit dedupe không gửi HTTP thứ hai và nhận cùng kết quả thật, send fail → uncertain + “Thử lại” tái dùng cùng commandId/chặn double-retry, reload khôi phục pending uncertain, battle report chỉ tới participant, treaty modal focus trap/Escape/−150) + reset ở setup project và trước mỗi Chromium scenario (world riêng cho mỗi scenario để test không thấy thành phố của nhau — lý do ban đầu là trần ~16 ô đặt thành phố, sau P0.4 trần là 135 nên chỉ còn lại việc cô lập, battle E2E dùng target dev có xác thực và vị trí deterministic để không phụ thuộc mob tự di chuyển/hết hạn, config env-driven `PLAYWRIGHT_API`/`PLAYWRIGHT_WEB`, webServer bật máy chủ riêng trên port do `PLAYWRIGHT_API` chỉ định), `check:bundle` ≤ 500 KiB, CI gate 8 chuyên cho bundle.
- [ ] Manual acceptance: onboarding walkthrough, phiên 30–60 phút, không raw ID / native prompt/confirm, không jank. — kịch bản phiên ở [`docs/ACCEPTANCE-7C.md`](./ACCEPTANCE-7C.md); phần "không còn `prompt(`/`confirm(`/`alert(` trong source" đã được `apps/client/src/no-native-dialogs.test.ts` chặn tự động. Còn lại là phiên do người chạy, nên mục này chưa tick.

**Tiêu chí hoàn thành:** toàn bộ automated gate xanh (`verify:web-alpha` = typecheck/build/test/test:postgres/test:e2e/check:bundle/diff-check) và phiên manual không có blocker.

## Phase 7D — Production/Beta hardening

**Mục tiêu:** đưa stack production thật vào vòng kiểm chứng tự động — dựng đúng compose prod để test, chứng minh khôi phục được sau sự cố, và bịt các lỗ hổng vận hành mà alpha local không nhìn thấy. 7D **không** thêm gameplay.

Landing ở `f6085a4` (2026-09-02). Roadmap không được commit đó sửa, nên section này được viết sau khi đọc lại code.

- [X] Gate `verify:web-beta` = `verify:web-alpha` + `npm audit --audit-level=high` + `test:prod-smoke`.
- [X] `scripts/smoke-prod.mjs`: dựng `infra/docker-compose.prod.yml` + `docker-compose.smoke.yml` (Caddy TLS + PostgreSQL + Redis + game + outbox), chạy `e2e/password-auth.spec.ts` (register → build → reload giữ session) và assert `/health/ready`, `/metrics`, `/api/dev/*` trả 404 từ ngoài.
- [X] `scripts/drill-web-beta.mjs`: 3 drill tự động — Redis kill, game kill (outbox sống độc lập), backup → drop → restore có sentinel row; báo cáo ghi `infra/backup/drill-report.md`.
- [X] Security: Pino `redact` cho authorization/cookie/token; refresh cookie `Path=/api/auth`; origin check chặn cả request **thiếu** `Origin`; Caddy thêm CSP/HSTS/Referrer-Policy/Permissions-Policy/nosniff/X-Frame-Options.
- [X] Rate limiter **fail-closed**: Redis không dùng được ở production thì throw `DEPENDENCY_UNAVAILABLE` → HTTP 503, không cho request đi qua.
- [X] Metrics `http_requests_total`, `http_auth_failures_total`, `kingdom_websocket_auth_failures_total` + alert `KingdomsAuthFailures` trong `infra/alerts.yml`.
- [X] Broadcast coalesce: `requestBroadcast()` bật cờ, tick gửi một snapshot — thay cho fan-out full snapshot mỗi command.
- [X] `verify:web-beta` và `drill:web-beta` vào `.github/workflows/ci.yml`: `npm audit` là gate 10 của job `verify`; `test:prod-smoke` và `drill:web-beta` là hai job riêng vì cần Docker — `prod-smoke` chạy trên `main`/`workflow_dispatch`/schedule, `recovery-drill` chạy `workflow_dispatch` + cron hằng tháng và upload `drill-report.md` làm artifact. **Lần quan sát đầu tiên: 2026-09-03**, `workflow_dispatch` trên `perf/command-path` ([run `33707793916`](https://github.com/HoangAnh411/KOM/actions/runs/33707793916)) — `verify` 10/10 gate, `prod-smoke` **xanh** (compose prod build thật, `password-auth` 1/1), `recovery-drill` **xanh** (3/3 drill, RPO 0 ms, RTO **4439 ms**). Máy contributor vẫn không có Docker nên CI là chỗ duy nhất quan sát được hai job này.
- [ ] `infra/backup/backup.sh` và `restore.sh` chưa được kiểm chứng lần nào: drill dùng `docker compose exec postgres pg_dump` chứ không gọi hai script đã commit (custom format, retention 7 daily + 4 weekly, checksum vào `backup.log`, guard `BACKUP_ALLOW_LOCAL`). Drill kỳ sau (2026-10-02) nên đi qua đúng hai script đó.
- [X] Rate-limit bucket dùng chung — **đã sửa ở `d1212b4`** (PR #3 `feat/rate-limit-buckets`): 7D sửa hành vi `rate-limit.ts` nhưng không sửa key, nên mọi command vẫn đếm chung `write:<playerId>`. Giờ có bốn bucket mỗi phút mỗi player — `write` 20 / `combat` 10 / `spy` 5 / `read` 60 — khai báo tập trung ở bảng `commandBuckets` trong `apps/server/src/app.ts`, không truyền limit ở từng route, nên một hạn mức không thể lệch khỏi counter nó tiêu.

**Tiêu chí hoàn thành:** `npm run verify:web-beta` xanh trên một runner có Docker — **đạt 2026-09-03** trên run `33707793916` (10 gate + `prod-smoke`, cả hai xanh trên runner GitHub); drill hằng tháng chạy và kết quả (RPO/RTO) vào `docs/OPERATIONS.md` — đã có hai lần đo (local 2026-09-02 RTO 5795 ms, CI 2026-09-03 RTO 4439 ms); không route vận hành nào (`/metrics`, `/health/ready`, `/api/dev/*`) lộ ra ngoài Caddy — `prod-smoke` assert đúng ba route này trả 404 từ ngoài.

## Command path và sức chứa (chặn load test [143])

**Mục tiêu:** làm cho một REST command trả tiền theo *chính nó* chứ không theo toàn bộ lịch sử season, và mở đủ sức chứa map để profile load test nói về gameplay. Không thêm gameplay; đây là điều kiện để mục "Chạy full load test 15 phút" ở trên có nghĩa. Số phase để owner đặt.

Hai finding Medium của `docs/SECURITY-REVIEW.md` nằm ở đây: S-3 (`processedCommands` phình vô hạn) = P0.3, S-4 (reload toàn bảng `event_ledger`) = P0.2.

- [X] **S-5 — `ambush` phải có tiền đề không gian.** Trước bản sửa, `ambush` chỉ kiểm caravan đang `moving` và không phải của mình: không cần quân, không cần ở gần, không tốn gì, 20 lần/phút → xoá 60% hàng của bất kỳ caravan nào trên map và làm hệ thống hộ tống vô nghĩa. Luật owner chốt 2026-09-03 đã landing: người tấn công phải có ít nhất một army còn sống (`strength > 0`, không `frozen`) trong bán kính Manhattan 3 quanh **ô hiện tại** của caravan (lerp `source → destination` theo `progress` ở `caravanTile()` `logistics.ts:42`, mirror của `apps/client/src/map.ts:326-332`), sai thì `AMBUSH_OUT_OF_RANGE` 400 và **không** tiêu `commandId` (guard đứng trước `claim()`, `logistics.ts:192`); `ambush` vào bucket `combat` 10/phút (`app.ts:125`). Test: 4 test mới ở `logistics.test.ts` + bucket ở `app.test.ts`.
- [X] **P0.2 (= S-4) — bỏ full-table ledger reload khỏi command path.** Trước bản sửa, `Store.load()` chạy *bên trong* transaction của mỗi command và kết thúc bằng `EventLedger.load()`, câu này `SELECT` cả bảng `event_ledger` kèm `payload` JSONB (chứa battle report) **không `LIMIT`**: mỗi command trả tiền cho toàn bộ lịch sử season. Đã sửa: (1) command path và moderation path gọi `load({ skipLedger: true })` (`store.ts:99`, `:122`) nên **không phát truy vấn ledger nào** ngoài point query `WHERE command_id=$1` trong transaction; (2) boot path chỉ đọc **một cột có trần** — `SELECT command_id … WHERE command_id IS NOT NULL ORDER BY created_at DESC LIMIT $1` với trần là *idempotency window* (`IDEMPOTENCY_WINDOW`, mặc định 20 000), không còn đọc `payload`; (3) `load()` thôi xoá `this.events` (event đã append chưa persist) — trước đây vô hại vì mọi appender chạy cùng slot `runExclusive`, nhưng là mìn cho appender mới; (4) `history` bị trim theo cùng window nên một season dài không làm nó phình. `hasCommand()` giờ là **cache dương**: miss thì rơi xuống point query + unique partial index `event_ledger_command_idx` (migration 003), không mất bảo đảm; ở in-memory mode Set vẫn đầy đủ theo process. Test: `event-ledger.test.ts` mới (4 test, chạy được **không cần Docker** bằng pool giả ghi lại query). Số p95 trên PostgreSQL **chưa đo** — máy contributor không chạy được `test:postgres`; đo trên CI hoặc stack owner.
- [X] **P0.3 (= S-3) — gộp dedupe về một đường, có trần.** Trước bản sửa có **năm** cơ chế dedupe song song, ba trong số đó bị sao chép **hai lần mỗi command** cho rollback (`capture()` gọi một lần trước `pool.connect()` rồi lại sau `load()` trong transaction): `EventLedger.commandIds`, unique index + point query, `state.processedCommands: string[]` trong `game_state` JSONB (phình cả trên đĩa), `CombatRepository.commands`, `LogisticsRepository.commands` + `OnboardingRepository.commands`. Còn hai, cả hai có trần.
  - [X] **P0.3a — một registry có trần thay ba Set của repo.** `apps/server/src/command-registry.ts` (mới): Set có trần FIFO dùng chung `config.idempotencyWindow` với `EventLedger` (P0.2), cộng journal `begin()`/`commit()`/`rollback()` mà store mở quanh `action()`. Rollback quên đúng những id command vừa lỗi đã claim, nên thay vì ba Set copy 2× mỗi command chỉ còn một mảng rỗng. `CombatRepository.capture()`/`restore()` xoá hẳn (Set đó là toàn bộ state ngoài `GameState` của nó); `logistics.capture()` bỏ field `commands`; 12 call site giữ nguyên chữ ký. Test: `command-registry.test.ts` (7 test). Landing `97822af`.
  - [X] **P0.3b — bỏ `state.processedCommands` khỏi JSONB.** 14 chỗ chuyển sang registry: 11 cặp check/push ở `diplomacy.ts`, `launchMission` + `activateCounterIntel` ở `espionage.ts`, `startBuild` ở `store.ts`. Bỏ field ở `types.ts`, bỏ `state.processedCommands = []` trong `hardReset()` — store gọi `commands.clear()` **sau khi** reset đã bền (sau COMMIT ở path PostgreSQL). Không cần migration cho một key: `Store.load()` destructure key cũ ra khỏi hàng đọc lên nên lần `persistState` kế tiếp ghi lại hàng đã co. Hai thay đổi hành vi đã ghi vào commit body: dedupe giờ **claim tại chỗ check** (an toàn vì rollback của transaction `forget()` đúng id đó — test mới: build thiếu tài nguyên vẫn retry được cùng `commandId`), và id dẫn xuất `commandId + "-violate"` mất dedupe bền qua restart (an toàn vì `breakTreaty` có guard cứng `TREATY_NOT_ACTIVE`, có test cùng id hai lần chỉ trừ 150 reputation một lần). Landing `f94ac22`.
- [X] **P0.4 — sức chứa map. Chốt qua plan 2026-09-04, đã landing.** Bốn quyết định: phạm vi = mở sức chứa + bản đồ thật (chưa cho terrain ảnh hưởng di chuyển), kích thước **36×36**, terrain **vẽ tay cố định** (không noise theo seed), lãnh thổ **chiếm bằng quân đóng**. Thế giới sống ở `packages/shared/src/world-map.ts` — hai lưới ký tự, 16 tỉnh, 36 anchor (4 thương cảng + 32 mỏ). Sức chứa **đo được: 14 → 135 ô** đặt thành phố (2 thành seed + 133), trên profile load test 120 người. Ba luật làm nên con số: tầm với anchor 2 → 3 (2 chỉ cho 111), site phải có mỏ của **cả ba** loại tài nguyên trong tầm thu hoạch (nếu không thì hết starter package là hết đường), và đặt thành phố đi vòng theo tỉnh thay vì row-major (row-major dồn 40 người đầu vào một góc). Tầm thu hoạch thành `gameRules.logistics.harvestRange` = nửa bề rộng bản đồ = 18, đúng nghĩa mà số `10` viết cứng đã có ở thế giới 20×20; hạ nó xuống là **quyết định cân bằng** và cái giá là sức chứa (12 → 120 ô, 14 → 130, 18 → 135). Còn lại của vòng này: **không gì thuộc máy** — vùng đã vẽ lên map, vào feed và vào tray ở M-6 (`5dd2e87`, sửa ở `0169655`), dây chỉ chở mã tỉnh → người giữ nên tốn **18 byte** lúc chưa ai giữ thay vì 1 493 mỗi tick. Còn một việc cần người: kiểm mắt 5 viewport xem marker ô lỵ sở và tên tỉnh có đè lên quân/thành không. `tilesControlled` **đã có người ghi** từ `f3e9b1a`: một tỉnh thuộc về người có quân sống đứng cạnh ô lỵ sở, tính lại mỗi tick, và thang điểm lãnh thổ chia theo một phần tư bản đồ (`fullScoreTiles` = 324) nên một tỉnh trả **73–76 điểm** thay vì trọn 300 như thang cũ vốn bão hoà ở 60 ô. Đó là **đổi luật tính điểm** → OQ #15, owner đổi ý thì là một hằng số và hai fixture.
- [ ] **P0.5 — chạy lại load test 15 phút** sau P0.2 + P0.3 + P0.4 và lưu report (đóng luôn mục [143] ở Phase 7A). Sức chứa **không còn chặn** (135 ô ≥ 120 người, và `loadtest-seed` giờ từ chối ngay từ đầu kèm trần thật nếu `LOADTEST_USERS` vượt sức chứa, thay vì chết giữa lúc seed bằng `KINGDOM_FULL`). Còn chặn: `k6` chưa cài ở máy contributor.

**Tiêu chí hoàn thành:** một command không phát truy vấn nào tỉ lệ với lịch sử season; mọi cấu trúc dedupe có trần; load test 15 phút chạy được và report vào repo.

## Sửa 6 lỗi P1 từ kiểm tra độc lập gameplay (07-09-2026)

**Nguồn:** `test-results/gameplay-review-2026-09-07.md` (phần "Phản hồi sửa lỗi" ở cuối file đó ghi chi tiết từng lỗi). Owner chọn: sửa 6 P1 theo đúng khuyến nghị của report; P2 (mục 7–10: NPC chiến dịch tồn đọng, XP PvP, tuyển tức thời, replay/wounded) và phần "Chưa đủ theo kế hoạch" chưa đụng đến.

- [X] **P1-1 preset lặp binh chủng:** `compositionWithCounts` phân bổ tuần tự trên lượng còn lại — preset 40+40 cùng loại từ 60 bộ binh cho 40/20, dự bị 0. Test `army-management.test.ts`.
- [X] **P1-2 NPC rơi về combat cũ:** mixed engine chạy khi **một trong hai** bên có composition (bên thiếu được tổng hợp thành squad legacy); strength lệch được sửa theo composition trước trận, không fallback cho dữ liệu lệch; attrition đi qua `applyCompositionLosses`; NPC spawn có composition + chỉ huy. Test `combat.test.ts` + `store.test.ts`.
- [X] **P1-3 chỉ huy mắc kẹt:** nhánh hồi phục giải phóng chỉ huy khi hết `recoveryAt` kể cả khi quân đã về thành; `destroy()` gọi `releaseCommander()` ở mọi nhánh, gồm PvP (clear `assignedArmyId`). Test `army-management.test.ts` + `combat.test.ts`.
- [X] **P1-4 đổi chỉ huy bỏ qua capacity:** `assignCommander` chặn bằng `commanderCapacity` của chỉ huy mới → `ARMY_CAPACITY_EXCEEDED`. Test `army-management.test.ts`.
- [X] **P1-5 nhiệm vụ đầu bất khả thắng:** đối thủ dựng theo ngân sách diệt thật của engine — ch1 17+8, ch2 45+15, ch3 30+10+10 thủ thế; sweep 88%/85%/90% thắng, 0 thua (`scripts/balance-sim.mts`, chạy bằng `node --import tsx scripts/balance-sim.mts`); `progression.test.ts` viết lại đi đường người chơi thật (recruit → `updateComposition`, không bơm quân/XP), walkthrough 12 mission thắng bằng seed xác định từ trạng thái tài khoản mới.
- [X] **P1-6 chuyển mùa xóa caravan:** `persistSeasonReset` giữ nguyên tuyến, caravan đang chạy, cargo, mốc đến, hộ tống; logistics chỉ reset bộ đếm mùa. Test `season.test.ts`.
- [X] **OQ #16 — `defenseModifier` "đảo dấu"? — RÚT LẠI.** Kiểm tra lại chiều áp dụng: `defenseModifier` **nhân vào power của phía đánh vào** (`mixed-battle-engine.ts`: `* defenseModifier(...) / targetDefense`), nên −0.1 cho squad shield/spear của chỉ huy infantry làm **giảm damage nhận vào** — bonus phòng thủ đối xứng với `+0.1` attack của chỉ huy archer/cavalry trong `attackModifier`. Engine đúng thiết kế như ghi chú thiết kế cũ; phát biểu "đảo dấu… dễ trúng đòn hơn" trong review 07-09 là đọc nhầm chiều. Không sửa engine, cân bằng P1-5 giữ nguyên.

Sau sửa: typecheck đạt; `npm test` shared **25**, server **184 pass/0 fail** (15 PostgreSQL skip khi không có DB), client **163**; `test:postgres` local **14 pass/0 fail**; full Playwright **32/32 trong 7,9 phút**. Test matrix ở mục Phase tương ứng cần cộng thêm các test mới khi đóng phase.

## Sửa 4 lỗi P2 + đính chính OQ #16 (07-09-2026, tiếp theo đợt P1)

**Nguồn:** mục 7–10 của `test-results/gameplay-review-2026-09-07.md` (phần "Phản hồi sửa lỗi — P2" ở cuối file đó ghi chi tiết). Owner chọn sửa cả bốn theo khuyến nghị; OQ #16 kiểm tra lại thì **rút lại** (xem dưới).

- [X] **P2-7 NPC chiến dịch tồn đọng khi retry:** NPC mission/patrol giờ **transient tới cùng** — sau `resolveEncounter`, `completeMission` và `patrol` lọc NPC khỏi `state.armies` bất kể thắng/hòa/thua (thắng thì filter là no-op vì `destroy()` đã xóa). Tag NPC đổi từ `mission.id` trần sang `${commandId}:${mission.id}` — squad id và `sourceWorldEventId` duy nhất theo lần thử, hết trùng lặp giữa các retry. Test: "an unresolved mission leaves no campaign NPC behind, even on retry" + "an unresolved patrol also leaves no NPC behind" (`progression.test.ts`).
- [X] **P2-8 PvP vẫn cấp XP:** `awardPvEXp` thêm kiểm tra phía thua là NPC (`loser.ownerType !== "npc"` → return) — XP chỉ đến từ đánh mission/world NPC, hai tài khoản của cùng người không farm XP cho nhau được nữa. Test: "PvP victories award no commander XP while PvE victories still do" — đủ 4 hướng: PvP attacker thắng, PvP defender thắng (0 XP), PvE attacker/defender thắng (+25) (`combat.test.ts`).
- [X] **P2-9 tuyển tức thời bỏ qua hàng đợi:** thân `recruitReserve` delegate sang `train` — cùng giá, cùng `TRAINING_QUEUE_FULL`, cùng `completesAt`; tick vẫn đổ quân vào `reserve.available`. Client bỏ nút tuyển tức thời ở thẻ "Tuyển và lập đạo quân" (chỉ còn hàng đợi Doanh trại — hết hai đường song song), `PendingChip` đổi sang `train_troops`. Endpoint `/api/commands/recruit-reserve` giữ nguyên schema cho tương thích API (`docs/API.md` cập nhật mô tả). **Phạm vi cố ý bỏ lại:** `/api/commands/recruit` (v1, `combat.recruit`) vẫn cấp quân tức thời — đường pre-composition legacy, review không đánh dấu, không có caller client; cân nhắc bỏ hẳn khi dọn API v1. Test: "recruiting reserve goes through the training queue and creating an army is a separate transaction" (`army-management.test.ts`).
- [X] **P2-10 replay/wounded hai nguồn:** (a) một nguồn phân bổ tổn thất — `allocateCasualties(rounds, side)` (per-troop-type, killed = floor(losses × 0.2)) thay ba chỗ tính 20/80 lệch nhau; `recordWounded` giờ ghi `army.wounded` cho **mọi** army player có composition (PvP có thương binh thật, khớp report), `sideReport` và engine output cùng lấy từ allocation. (b) replay một con trỏ — phần "Phối quân" trong BattleReportModal slice theo `replayRound` như thang sức mạnh cổ điển; "Xem lại" điều khiển cả hai view. Không đổi damage/cân bằng. Test: "wounded cargo matches the report for both PvP and PvE losses" (`combat.test.ts`) + e2e replay pointer (`e2e/campaign.spec.ts`).
- [X] **OQ #16 — RÚT LẠI** (đính chính ở trên): không sửa engine, cân bằng P1-5 giữ nguyên.
- [X] **E2e regression mới** (`e2e/campaign.spec.ts`): tuyển quân qua hàng đợi (không cấp tức thời), lập đạo quân + mẫu đội hình + xuất quân chiến dịch (không sót NPC `campaign:*` sau trận, mọi kết quả), replay mixed theo con trỏ. Tài khoản mới có food 0 nên test tự trồng nông trại trước khi huấn luyện — đúng đường người chơi thật. Sortie đứng **trước** trận đánh world trong test: quân thua trận world sẽ về thành hồi phục 120 giây và bị chặn `ARMY_IN_TRANSIT`; ngược lại quân 20 lính đánh NPC ch1 không bao giờ bị wipe (mô phỏng 800 tổ hợp seed×địa hình ở `scripts/sortie-wipe-check.mts`: toàn hòa, 0 wipe).

Sau sửa: typecheck đạt; `npm test` shared **25**, server **188 pass / 0 fail** (15 PostgreSQL skip khi không có DB), client **163**; `test:postgres` local **14 pass / 0 fail**; full Playwright **34/34 trong 11,8 phút** (32 cũ + 2 mới).

## Nhiệm vụ chiến dịch đa dạng (07-09-2026, mục "Chưa đủ theo kế hoạch" của review gameplay)

**Nguồn:** mục 11 của `test-results/gameplay-review-2026-09-07.md` đòi ba thứ chiến dịch còn thiếu: mục tiêu có **tọa độ trên bản đồ theo khám phá** (trước đây 12 lần gọi combat đều giải tại vị trí quân đứng), **điều kiện phi chiến đấu** (xây dựng / giao thương / trinh sát), và **thưởng tài nguyên cho tuần tra**. Owner chọn làm cả ba theo phương án được duyệt (plan lưu ở `~/.claude2/plans/inherited-soaring-heron.md`).

- [X] **Mục tiêu trên bản đồ, server-authoritative:** mỗi mission trong `campaignMissions` mang `kind` (`combat`/`scout`/`build`/`trade`) và `target {x, y}` nguyên trên lưới 256, đặt tại anchor/seat thật (12 tọa độ cụ thể trong shared data). Server kiểm `explorationContains` cho **mọi** kind (`MISSION_TARGET_UNEXPLORED`) — pin trên vùng chưa mở fog sẽ là scout miễn phí. Sortie `combat` đòi quân đứng trong bán kính Manhattan `gameRules.campaign.arrivalRadius` = 3 ô quanh mục tiêu (`MISSION_TARGET_NOT_REACHED`), NPC spawn **tại mục tiêu** thay vì tại quân; không auto-travel — người chơi vẫn dùng `/move-army` như thường. `armyId` của `completeCampaignMissionCommand` thành optional (combat thiếu → `ARMY_REQUIRED`, kind khác bỏ qua). Tổng XP 545 → **430** (mission phi combat trả `rewardResources` vào thành đầu, không XP vì không có chỉ huy ngoài trận).
- [X] **Ba nhiệm vụ phi chiến đấu, đúng chương mở mechanic:** `chapter-1-scout` → **scout** (điều kiện: ô mục tiêu đã khám phá), `chapter-2-road` → **build** (`road_depot ≥ 1` ở thành bất kỳ — mirror derive onboarding), `chapter-2-escort` → **trade** (tổng `logistics.throughput` ≥ 100 — con số đã có trên snapshot nên client và server cùng đọc một nguồn). Từ chối trước khi điều kiện đạt: `MISSION_CONDITION_UNMET`. Chương 3 giữ nguyên làm climax quân sự. Snapshot **không đổi** — mission definition là static data client import trực tiếp, progress build/scout/trade đều đã nằm trên snapshot; không bump protocol, không migration.
- [X] **Thưởng tuần tra theo chương:** thắng patrol nạp `gameRules.campaign.patrolRewards[chapter]` (ch1 60/40/10, ch2 120/80/25, ch3 200/140/40 — wood/stone/iron) vào thành nhà của quân tuần tra; hòa/thua không trả gì. Không cooldown — rate bucket combat 10/phút cùng morale/recovery là gate đủ. Cùng một nhánh `grantResources` với reward mission.
- [X] **Client:** pin `mission:<id>` trên bản đồ 3D (banner tint màu theo kind, chỉ hiện khi chương mở + chưa hoàn tất + đã khám phá — tối đa 4 pin); **tuyến mục tiêu** — một `THREE.Line` nét đứt từ đạo quân tới nhiệm vụ ground kế tiếp (combat/scout), cập nhật mỗi snapshot, dispose tường minh vì `THREE.Line` không phải Mesh; click pin trả tile selection như seat. `explorationBit` thuần ở `map-geometry.ts` (pure twin của `exploredAt` trong scene, mirror `explorationContains` server — ba nơi cùng một phép quantise). `ProgressionPanel` viết lại: badge kind, dòng "Mục tiêu: x,y · tỉnh", nút ghost "Đi tới mục tiêu" (`setSelection` — camera center theo pattern MapSurface), nút hành động theo kind kèm disabled+reason đọc chính snapshot field server sẽ kiểm, thẻ patrol hiện thưởng tài nguyên. `missionKindLabels` ở vocabulary (bốn bề mặt một chữ); activity feed thêm kind `mission-completed` (diff `completedMissionIds`, anchor nhảy tới panel chiến dịch).
- [X] **E2e (`e2e/campaign.spec.ts`):** test sortie giờ đi đường người chơi thật — đọc target từ snapshot qua `/api/bootstrap`, POST `/move-army` qua đúng API command tray dùng, `expect.poll` 1 giây/lần (tránh tốn rate bucket read 60/phút) tới khi quân tới ô mục tiêu, rồi mới "Xuất quân"; assert panel có "Mục tiêu: x,y" và nút "Đi tới mục tiêu". Sau sortie quân **đi bộ về thành** trước trận đánh world (mob dev spawn cách thành 3 ô, pursuit từ 47 ô không giải được trong 25 giây của report modal). Timeout 480 giây cho hai cuộc hành quân ~47 ô.

Sau sửa: typecheck đạt; `npm test` shared **28** (+3), server **192 pass / 0 fail** (+4, 15 PostgreSQL skip khi không có DB), client **165** (+2); `test:postgres` local **14 pass / 1 skip**; full Playwright **33/34 ở run 16,3 phút** — test treaty modal còn fail vì tràn 30 giây mặc định (trace cho thấy tổng flow ~34 giây dưới tải full-suite: login 6,5 giây, lazy chunk drawer ~9 giây, mỗi click 2–5 giây), đã nâng `test.setTimeout(60_000)` và pass khi chạy lại file (41,4 giây); hai spec cũ khác cũng lấy thêm đồng hồ (`economy.spec.ts` 60 giây — flow ~34 giây; poll hai cuộc hành quân campaign đổi `intervals` còn 2 giây/lần sau khi trace cho thấy đúng một 429 trên 61 request bootstrap — 60 request/phút trúng trần read bucket). Ghi chú theo mùa: `campaignProgress` giữ qua reset nhưng throughput reset — nhiệm vụ trade của mùa mới giao đủ lại từ đầu (đã ghi `docs/API.md`).

## Nhiệm vụ hằng ngày với mốc thưởng (08-09-2026)

**Mục tiêu:** loop đăng nhập mỗi ngày sau khi chiến dịch đa dạng đã xong. Owner chốt: **6 quest/ngày** (3 dễ 1đ + 2 vừa 2đ + 1 khó 3đ = 10 điểm), **mốc thưởng ở 5đ và 10đ**, thưởng chỉ wood/stone/iron, reset **00:00 UTC** (plan lưu ở `~/.claude2/plans/inherited-soaring-heron.md`).

- [X] **Hybrid baseline-diff — tiến độ không lưu:** progress = `max(0, hiện_tại − baseline)` suy ra lúc đọc từ 7 counter đơn điệu (harvests, tổng cấp công trình, training_batches, caravans_delivered, battles_won, campaigns_completed, spy_successes). Chỉ lưu `dayKey` + `baselines` + claims. Không hook vào combat resolver hay command path — zero rủi ro rollback transaction; test bump counter trực tiếp thay vì chạy battle/caravan thật. Đổi ngày do **tick kéo** cho mọi player (`verify` trong `store.tick`, người offline qua nửa đêm vẫn có baseline đúng) + lazy `ensureToday` khi đọc snapshot/claim (pattern `onboarding.verify`).
- [X] **Bảng deterministic theo ngày:** `selectDailyQuestIds(dayKey)` — FNV-1a hash `daily-quests:${dayKey}` → mulberry32 → Fisher–Yates rút 3/4 nhiệm vụ dễ, lấy nguyên 2 vừa + 1 khó. Mọi player cùng một bảng trong ngày, chạy được cả Node lẫn browser. Quest khó là **spy thành công** (không phải "khám phá N ô" — exploration gần bão hòa giữa mùa sẽ giết quest 3đ).
- [X] **Ba counter mới** cho các hoạt động chưa đếm: `trainingBatches` (vòng hoàn tất huấn luyện — không tính heal quân y), `caravansDelivered` (nhánh `delivered`), `campaignsCompleted` (recordCompletion + thắng patrol — tách khỏi battles_won). Ba cái còn lại dùng nguồn có sẵn: `logisticsCounters.harvests`, tổng cấp công trình, `militaryThroughput.victories`, filter `spyMissions`.
- [X] **Một endpoint hai đích:** `POST /api/commands/daily-quest/claim` nhận `questId` **hoặc** `milestone` (5/10), bucket write. Claim quest: `DAILY_QUEST_STALE_DAY` → `DAILY_QUEST_ALREADY_CLAIMED` → `DAILY_QUEST_NOT_COMPLETED`; mốc: `MILESTONE_NOT_FOUND` → `MILESTONE_ALREADY_CLAIMED` → `MILESTONE_NOT_REACHED`. Idempotency theo pattern `breakTreaty`: `commands.claim(commandId)` đứng **trước** mọi state guard để replay trả `already_processed` chứ không phải ALREADY_CLAIMED. Điểm tính theo hoàn thành, độc lập với claim — claim mốc không trừ điểm.
- [X] **Snapshot field optional `dailyQuests`** (viewer-scoped) — **không bump protocol** (PROTOCOL_VERSION giữ 4, precedent mọi field sau v1 đều `.optional()`). Season close xóa `dailyQuests` vì baseline tham chiếu counter per-season (`militaryThroughput`, `spyMissions`) đã reset — mất tối đa một ngày dang dở ở biên mùa.
- [X] **Client:** section "Nhiệm vụ hằng ngày" đầu PanelBody của ProgressionPanel — quest row theo markup onboarding (✓/điểm ở dot, `progress/target` + thưởng ở label, nút Nhận kèm disabled+reason, `PendingChip` theo questId/milestone), progress bar điểm + hai hàng mốc, đếm ngược 00:00 UTC mỗi giây (pattern StrategicHeader). Activity feed thêm kind `daily-quest-completed` (diff theo transition vượt target, **guard dayKey** mirror guard season — đổi ngày không được spawn 6 hàng); attention items nhắc quest xong chưa nhận + mốc đủ điểm chưa nhận (cả hai **mất khi qua 00:00 UTC** nên nudge có tính thời gian), tự biến mất khi claim.
- [X] **E2e (`e2e/daily-quests.spec.ts`):** bootstrap khẳng định bảng 6 quest + đúng `selectDailyQuestIds(dayKey)` + points 0 + refreshesAt tương lai; hoàn thành **cả hai** nhiệm vụ dễ harvest và build qua flow người chơi thật (3 lần Khai thác + nông trại + trại lính — ngày chỉ bỏ đúng 1 quest dễ nên ít nhất một trong hai chắc chắn có mặt); claim qua UI → counter wood tăng + nút "Đã nhận"; mốc 5đ khoá kèm lý do. Guard một dòng skip nếu UTC day lật giữa chừng test.

Sau sửa: typecheck đạt; `npm test` shared **31** (+3), server **199 pass / 0 fail** (+7, 15 PostgreSQL skip khi không có DB), client **167** (+2); `test:postgres` local **14 pass / 1 skip**; full Playwright **34/35 ở run 18,7 phút** (thêm `daily-quests.spec.ts` 1 test mới, 33,3 giây isolated) — test situation-room drawers còn fail vì tràn 30 giây mặc định (đúng pattern treaty round trước: flow ~16 giây isolated nhưng login ~6 giây + 4 click drawer 2–5 giây/click dưới tải full-suite), đã nâng `test.setTimeout(60_000)` và pass khi chạy lại file (12,4 giây).

## Cải tổ HUD — Situation Room vòng 2

**Mục tiêu:** mọi bề mặt HUD nói cùng một ngôn ngữ thị giác, mọi control nói cho người chơi biết *vì sao* nó khoá và *lệnh của họ đang ở đâu*. Không thêm gameplay, **không sửa file nào** trong `apps/server` hoặc `packages/shared` — nên server unit đứng nguyên 141. Số phase để owner đặt.

Vòng 1 (Phase 7C, Situation Room) tự để lại ba mốc trong code nói rõ phần còn thiếu: cột hoạt động là skeleton `aria-hidden` chờ "PR4", nửa phải command tray là hộp trống có nhãn chờ "PR5", và một rule bridge `.hud .kom-panel` chờ ngày cột được lắp hết từ panel. Lúc bắt đầu vòng 2 chỉ **3/13** bề mặt dùng design system. Landing trên nhánh `feat/hud-overhaul` (cắt từ tip `perf/command-path`), bảy commit.

- [X] **Từ vựng, gate giá và pending có địa chỉ** (`bae7060`): `apps/client/src/ui/vocabulary.ts` phủ `keyof Resources` nên thêm resource là **lỗi compile** chứ không phải lỗi hiển thị; `formatCost`/`formatCargo` thay ba cách viết giá khác nhau (`{cost.wood}g {cost.stone}đ`, `hàng {cargo.wood}g/…`, một biến thể nữa); `affordable(city, cost)` trả `{ ok, reason }` nêu **đúng** loại tài nguyên thiếu; `pendingFor(pending, kind, match?)` phân biệt hai lệnh cùng `kind` khác `body` (bốn nút xây đều là `kind: "build"`). `StrategicHeader` thôi in `food`/`wood`/`stone`/`iron` thô trong UI tiếng Việt; `data-testid="resource-*"` **không đổi**.
- [X] **Một implementation modal duy nhất** (`1d1723a`): `ui/Modal.tsx` trích nguyên cơ chế của `TreatyBreakModal` (focus trap, Escape, restore focus, `aria-modal`, `aria-labelledby`) rồi kéo `BattleReportModal` + hai modal inline của `ArmyPanel` vào. Trước đó **3 trong 4** modal thiếu cả ba thứ. `role="dialog"` giờ chỉ tồn tại ở một file, có text scan khoá lại; e2e treaty (focus trap / Escape / −150 danh tiếng) xanh **không sửa assertion**.
- [X] **Cột kingdom qua primitives** (`b7ee0a4`): nav bỏ emoji `🏰 ⚔ 🚚 🕊` → `Icon` + `Button`; bốn panel người chơi dùng mỗi phút dựng bằng `Panel`/`PanelHeader`/`PanelBody`; mọi nút khoá có `reason` nhìn thấy được — `CityPanel` trước đây cho bấm Xây khi thiếu tài nguyên rồi ăn 400 từ server; chip pending hiện **cạnh chính control đã phát lệnh** (trước đó `.pending-strip` đáy cột là chỗ duy nhất, mà cột đóng mặc định ở band compact). Sửa hai bug state dùng chung: `escortId` của `LogisticsPanel` và `targetId` của `ArmyPanel` từ một biến chung thành state theo từng hàng — chọn ở hàng 1 từng áp cho hàng 3.
- [X] **Drawer nâng cao + xoá rule bridge** (`a7434b6`): bốn bề mặt drawer migrate → **13/13** bề mặt dùng design system, `AdvancedDrawer` vẫn lazy. `.hud section` **và** `.hud .kom-panel` xoá trong một commit (cặp này tự duy trì nhau: còn `.hud section` thì xoá bridge làm padding gấp đôi). Raw enum thôi lộ cho người chơi (`event.eventType`, `treatyType`, `role`) — map wording **dùng chung** với activity feed nên hai bề mặt không nói hai giọng; `DiplomacyPanel` hết nhảy `h2` → `h4`. `layout.test.ts` khẳng định cả hai absence **và** bản thay thế nên rule không mọc lại được.
- [X] **Cột hoạt động: feed thật, suy từ client** (`c8a4f84`) — lấp slot "PR4". `activity.ts` thuần gom bốn nguồn client **đã giữ** (chuyển trạng thái pending, battle report, notice, diff snapshot): không route mới, không event server mới, không sửa protocol. Ring trần 50, newest-first, **dedupe theo id của chính sự việc** — không theo "đổi so với tick trước", đó là điều duy nhất giữ cho snapshot 2s/lần khỏi sinh một hàng mỗi tick suốt phiên chơi; trả `previous` theo identity nên tick yên lặng không re-render. Hàng có anchor là `Button` nhảy tới panel liên quan, hàng không có là text tĩnh. Panel "Cần chú ý" đặt **trên** feed vì cột là thứ scroll. Quyết định đáng ghi: **trận đánh không sinh hàng feed** — battle report đã nói ai thắng và còn bao nhiêu, thêm hàng từ diff `strength` là kể lại cùng một trận lần thứ hai và kém chính xác hơn.
- [X] **Command tray: lệnh cho thứ đang chọn** (`0895bd1`) — lấp slot "PR5". `tray-groups.ts` thuần chỉ **nhóm lại lệnh đã tồn tại** (move / attack / merge / cancel order / mở panel); lệnh không hợp lệ **khoá kèm lý do**, không ẩn — ẩn đọc thành "game thiếu tính năng", khoá kèm một câu đọc thành "trạng thái đổi được". `.command-tray__reserved` cùng rule `display: none` đã xoá nên band 900px — nơi cả hai cột là flyout đang đóng — giờ có chỗ duy nhất trên màn hình nói lệnh của thành phố nằm ở đâu. `panelForSelection` đưa selection trên map về đúng panel để nav sáng `aria-current` sẵn có: **không** thêm method cho `WorldMap`, **không** re-key `MapSurface`. Ba luật giữ tray đúng một dòng 60px (nó chia grid row với map, và hộp map là thứ Pixi lấy kích thước canvas): `trayCommandLimit = 4`, title ≤ 26 ký tự, label ≤ 20 — vượt là test đỏ, không phải chữ bị tràn.
- [X] **Chrome và accessibility pass** (`d19cd0e`): toast có nút đóng **thật** (`onClick` cũ trên `<div>` không bao giờ chạy được vì `.toast` có `pointer-events: none`), layer thành `role="status"` + `aria-live="polite"`, Escape đóng cái mới nhất; `.hud-frozen` (`opacity: .5` + `pointer-events: none` — mất contrast **và** vẫn bấm được bằng bàn phím vì nút còn trong tab order) thay bằng `<fieldset disabled>`, cơ chế duy nhất của platform thật sự khoá mọi control con, kèm `StatusChip state="frozen"` nói vì sao; thêm `h1` sau login (trước đó `AuthScreen` là trang **duy nhất** có `h1`); `AuthScreen` dựng lại bằng primitives với label thật; map toolbar sang `Button` + `Icon` + "Về giữa map" dùng `focusCity` đã có; `<button` thô hết sạch ngoài `ui/Button.tsx`; **"Build queues: N/2"** — chuỗi tiếng Anh cuối cùng người chơi đọc — sang tiếng Việt kèm 14 assertion e2e trong 6 spec.
- [X] **Hai lỗi chỉ kiểm mắt mới thấy** (cùng `d19cd0e`), đúng lý do gate cuối là chạy thật ở 5 viewport: (1) `.kom-panel { overflow: hidden }` cho panel min-height tự động **0**, nên trong cột flex có scroll trình duyệt bóp mọi panel vừa khung và `scrollHeight === clientHeight` → **cột kingdom không scroll được**, panel dưới cùng không tới được; `flex: none` cho con trực tiếp của ba cột sửa. (2) Nửa phải tray đang **kể lại** nửa trái (cùng hai câu cho "chưa chọn gì", mỏ in lại `còn 400/800`) nên ở 900px cả hai bản đều ellipsis và cả strip mang một câu hai lần; 5 chỗ đổi wording, cộng một luật test chuẩn hoá hoa/thường + dấu câu rồi so containment **hai chiều** cho mọi selection và cả hai mode giữa gesture.

**Test:** client unit **78 → 146**, e2e **19 → 28** (mọi logic mới là module thuần vì runner client là bare `node --test`, không DOM/canvas/WebGL; contract CSS assert bằng cách đọc stylesheet như text). Bốn spec Playwright mới, **9 test**: activity feed (empty state → đúng một hàng sau một lệnh → click nhảy tới panel), command tray (chiều cao đo trước/sau bằng nhau; band 900px thấy nhóm lệnh và mở được cột đóng), HUD gate (nút khoá kèm lý do và **không** HTTP request nào bay đi), chrome/a11y (toast đóng bằng chuột và Escape, `elementFromPoint` chứng minh thân toast cho click xuyên qua mà nút thì không).

**Tiêu chí hoàn thành:** hai slot đặt chỗ của vòng 1 không còn placeholder nào trong code, rule bridge đã xoá và có test khoá lại, không nút khoá nào thiếu lý do — **đạt**. Còn lại là phiên manual acceptance của Phase 7C (mục ở trên), vốn không phải gate tự động.

**Rà soát sau merge bản đồ 36×36 (2026-09-04):** full E2E xanh **29/29**. Test chip pending thôi dùng thời gian chờ cố định 1,5 giây (có thể hết trước khi assertion được chạy khi full suite chịu tải), chuyển sang cổng request do test chủ động nhả; case đích xanh 5 lần liên tiếp rồi xanh trong full suite. Nhãn tại ô vừa là thương cảng vừa là tỉnh được chia ba lane với thành phố gần đó; client unit tăng **157 → 158** và khoá khoảng cách của cụm seed trung tâm. Kiểm tự động/ảnh chụp ở 1920/1440/1280/1024/900 không có console error hay tràn ngang; mục manual acceptance vẫn chưa tick vì độ mượt và khả năng đọc phải do người chơi xác nhận.

**Nội thành isometric (2026-09-04):** thành phố của người chơi giờ mở được thành một cảnh nội thành có phối cảnh, landmark Tòa thị chính, đường, cổng, tường, cây và sprite riêng cho bốn công trình; click công trình để nâng cấp hoặc chọn ô đất để đặt công trình mới. Layout là state server-authoritative (`buildingPlots`), giữ ô ngay khi vào queue, che với người chơi khác, tương thích save cũ và nút xây nhanh. Tòa thị chính mở phạm vi từ **5×5** tới **9×9**. Đã kiểm bằng ảnh thật trên desktop và 390×844; typecheck, build, bundle, unit, PostgreSQL integration và full E2E **31/31** đều xanh.

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
- [X] Bộ sprite nội thành nguyên bản cho Tòa thị chính, Nhà kho, Trạm tiếp tế và Doanh trại.
- [ ] Chọn pack cụ thể từ nguồn có license rõ ràng.
- [ ] Ghi URL, tác giả, license và version cho từng file.
- [ ] Art style guide cho hero/unit/building/icon.
- [ ] AI portrait concept sau khi có art direction.
- [ ] Blender low-poly pipeline nếu 2D không đủ readability.

## Bước tiếp theo

1. Phase 7C: phiên manual acceptance (30–60 phút) rồi đóng phase.
2. Phase 7: chat/mail moderation, battle worker và Redis outbox publisher.
3. Bổ sung load test WebSocket/tick/queue/caravan và backup/restore runbook.
4. Giữ các gate regression: `npm run typecheck`, `npm run build`, `npm test`, Playwright Chromium desktop và PostgreSQL migrations.

## Quy tắc cập nhật

Sau mỗi feature/bugfix, cập nhật checkbox, trạng thái, test đã chạy và tài liệu domain liên quan. Không đánh dấu hoàn thành nếu chưa đạt tiêu chí nghiệm thu của phase.
