Kingdoms of Meridian — Tiến trình và Roadmap

> Cập nhật lần cuối: 2026-09-02

## Trạng thái hiện tại

**Phase 5, Phase 6, Phase 7A và Phase 7B (Web Playable Alpha, đóng ngày 2026-09-01): hoàn thành local + PostgreSQL integration + browser E2E gate. Phase 7C: toàn bộ mục automated đã xanh, còn đúng một mục manual acceptance (mục cuối của Phase 7C bên dưới). Phase 7D — production/beta hardening — đã landing ở `f6085a4` (2026-09-02).**

Đã xác nhận typecheck, build, unit/regression, PostgreSQL restart/multi-instance integration và Playwright đều pass. Từ 7C suite Playwright là Chromium desktop (project `mobile` đã bỏ; `password-auth` gated `E2E_PROD_SMOKE=1`) — xem mục “Test matrix” của Phase 7C. Auth/session PostgreSQL, frozen moderation, world-event NPC, alliance vote và season archive đã có acceptance coverage.

Roadmap này có section Phase 7D bên dưới (viết sau khi đọc lại code, vì `f6085a4` không sửa roadmap). `verify:web-beta` (`npm audit --audit-level=high` + `test:prod-smoke`) và `drill:web-beta` đã được nối vào `.github/workflows/ci.yml`: `npm audit` thành gate 10 của job `verify`, còn hai việc cần Docker tách ra hai job riêng (`prod-smoke`, `recovery-drill`). Hai job đó **chưa quan sát được xanh** — máy contributor không có Docker.

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
- [X] Security baseline: headers, body limit 64 KB, request timeout, trustProxy, exact Origin trên refresh/logout, `/health` + `/health/live` + `/health/ready` (PG/Redis ping + tick lag ≤3 cycles), `/metrics` bảo vệ bằng METRICS_TOKEN, graceful shutdown SIGTERM/SIGINT (WS 1012). — `TRUST_PROXY` từ security review giờ là **số hop** chứ không phải boolean (`"true"` vẫn nhận, nghĩa là 1 hop); xem S-1 trong `docs/SECURITY-REVIEW.md`.
- [X] Production compose: game + outbox worker + PG/Redis + Caddy (TLS, proxy `/api` `/ws`), profile Prometheus/Grafana, secrets qua `.env.prod`.
- [X] Backup (`pg_dump` daily/7 + weekly/4, checksum, log) và restore drill script; drill trước beta + mỗi tháng.
- [X] Prometheus/Grafana dashboard và alert rules cho health, tick, WebSocket, persistence, outbox và DLQ; OpenTelemetry traces deferred 7B.
- [X] Load-test harness k6: 100 WS 15 phút, 10 cmd/s, reconnect burst, duplicate commandId; seed/verify CLI chỉ nhận DB hậu tố `_loadtest`.
- [ ] Chạy full load test 15 phút và lưu report trước beta.
- [X] Ban/unban baseline, atomic audit/session revoke, frozen entities và action guards; abuse detection nâng cao còn deferred.
- [X] CI thành 10 gates: `npm ci` → migrate fresh → idempotency+checksum → typecheck/build → PostgreSQL integration → unit/regression → Playwright Chromium desktop (7C) → `check:bundle` → `git diff --check` → `npm audit --audit-level=high`. Hai việc cần Docker (`test:prod-smoke`, `drill:web-beta`) là job riêng — xem Phase 7D.
- [X] Restore drill log trong operations runbook (trước beta). — chạy 2026-09-02 qua `drill:web-beta`: 3/3 pass, RPO 0 ms, RTO 5795 ms; kết quả ở mục "Kết quả drill" của `docs/OPERATIONS.md`, báo cáo đầy đủ ở `infra/backup/drill-report.md`. Caveat đã ghi trong runbook: drill dùng `docker compose exec postgres pg_dump`, nên `infra/backup/backup.sh` / `restore.sh` vẫn chưa được kiểm chứng.
- [X] Security review auth, permissions, input và secrets. — `docs/SECURITY-REVIEW.md` (2026-09-02): 10 finding, 2 High đã sửa kèm test hồi quy (`request.ip` do client tự khai làm vô hiệu mọi hạn mức theo IP; snapshot phát nội thất city của mọi người chơi), 1 Low hardening (redact `password`). Ba việc còn treo cho owner: tiền đề của `ambush` (luật chơi), có bắt buộc `TRUST_PROXY` ở production hay không, và xác nhận lại chuỗi Caddy → Fastify trên stack thật (máy contributor không có Docker).

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

- [X] Desktop shell: top bar 56px (tài nguyên/score/đếm ngược mùa/connection pill), nav rail 64px, map trung tâm, context panel 360px, action bar 72px; dưới 1024px hiện thông báo “viewport desktop chưa được hỗ trợ”. — **superseded**: shell này (và cả thông báo “viewport desktop chưa được hỗ trợ”) không còn trong code. Hiện tại là Situation Room: `apps/client/src/layout.ts` có 3 band (`compact` <1024px, `medium` ≥1024px, `wide` ≥1440px), map luôn mounted và giữ một track chính, hai column (kingdom/activity) collapse được — ở band `compact` chúng thành flyout loại trừ nhau thay vì chặn viewport.
- [X] GameProvider: selection/interaction/active panel/connection/pending commands; `runCommand` với commandId client-mint, dedupe trùng lệnh đang bay dùng chung Promise/kết quả thật, timeout 10s → “uncertain” + nút “Thử lại” tái dùng cùng id và chặn double-retry, pending lưu sessionStorage theo player, logout xoá.
- [X] Toasts tự đóng sau 4s và không chặn pointer (không đè lên UI để click).
- [X] Validation trước khi gửi: logistics (cargo ≤ sức chứa depot, cargo ≤ kho, harvest ≤ còn lại, route/depot hợp lệ) và action bar (ownership, frozen, strength, tile, unit type, merge ≤ 500).
- [X] Pixi map theo layer với `Map<entityId, DisplayObject>`; terrain rebuild chỉ khi kingdom/terrain đổi; `setInteraction()` chuyển chế độ; pan/zoom giữ nguyên; dynamic import sau login; mọi chunk ≤ 500 KiB.
- [X] `protocolVersion: 1` trong snapshot: client khoá lệnh + băng cảnh báo khi lệch version.
- [X] Battle report: snapshot chỉ gửi 20 bản mới nhất mỗi viewer; `BATTLE_REPORT` live chỉ cho participant; `ATTACK_CANCELED` chỉ cho owner.
- [X] `GET /api/battles` keyset pagination (limit mặc định 20, clamp 1–50, cursor base64url `{createdAt,id}` với ISO timestamp + UUID strict, chỉ thấy trận mình tham gia); migration 014 partial index cho attacker/defender.
- [X] Phá hiệp ước bằng modal React có focus trap + Escape + mô tả “−150 danh tiếng”, thay cho `confirm()` native.
- [X] Drawer nâng cao (alliance/espionage/events/archive/diplomacy) lazy-load khi mở lần đầu.
- [X] Test matrix: client unit 76, server unit 117 (102 pass + 15 skip vì gate PostgreSQL), PostgreSQL (014 fresh/rerun/checksum + `/api/battles` dùng index + phân trang + cursor invalid + sống sót restart; chỉ bật integration bằng `RUN_POSTGRES_INTEGRATION` trong runner để gate chạy lặp an toàn), Playwright 18 test / 10 file = 10 gốc + 1 `[reset-world]` setup + 5 regression 7C + 2 layout Situation Room; `password-auth` là project riêng, chỉ chạy khi `E2E_PROD_SMOKE=1`. Năm regression 7C (double-submit dedupe không gửi HTTP thứ hai và nhận cùng kết quả thật, send fail → uncertain + “Thử lại” tái dùng cùng commandId/chặn double-retry, reload khôi phục pending uncertain, battle report chỉ tới participant, treaty modal focus trap/Escape/−150) + reset ở setup project và trước mỗi Chromium scenario (world riêng để khỏi chạm trần ~16 ô đặt thành phố trong một run, battle E2E dùng target dev có xác thực và vị trí deterministic để không phụ thuộc mob tự di chuyển/hết hạn, config env-driven `PLAYWRIGHT_API`/`PLAYWRIGHT_WEB`, webServer bật máy chủ riêng trên port do `PLAYWRIGHT_API` chỉ định), `check:bundle` ≤ 500 KiB, CI gate 8 chuyên cho bundle.
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
- [X] `verify:web-beta` và `drill:web-beta` vào `.github/workflows/ci.yml`: `npm audit` là gate 10 của job `verify`; `test:prod-smoke` và `drill:web-beta` là hai job riêng vì cần Docker — `prod-smoke` chạy trên `main`/`workflow_dispatch`/schedule, `recovery-drill` chạy `workflow_dispatch` + cron hằng tháng và upload `drill-report.md` làm artifact. **Chưa từng chạy xanh trên runner** — hai job này chưa quan sát được ở máy contributor (không có Docker).
- [ ] `infra/backup/backup.sh` và `restore.sh` chưa được kiểm chứng lần nào: drill dùng `docker compose exec postgres pg_dump` chứ không gọi hai script đã commit (custom format, retention 7 daily + 4 weekly, checksum vào `backup.log`, guard `BACKUP_ALLOW_LOCAL`). Drill kỳ sau (2026-10-02) nên đi qua đúng hai script đó.
- [ ] Rate-limit bucket dùng chung — **đã sửa sau 7D**, xem `feat/rate-limit-buckets`: 7D sửa hành vi `rate-limit.ts` nhưng không sửa key, nên mọi command vẫn đếm chung `write:<playerId>`.

**Tiêu chí hoàn thành:** `npm run verify:web-beta` xanh trên một runner có Docker; drill hằng tháng chạy và kết quả (RPO/RTO) vào `docs/OPERATIONS.md`; không route vận hành nào (`/metrics`, `/health/ready`, `/api/dev/*`) lộ ra ngoài Caddy.

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
2. Phase 7C: phiên manual acceptance (30–60 phút) rồi đóng phase.
3. Phase 7: chat/mail moderation, battle worker và Redis outbox publisher.
4. Bổ sung load test WebSocket/tick/queue/caravan và backup/restore runbook.
5. Giữ các gate regression: `npm run typecheck`, `npm run build`, `npm test`, Playwright Chromium desktop và PostgreSQL migrations.

## Quy tắc cập nhật

Sau mỗi feature/bugfix, cập nhật checkbox, trạng thái, test đã chạy và tài liệu domain liên quan. Không đánh dấu hoàn thành nếu chưa đạt tiêu chí nghiệm thu của phase.
