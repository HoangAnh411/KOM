# TODO — mục chưa tick trong `docs/ROADMAP.md` + việc phát sinh từ trạng thái repo

Chi tiết acceptance criteria / verification / files: [`tasks/plan.md`](./plan.md). Thứ tự thực thi đã chốt ở mục "Thứ tự thực thi" của plan: **Bước 0 = Z.1 (xong) → Bước 1 = Z.2–Z.4 (xong) → Bước 2 = P0.1 (xong) → Bước 3 = mở phạm vi (xong) → Bước 4 = B.1 (xong)**. Vòng 2026-09-03 thêm: **Bước 5 = PR.1 (xong) → Bước 6 = Z.5 (xong) → Bước 7 = B.1a S-5 (xong) → Bước 8 = P0.2 (xong) → Bước 9 = P0.3a + P0.3b (xong) → Bước 10 = UI-1 + UI-2 (xong) → Bước 11 = UI-3 + UI-4 (xong) → Bước 12 = UI-5 → UI-7 (xong)**.

Bối cảnh: tôi là **contributor**. Owner **đã push Phase 7D** (`f6085a4`, 2026-09-02) — xem mục "Phase 7D đã landing" bên dưới. Task chạm `apps/server/src/store.ts`, `apps/server/src/app.ts`, `packages/shared/src/index.ts` vẫn đánh dấu ⚠️ hot file; owner đã cho phép mở phạm vi nên P0.1 chạm `app.ts` và mục dọn nhỏ chạm `store.ts`, nhưng đều ở nhánh riêng, **không chạm `main`**.

**Cập nhật 2026-09-03:** owner đã chốt push, nên 16 commit giờ nằm ở **bốn PR chưa merge** (`main` vẫn ở `f6085a4`, không merge PR nào) — xem PR.1 bên dưới. Vòng code tiếp theo đã đi trên nhánh `perf/command-path` cắt từ `feat/rate-limit-buckets` và giờ là **PR #5** (base #3, 6 commit), nên chồng có **năm** PR. Vòng cải tổ HUD thêm **PR #6** (`feat/hud-overhaul`, base #5, 8 commit) → chồng thành **sáu**.

Gate mỗi PR: `npm run verify:web-alpha` + tick checkbox tương ứng trong `docs/ROADMAP.md`. 7D thêm gate mạnh hơn `npm run verify:web-beta` (có `npm audit --audit-level=high` + `test:prod-smoke`); N.2 đã nối nó vào CI thành hai job Docker, nhưng **chưa từng quan sát xanh** vì máy này không có Docker **và** vì `if:` của hai job đó không chạy từ push nhánh PR — cần `workflow_dispatch`. Ở máy này `test:postgres` chỉ skip (không Docker, không `DATABASE_URL`) → báo từng gate riêng, **không** viết "`verify:web-alpha` xanh".

Các nhãn `[NNN]` là **ID task ổn định** theo số dòng ROADMAP *trước* truth-pass 2026-09-02; sau Z.3 các dòng đó dịch ~+2.

## Phase Z — Việc phát sinh từ trạng thái repo ✅ (chạy 2026-09-02)

- [X] **Z.1** Đưa 43 file redesign Situation Room vào git: nhánh `feat/situation-room` từ `f6085a4`, 4 commit theo lớp — `9df0dea` design system (10 file) → `f3098cb` map/Pixi (6) → `f8116e9` Situation Room shell (17) → `90fb7a9` e2e selector role+name (10). Không push, không chạm `main`. Tại tip: typecheck sạch, shared 3/3, server 102 pass + 15 skip, client 76/76, build + `check:bundle` 6/6 chunk ≤ 500 KiB (pixi 465,0 KiB sát nhất), **e2e 18/18 pass**. `test:postgres` không chạy được ở máy này
- [X] **Z.2** `docs/OPERATIONS.md` mục "Kết quả drill" (`1687a53`): 2026-09-02, 3/3 pass, RPO 0 ms, RTO 5795 ms, kỳ hạn kế 2026-10-02, kèm caveat B.2b → **thay B.2**
- [X] **Z.3** `docs/ROADMAP.md` truth pass (`06d573a`): ngày, trạng thái 7C/7D, bỏ "Playwright desktop/mobile", đánh dấu desktop shell **superseded** bởi Situation Room (giữ tick), test matrix 35→76 / 102→117 / 16→18, **tick `[144]`**. Không thêm section 7D (N.1 là owner quyết), không tick `[204]`/`[141]`/`[145]`
- [X] **Z.4** `docs/API.md` truth pass (`b273629`): xoá hai hạn mức không tồn tại (read REST 60/phút, WS command 30/phút), sửa login thành 5/15 phút theo IP+username, bổ sung `register:`/`refresh:`/`admin:`, thêm 503 `DEPENDENCY_UNAVAILABLE`, ghi hợp đồng realtime (change-driven + coalesce trong tick 1000 ms) → **thay N.3**

### Checkpoint 0 — sau Phase Z

- [X] Hai nhánh tồn tại, tip xanh (typecheck + unit + 18 e2e + bundle)
- [X] `[144]` tick được và có số RPO/RTO trong runbook
- [X] `ROADMAP.md` / `API.md` không còn dòng khẳng định sai
- [ ] **Owner xem lại ba nhánh, quyết OQ #2 và xác nhận phạm vi N.1 / gating CI của N.2** — ba nhánh giờ là **PR #1–#3** (mở 2026-09-03, xem PR.1); phần chờ owner còn lại là review + OQ #2

### Checkpoint Z+ — sau khi mở phạm vi (2026-09-02, nhánh `feat/rate-limit-buckets`)

- [X] `npm run typecheck` sạch
- [X] `npm test`: shared 3/3, server **124 test → 109 pass / 0 fail / 15 skip** (postgres-gated; 121/106/15 sau P0.1, B.1 thêm 3), client 78/78
- [X] `npm audit --audit-level=high` exit 0
- [X] E2E full suite trên port 3100/5174 (không chạm stack dev của owner): **19/19 pass**, 2,1 phút
- [ ] `test:postgres` / `verify:web-beta` / `drill:web-beta`: **không chạy được ở máy này** (không Docker) — chỉ owner hoặc CI runner xác nhận được

## Vòng 2026-09-03 — đưa việc ra khỏi một máy + truth pass vòng 2

- [X] **PR.1** Push ba nhánh **nguyên trạng** (không rebase/squash/merge) + mở PR xếp tầng. Nhãn của plan là "D.1"; gọi **PR.1** ở đây để không lẫn với **D.1 `[130]`** nhóm scale. Kết quả: **#1** `feat/situation-room` (base `main`, 4 commit) → **#2** `docs/truth-pass` (base #1, 4 commit) → **#3** `feat/rate-limit-buckets` (base #2, 8 commit) → phát sinh **#4** `fix/postgres-test-isolation` (base `main`, 1 commit). Base từng PR kiểm bằng `gh pr view --json baseRefName` nên diff đúng 4/4/8, **không** nuốt commit của PR dưới. `main` không bị chạm, không PR nào được merge. Mỗi body ghi rõ gate nào xanh ở máy contributor và ba gate Docker **chưa từng quan sát được ở đây**
- [X] **PR.1a** Chẩn đoán hai gate CI đỏ và chứng minh **cả hai là flake có sẵn trên `main`**, không phải regression của stack:
  - **gate 5** `test:postgres` — `node --test *.integration.test.js` chạy một tiến trình cho mỗi file với concurrency mặc định, mọi file dùng **cùng một database**, và assertion cũ nói về *cả batch* (`report.failed`) chứ không về row đang test → hàng của file khác lọt vào. Bằng chứng không phải PR #1: `main` run `33479184803` đỏ ở `not ok 10`, PR #1 run `33660496854` đỏ ở `not ok 9`, và `git diff --stat main..feat/situation-room` chỉ chạm `apps/client/**` + `e2e/**`. **Đã sửa** ở PR #4 (`9b6bce0`): `--test-concurrency=1` trong `test-postgres.ts` + helper `only(ids, id)` thu hẹp 8 assertion về đúng id của test đó. Base `main` là cố ý — merge #4 trước thì cả stack xanh mà không phải rebase nhánh đã push
  - **gate 7** Playwright — NPC `mob_migration` ("Đám di cư · 90") đứng đúng ô mà `map-command.spec.ts:42` click nên inspector hiện NPC thay vì `Bộ binh · 10`. Đỏ ở `main` run `33505482280` và ở PR #2 `33660751567` / PR #3 `33660516946`; mỗi PR có hai run (`push` + `pull_request`) chia nhau một pass một fail — đúng dấu hiệu flake. **Chưa sửa**, đã ghi vào roadmap + OQ #12
- [X] **PR.1b** `gh workflow run ci.yml --ref perf/command-path` để `prod-smoke` + `recovery-drill` có lần quan sát đầu tiên. Hai job đó có `if:` giới hạn ở `main` / `workflow_dispatch` / `schedule` nên **push nhánh PR không bao giờ chạy chúng**. **Xong 2026-09-03**, run `33707793916`: `verify` 10/10 gate, `prod-smoke` **xanh** (docker compose prod build thật + Caddy TLS, `e2e/password-auth.spec.ts` 1/1, ba route vận hành trả 404 từ ngoài), `recovery-drill` **xanh** (3/3: Redis kill, game kill với outbox sống độc lập, backup → drop → restore; **RPO 0 ms, RTO 4439 ms**, artifact `drill-report` id `9875878326`). Số đo đã copy tay vào `docs/OPERATIONS.md` mục "Kết quả drill" — job không commit vào repo được. Đường **cron** (ngày 2 hằng tháng) vẫn chưa tự chạy lần nào
- [X] **Z.5** `docs/ROADMAP.md` truth pass vòng 2: ngày `2026-09-03`; đoạn trạng thái bốn PR chưa merge + hai gate CI đỏ là flake; test matrix server `117 (102+15)` → **`124 (109+15)`**, Playwright `18` → **`19 test / 10 file`** với **3** (không phải 2) test layout Situation Room, client giữ **78** (con số `76` cũ là sai — đã đo lại); **tick** mục rate-limit bucket (P0.1 `d1212b4`, PR #3, bốn bucket `write 20 / combat 10 / spy 5 / read 60`, `commandBuckets` ở `apps/server/src/app.ts`); mục load test `[141]` ghi rõ bị chặn bởi P0.2+P0.3+P0.4 và `k6` chưa cài; mục security review ghi **S-5 đã chốt**; **section mới** `## Command path và sức chứa (chặn load test [143])` sau Phase 7D với 5 mục chưa tick. **Không** đặt tên "Phase 7E" (số phase là của owner), **không** tick `[204]` / `[141]` / B.2b
- [X] **Z.5a** `tasks/plan.md` + `tasks/todo.md` cập nhật tại chỗ (cùng phạm vi công việc nên không tách file mới)
- [X] **Z.5b** `docs/SECURITY-REVIEW.md`: hàng S-5 `⚠️ owner quyết` → **`✅ đã sửa + test`**; mục S-5 ghi luật đã chốt + `file:line` của guard (`logistics.ts:16` `ambushRange`, `:42` `caravanTile`, `:192` guard, `app.ts:125` bucket) và đánh dấu phần "Chứng cứ" là trạng thái *lúc review*; hàng `ambush` của permission matrix cập nhật; item 1 của "việc còn treo cho owner" đã xoá, còn 5 item (S-9, S-1 trên stack thật, S-7, S-8, `npm audit`). Đóng cùng B.1a như đã hẹn
- **Bẫy đã gặp khi đo lại:** `npm test` trên code của `main` báo đỏ giả (`ENOENT tokens.css`, `.situation-room` không có rule) vì `apps/*/dist/*.test.js` còn sót từ nhánh feature — `tsc` không xoá output mồ côi. Phải `rm -rf apps/client/dist apps/server/dist packages/shared/dist` trước khi đo

### Checkpoint 1b — sau vòng 2026-09-03

- [X] **5** PR mở, base đúng, CI đã chạy; từng gate báo nguyên trạng kể cả đỏ
- [X] `docs/ROADMAP.md` không còn dòng khẳng định sai; checkbox rate-limit tick; section command path tồn tại
- [X] Chưa merge gì, chưa chạm `main`
- [X] Nhánh `perf/command-path` đã push, **PR #5** mở với base `feat/rate-limit-buckets` — 6 commit (Z.5 `dbf5c6f` + B.1a `b90fb59` + P0.2 `e22cde5` + P0.3a `97822af` + P0.3b `f94ac22` + docs `fa676c7`); CI của PR `33707700712` **10/10 gate xanh** (kể cả gate 5 `test:postgres` và gate 7 Playwright, hai gate đỏ ngẫu nhiên — một lần xanh không phải bằng chứng race đã hết)
- [X] typecheck sạch; server unit **141** (126 pass + 15 skip); client **78/78**; shared **3/3**; **19/19** e2e trên port 3100/5174 (config tạm đã xoá); `check:bundle` 6/6 chunk trong hạn (pixi 465.0 KiB)
- [X] `test:postgres` báo là **skipped ở máy này** (không Docker / `DATABASE_URL`) → **không** viết `verify:web-alpha` xanh dựa trên máy contributor. Nó **đã xanh trên CI** (gate 5 của run `33707700712`), và đó là chỗ duy nhất quan sát được — 15 test skip trong con số 141 chính là gate này
- [X] PR.1b: `prod-smoke` + `recovery-drill` có lần quan sát đầu tiên — run `33707793916`, cả hai xanh (RPO 0 ms / RTO 4439 ms)
- [ ] Còn lại cho owner: P0.4 (sức chứa map), S-9, xác nhận S-1 trên stack Caddy thật, S-7, S-8, flake gate 7, thứ tự merge **5** PR

## Phase 7D đã landing (`f6085a4`) — cập nhật 2026-09-02

7D là **production/beta hardening**, không phải gameplay. Đã có:

- `verify:web-beta` + `scripts/smoke-prod.mjs` + `e2e/password-auth.spec.ts`: dựng thật stack prod compose (Caddy TLS + PG + Redis + game + outbox), test register → build → reload giữ session, và assert `/health/ready` `/metrics` `/api/dev/*` trả 404 từ ngoài.
- `scripts/drill-web-beta.mjs` + `infra/backup/drill-report.md`: 3 drill tự động (Redis kill, game kill với outbox sống độc lập, backup→drop→restore có sentinel row). Kết quả 2026-09-02: cả 3 pass, RPO 0 ms, RTO 5795 ms.
- Security: Pino `redact` token/cookie; refresh cookie `Path=/api/auth`; origin check chặn cả request **thiếu** Origin; Caddy thêm CSP/HSTS/Referrer-Policy/Permissions-Policy/nosniff/X-Frame-Options; rate limiter **không còn fail-open** — Redis chết thì throw `DEPENDENCY_UNAVAILABLE` → HTTP 503.
- Metrics `http_requests_total`, `http_auth_failures_total`, `kingdom_websocket_auth_failures_total` + alert `KingdomsAuthFailures`.
- Broadcast coalesce (`requestBroadcast()` thay vì fan-out full snapshot mỗi command).

**`docs/ROADMAP.md` không được 7D sửa dòng nào** → roadmap hiện lệch với code. Ba việc phát sinh:

- [X] **N.1** Section `## Phase 7D — Production/Beta hardening` đã viết vào `docs/ROADMAP.md` (`acf454a`): goal, 8 mục đã tick (mỗi mục đối chiếu code: Caddyfile:28-33 headers, `KingdomsAuthFailures` trong `infra/alerts.yml`, `requestBroadcast()`, Pino `redact`, cookie `Path=/api/auth`, chặn request thiếu Origin), 2 mục chưa tick (B.2b `backup.sh`/`restore.sh` chưa chạy lần nào; bucket rate-limit dùng chung — đã sửa ở P0.1), tiêu chí đóng · **owner vẫn có quyền sửa lại phạm vi mục này**
- [X] **N.2** `verify:web-beta` + `drill:web-beta` đã vào `.github/workflows/ci.yml` (`acf454a`): thêm gate 10 `npm audit --audit-level=high` vào job `verify`, hai job Docker mới `prod-smoke` (main / dispatch / cron) và `recovery-drill` (dispatch / cron ngày 2 hằng tháng, upload `drill-report.md` làm artifact). ⚠️ **Chưa từng quan sát xanh** — máy này không có Docker; hai job đó chỉ chạy trên runner
- [X] **N.3** `docs/API.md` drift → **đã sửa ở Z.4** (`b273629`): bỏ "WebSocket command 30/phút" và "read REST 60/phút" (cả hai không tồn tại), login 5/15 phút theo IP+username, thêm 503 `DEPENDENCY_UNAVAILABLE`

## Phase P0 — Prerequisite (chặn mục 141, không có trong roadmap)

- [X] **P0.1** Tách rate-limit bucket (`d1212b4`): bảng `rateBuckets` (write 20 / combat 10 / spy 5 / read 60) + `commandBuckets` khai báo tập trung trong `app.ts`, key thành `${bucket}:${playerId}`, `attack` về bucket combat cùng `set-formation`. Bỏ hẳn tham số `rlLimit` ở 9 call site nên **một limit không thể lệch khỏi counter nó tiêu**. Hai phát sinh sửa kèm: (a) ba GET có auth giờ dùng bucket `read` chung 60/phút — trả lời OQ #7; (b) `rateLimited()` phân biệt `RATE_LIMITED` với `DEPENDENCY_UNAVAILABLE` nên Redis chết ở production trả **503 như `API.md` hứa**, trước đó throw ra ngoài `try` của `command()` và không có `setErrorHandler` → HTTP 500. Test: bucket độc lập trong `rate-limit.test.ts`, hai contract test trong `app.test.ts` (spy cạn không chặn build; read thứ 61 là 429)
- [X] **P0.2** (= S-4) Bỏ full-table reload `event_ledger` khỏi command path — **Bước 8 xong 2026-09-03**, server unit 128 → **132** (117 pass + 15 skip), typecheck sạch. Trước bản sửa: `store.ts:99` (command) + `store.ts:122` (moderation) gọi `await this.load()` **bên trong** transaction, `Store.load()` (`store.ts:72`) kết thúc bằng `ledger.load()`, và `EventLedger.load()` `SELECT` **cả bảng kể cả `payload` JSONB**, không `WHERE` không `LIMIT` → mỗi command trả tiền cho toàn bộ lịch sử season. Đã sửa bốn điểm: (1) command + moderation path gọi `load({ skipLedger: true })` → **0** truy vấn ledger trong transaction ngoài point query `WHERE command_id=$1`; (2) boot đọc **một cột có trần** `SELECT command_id … WHERE command_id IS NOT NULL ORDER BY created_at DESC LIMIT $1` (`event-ledger.ts:53`), không còn kéo `payload`; (3) `load()` **thôi xoá `this.events`** pending — trước đây vô hại vì mọi appender ở cùng slot `runExclusive`, nhưng là mìn cho appender mới; (4) `history` trim theo cùng window (`event-ledger.ts:19`). Trần là env mới `IDEMPOTENCY_WINDOW` (Zod `min 1000`, default `20000`) → `config.idempotencyWindow`, cũng là trần P0.3a dùng lại; đã ghi vào `.env.example`, `infra/.env.prod.example`, `docs/OPERATIONS.md`, `docs/API.md` mục protocol. `hasCommand()` giờ là **cache dương trong window**: miss rơi xuống point query + `event_ledger_command_idx` (migration 003) nên không mất bảo đảm; in-memory mode Set vẫn đầy đủ theo process. Test mới `event-ledger.test.ts` (4 test, pool giả) → **chạy được không cần Docker**; `app.test.ts:77` (`already_processed`), `store.test.ts:37/:88`, `moderation.test.ts:44` xanh không sửa assertion. `app.ts:151` (register) cố tình giữ `load()` đầy đủ: 3/giờ/IP và giờ full load cũng rẻ. p95 PostgreSQL **chưa đo** — không chạy được `test:postgres` ở máy này
- [X] **P0.3a** (= S-3, phần 1) Một registry dedupe có trần, thay ba Set `claim()` của repo — **Bước 9 xong 2026-09-03** (`97822af`), server unit 132 → **139** (124 pass + 15 skip), typecheck sạch. Đọc code thì S-3 rộng hơn bản ghi cũ: **năm** cơ chế dedupe song song, **ba** trong số đó bị sao chép **hai lần mỗi command** (`capture()` trước `pool.connect()` rồi `capture()` lại sau `load()` trong transaction) — `CombatRepository.commands` (6 call site), `LogisticsRepository.commands` (5), `OnboardingRepository.commands` (1). Đã sửa: `command-registry.ts` mới — Set trần FIFO dùng chung `config.idempotencyWindow` với `EventLedger` (P0.2) + journal `begin()`/`commit()`/`rollback()`/`forget()`; ba repo nhận registry qua constructor, `private claim()` chỉ còn delegate, **không đổi call site nào**. Rollback là một mảng rỗng mở ra thay cho ba Set copy 2×; `CombatRepository.capture()`/`restore()` **xoá hẳn** (Set đó là toàn bộ state ngoài `GameState` của nó), `logistics.capture()` bỏ field `commands`, `onboarding.capture()` chỉ còn `progress`. Chọn journal thay vì truyền danh sách id như plan viết, vì `claim()` nằm sâu trong method của repository nên store không quan sát được id nào vừa bị claim; `begin()` cố tình huỷ journal mồ côi (`runExclusive` serialize transaction nên tới được `begin()` nghĩa là command trước đã xong). Test mới `command-registry.test.ts` (7 test); test rollback có sẵn ở `store.test.ts` xanh không sửa assertion
- [X] **P0.3b** (= S-3, phần 2) Bỏ `state.processedCommands` khỏi JSONB — **Bước 9 xong 2026-09-03** (`f94ac22`), server unit 139 → **141** (126 pass + 15 skip), typecheck sạch. 14 chỗ chuyển sang registry: **11 cặp** check/push ở `diplomacy.ts`, `launchMission` + `activateCounterIntel` ở `espionage.ts`, `startBuild` ở `store.ts`; `DiplomacyRepository`/`EspionageRepository` nhận registry qua constructor. Bỏ field ở `types.ts`, bỏ `state.processedCommands = []` ở `season-reset.ts` — store gọi `commands.clear()` **sau khi reset đã bền** (sau COMMIT ở path PostgreSQL, ngay sau `hardReset` ở path in-memory), nên một season close bị rollback không xoá dedupe. Không migration cho một key: `Store.load()` destructure key cũ ra khỏi hàng đọc lên → `persistState` kế tiếp ghi lại hàng đã co. Ba thay đổi hành vi đã ghi vào commit body: (1) dedupe **claim tại chỗ check** thay vì push khi thành công — an toàn vì mọi command REST đi qua `command()` → `executeCommand` và rollback `forget()` đúng id đó, test mới `store.test.ts` "a build that fails on cost leaves its commandId claimable"; (2) id dẫn xuất `commandId + "-violate"` (tick `combat.ts`, ambush `logistics.ts`) mất dedupe **bền qua restart** — an toàn vì `breakTreaty` có guard cứng `TREATY_NOT_ACTIVE`, test mới `diplomacy.test.ts` "a retried break treaty is idempotent, not a second penalty" (cùng id hai lần chỉ trừ 150 reputation một lần); (3) `commands.clear()` khi đóng season giờ quên cả id combat/logistics/onboarding (trước đây ba Set đó sống qua ranh giới season) — PG mode vẫn được `event_ledger` + unique index chặn, in-memory mode yếu hơn sau một season close. `combat.test.ts` chuyển assert sang `store.commands.has("purs-8-violate")`
- [ ] **P0.4** Nâng sức chứa thành phố (map size thành hằng số chia sẻ, scale anchor) — ⚠️ hot file · **chờ owner quyết (OQ #2)** · M–L · 7D chỉ thêm guard `pool.ended` vào `store.ts`, trần ~16 city còn nguyên
- [ ] **P0.5** Sửa harness k6: phân bố tải đều trên user, xử lý 429 đúng nghĩa · S · deps P0.4 · 7D **không sửa file nào trong `e2e/loadtest/`**

### Checkpoint 1 — sau P0.1–P0.5

- [ ] `npm run verify:web-alpha` xanh
- [ ] Có số đo p95 command trước/sau P0.2 + P0.3
- [ ] Seed `LOADTEST_USERS` mục tiêu không throw `KINGDOM_FULL`
- [ ] **Owner review** (nhóm này chạm `store.ts` / `app.ts`)

## Phase A — Đóng Phase 7C

- [ ] **A.1** [204] Nửa máy đo được **đã xong** (`10c153d`): `apps/client/src/no-native-dialogs.test.ts` quét toàn bộ `apps/client/src` (bỏ comment trước khi quét, có test tự kiểm regex để guard không im lặng chết) + `docs/ACCEPTANCE-7C.md` — kịch bản 6 phần A–F, cố ý **loại** những gì test tự động đã phủ. Còn lại đúng một việc **người phải chạy**: phiên 30–60 phút rồi điền mục "Kết quả phiên", sau đó mới tick `[204]` · **owner tự chạy (OQ #1)**

## Phase B — Pre-beta Phase 7A

- [X] **B.1** [145] `docs/SECURITY-REVIEW.md` phủ auth / permissions / input / secrets — 10 finding có `file:line`, permission matrix 22 dòng, mục "kiểm soát đã xác nhận" và mục "rủi ro chấp nhận (dev mode)". Hai High **đã sửa kèm test hồi quy**: S-1 `TRUST_PROXY` boolean → `request.ip` lấy từ phần client tự khai của `X-Forwarded-For`, vô hiệu login 5/15m + register 3/h + refresh + admin (sửa thành số hop, test ở `security.test.ts` + `config.test.ts`); S-2 snapshot phát `resources`/`buildings`/`queues` của **mọi** city, làm mission `scout` vô nghĩa (che nội thất city người khác, test ở `app.test.ts`). Một Low hardening: redact `password`/`passwordHash`/`req.body.password`. `docs/API.md` có mục `## World snapshot` ghi hợp đồng mới; `[145]` đã tick · **việc treo owner**: ~~S-5 tiền đề `ambush`~~ → **owner chốt 2026-09-03**, thành B.1a ngay dưới; còn S-9 bắt buộc `TRUST_PROXY` ở production, S-1 xác nhận trên stack thật có Docker
- [X] **B.1a** (S-5) `ambush` phải có tiền đề không gian · S · ⚠️ chạm `app.ts` một dòng · **Bước 7 xong** — `ambushRange = 3` (`logistics.ts:16`), helper thuần **`caravanTile()`** (`:42`, export để test lerp trực tiếp) mirror `apps/client/src/map.ts:326-332` vì caravan **không có** `x`/`y`, guard ở `:192` đặt **sau** `INVALID_ATTACKER` **trước** `claim()` → army của người tấn công phải `!frozen`, `strength > 0`, Manhattan `<= 3` tới ô hiện tại của caravan, sai thì `AMBUSH_OUT_OF_RANGE` 400 và **không tiêu `commandId`**; `ambush: "combat"` vào `commandBuckets` (`app.ts:125`) → 10/phút, dùng chung counter với `attack`. Manhattan inline theo idiom `HARVEST_OUT_OF_RANGE`, không thêm util. Không đổi mã lỗi / schema / `PROTOCOL_VERSION`. Test: `logistics.test.ts` có helper `ambushScenario()` + test cũ đặt army `enemy` ở (8,9) + 4 test mới (out-of-range & `commandId` gửi lại được, biên 3 vs 4 & ô theo `progress` 0.6 → (11,10), `frozen`/`strength 0`, `caravanTile` mirror & fail closed); `app.test.ts` vòng combat luân phiên attack/formation/ambush → lệnh 11 và ambush đều 429, harvest vẫn qua. **Server unit 124 → 128 (113 pass / 0 fail / 15 skip)**, typecheck sạch. Chặt hơn plan gốc hai chỗ, cả hai có lý do trong `plan.md`: thêm `strength > 0` (army chết chỉ bị xoá ở tick sau, `combat.ts:320`) và fail closed khi route không resolve. E2E không chạm (không spec nào gọi `ambush`)
- [X] **B.2** [144] → **đóng ở Z.2 + Z.3**: drill đã chạy 2026-09-02 (3/3 pass, RPO 0 ms, RTO 5795 ms), kết quả + cadence + caveat đã vào `docs/OPERATIONS.md`, `[144]` đã tick
- [ ] **B.2b** Drill của 7D dùng `docker compose exec postgres pg_dump` (`scripts/drill-web-beta.mjs:120`), **không chạy `infra/backup/backup.sh` / `restore.sh`** đã commit → hai script đó (custom format, retention 7 daily + 4 weekly, checksum vào `backup.log`, guard `BACKUP_ALLOW_LOCAL`) vẫn chưa được kiểm chứng lần nào. Drill kỳ sau 2026-10-02 nên đi qua đúng hai script · S · cần Docker (OQ #4)
- [ ] **B.3** [141] Chạy load test 15 phút, lưu report, link từ `OPERATIONS.md` · S · deps P0.2–P0.5 · 7D thêm script `npm run test:load:full` nhưng **chưa có report** và blocker seed còn nguyên

### Checkpoint 2 — sau A.1 + B.1 + B.3

- [ ] `[204]`, `[141]` tick được, hoặc blocker ghi rõ (`[144]` đã tick ở Z.2/Z.3, `[145]` đã tick ở B.1)
- [ ] Report load test lưu và link từ `OPERATIONS.md`
- [ ] Phase 7C đóng; Phase 7A hết mục "trước beta"

## Phase UI — Cải tổ HUD, Situation Room vòng 2 (2026-09-03)

Owner nhờ cải thiện **toàn bộ UI/HUD**. Nhánh `feat/hud-overhaul` cắt từ tip `perf/command-path`, mỗi task một commit, sẽ mở **PR #6** base `perf/command-path`. **Không sửa file nào trong `apps/server` / `packages/shared`** → server unit phải đứng nguyên **141** (126 pass + 15 skip); không chạm `main`.

**Phần "push lên GitHub" của yêu cầu: lúc bắt đầu vòng không có gì để push.** `git fetch --all` rồi `git log --branches --not --remotes --oneline` → **rỗng**; sáu nhánh local đều đã có trên `origin`, working tree sạch, không nhánh nào ahead/behind, năm PR (#1–#5) đang mở nguyên trạng. Nên vòng này phát sinh đúng **một** nhánh mới để push — `feat/hud-overhaul`, đã push 2026-09-03 và mở [PR #6](https://github.com/HoangAnh411/KOM/pull/6) base `perf/command-path`.

Điểm khởi đầu không phải số không: vòng redesign trước **tự để lại ba mốc trong code** nói rõ phần còn thiếu — `ActivityColumn.tsx:6` ("PR4 replaces the whole `<ActivityFeed />` slot"), `CommandTray.tsx:17` ("PR5 fills it with contextual command groups"), bridge `.hud .kom-panel` ở `styles.css:120-124` ("It goes away with `.hud section` once the column is assembled from panels"). Lúc bắt đầu chỉ **3/13** bề mặt dùng design system.

- [X] **UI-1** Từ vựng + gate giá + selector pending (`bae7060`): `ui/vocabulary.ts` mới (`resourceLabels` phủ `keyof Resources` nên thêm resource là **lỗi compile**, `formatCost`/`formatCargo` một cách viết duy nhất thay ba cách cũ), `affordable(city, cost)` trong `validation.ts` trả `{ ok, reason }` nêu đúng loại tài nguyên thiếu, `pendingFor(pending, kind, match?)` trong `commands.ts` phân biệt hai lệnh cùng `kind` khác `body`. Consumer đầu tiên `StrategicHeader.tsx:43` (in `food`/`wood`/`stone`/`iron` thô trong UI tiếng Việt) — `data-testid="resource-*"` **không đổi** nên không spec nào phải sửa · S
- [X] **UI-2** Một implementation modal duy nhất (`1d1723a`): `ui/Modal.tsx` trích **nguyên** cơ chế của `TreatyBreakModal` (focus trap, Escape, restore focus, `aria-modal`), kéo `BattleReportModal` + hai modal inline của `ArmyPanel` vào. `role="dialog"` giờ chỉ tồn tại ở một file, có text scan khoá lại. E2E treaty (focus trap / Escape / −150) **xanh không sửa assertion** — bằng chứng primitive không làm rớt hành vi · M
- [X] **UI-3** Cột kingdom qua primitives (`b7ee0a4`): nav bỏ emoji `🏰 ⚔ 🚚 🕊` → `Icon` + `Button variant="ghost"`; bốn panel (`Onboarding`/`City`/`Army`/`Logistics`) dựng bằng `Panel`/`PanelHeader`/`PanelBody`; mọi nút khoá có `reason` nhìn thấy được (`CityPanel` trước đây cho bấm Xây khi thiếu tài nguyên rồi ăn 400 từ server); chip pending hiện **cạnh chính control đã phát lệnh**; **sửa hai bug state dùng chung** — `escortId` của `LogisticsPanel` và `targetId` của `ArmyPanel` từ một biến chung thành state theo từng hàng, trước đây chọn ở hàng 1 áp cho hàng 3 · L
- [X] **UI-4** Drawer qua primitives + **xoá rule bridge** (`a7434b6`): bốn bề mặt drawer migrate → **13/13** bề mặt dùng design system; `.hud section` **và** `.hud .kom-panel` xoá trong **một** commit (cặp này tự duy trì nhau: còn `.hud section` thì xoá bridge làm padding gấp đôi, còn bridge thì xoá `.hud section` không thấy gì đổi), `margin-top: 1rem` từng phát cho mỗi panel thay bằng `gap` của chính cột; raw enum (`event.eventType`, `treatyType`, `role`) thay bằng map wording **dùng chung** với UI-5; `DiplomacyPanel` hết nhảy `h2`→`h4`. `layout.test.ts` khẳng định **cả hai absence + bản thay thế** nên rule không mọc lại được. Phát sinh: `.pending-strip` (0,1,0) từng bị `.hud section` (0,1,1) đè nên render nổi thay vì hộp sunken nó tự khai — đọc specificity phát hiện, không phải nhìn màn hình · M
- [X] **UI-5** Cột hoạt động: feed thật suy từ client, lấp slot "PR4" (`c8a4f84`) · L · `activity.ts` thuần + `deriveActivity` gom bốn nguồn client **đã giữ** (pending transition, `reports`, `notices`, diff snapshot), ring trần 50 newest-first **dedupe theo id của chính sự việc** — không phải theo "đổi so với tick trước", đó là điều duy nhất giữ cho snapshot 2s/lần không sinh một hàng mỗi tick suốt phiên chơi; trả `previous` **theo identity** khi không có gì mới nên tick yên lặng không re-render. Mỗi `kind` một state + một icon + một wording dùng chung với `EventsPanel`. **Không** thêm route, không thêm event server, không sửa protocol. Quyết định đáng ghi: **quân đội không sinh hàng nào** — trận đánh đã về bằng battle report nói rõ ai thắng và còn bao nhiêu, thêm hàng từ diff `strength` là kể lại cùng một trận lần thứ hai và kém chính xác hơn. `openSurface` mới trong `layout.ts` vì `toggleSurface` sẽ **đóng** đúng cột mà hàng feed đang muốn nhảy vào; hàng không có anchor là text tĩnh, không phải `Button` bấm-không-đi-đâu. Panel "Cần chú ý" đặt **trên** feed: cột là thứ scroll, để panel đang chờ trả lời dưới 50 hàng lịch sử là chôn nó. `spyMissionLabels` dời từ `EspionagePanel` sang `vocabulary.ts` (hai map cho một enum là cách "Đánh cắp" thành "Trộm" ở màn hình khác)
- [X] **UI-6** Command tray: nhóm lệnh theo ngữ cảnh + cross-highlight, lấp slot "PR5" (`0895bd1`) · M · `tray-groups.ts` thuần chỉ **nhóm lại lệnh đã tồn tại** (move / attack / merge / cancel order / mở panel — không command server mới); lệnh không hợp lệ **khoá kèm lý do** thay vì ẩn, nên không builder nào filter list của mình; `.command-tray__reserved` cùng rule `display: none` đã xoá → band 900px giờ thấy cả nhóm lệnh; `panelForSelection` đưa selection trên map về đúng panel nên nav sáng `aria-current` sẵn có, **không** thêm method cho `WorldMap`, **không** re-key `MapSurface`. Ba luật khiến tray không cao thêm dòng thứ hai (map chia grid row với nó, và hộp map là thứ Pixi lấy kích thước canvas): `trayCommandLimit = 4`, title ≤ 26 ký tự, label ≤ 20 — vượt là **test đỏ**, không phải chữ bị tràn. Phát sinh từ kiểm mắt ở 900px: nửa phải đang **kể lại** nửa trái (`"Chưa chọn gì"` + `"Nhấp vào quân đội, thành phố hoặc ô đất"` in hai lần, mỏ in lại `còn 400/800`) nên cả hai bản ellipsis và cả strip mang một câu hai lần → 5 chỗ đổi wording + một luật test chuẩn hoá hoa/thường + dấu câu, so containment **hai chiều**, phủ mọi selection **và** hai mode giữa gesture
- [X] **UI-7** Chrome + accessibility pass (`d19cd0e`) · S · toast: `onClick` chết trên `<div>` (`.toast` có `pointer-events: none` theo yêu cầu roadmap dòng 199) thay bằng `Button` đóng thật với `pointer-events: auto` **chỉ trên nút**, layer thành `role="status"` + `aria-live="polite"`, Escape đóng cái mới nhất; `.hud-frozen` (`opacity: .5` + `pointer-events: none` — mất contrast **và** vẫn bấm được bằng bàn phím vì các nút còn trong tab order) thay bằng `<fieldset disabled>`, cơ chế duy nhất của platform thật sự khoá mọi control con, kèm `StatusChip state="frozen"` nói vì sao; `h1` sau login (trước đó `AuthScreen` là trang **duy nhất** có `h1`); `AuthScreen` dựng lại bằng primitives với label thật cho từng input; map toolbar sang `Button` + `Icon` + "Về giữa map" dùng `focusCity` đã có; `<button` thô hết sạch ngoài `ui/Button.tsx`; **"Build queues: N/2"** — chuỗi tiếng Anh cuối cùng người chơi đọc — sang tiếng Việt kèm **14** assertion e2e trong 6 spec (đếm bằng `git show`, không phải đoán). Bug nặng nhất của task lại không nằm trong danh sách: `.kom-panel { overflow: hidden }` cho panel min-height tự động **0**, nên trong cột flex có scroll trình duyệt bóp mọi panel lại vừa khung và `scrollHeight === clientHeight` → **cột kingdom không scroll được**, panel dưới cùng không tới được. `flex: none` cho con trực tiếp của ba cột sửa. Điều này chỉ thấy được khi chạy thật, đúng lý do plan bắt kiểm mắt ở 5 viewport

### Checkpoint A — sau UI-1 + UI-2 ✅

- [X] Không còn chuỗi giá viết tay; header hết key tiếng Anh
- [X] Cả 4 modal có focus trap + Escape + restore focus; `role="dialog"` chỉ ở `ui/Modal.tsx`
- [X] typecheck sạch, client unit xanh, e2e treaty regression xanh không sửa assertion

### Checkpoint B — sau UI-3 + UI-4 ✅

- [X] **13/13** bề mặt qua primitives; rule bridge `.hud .kom-panel` + `.hud section` **đã xoá**
- [X] Không nút khoá nào thiếu lý do; pending hiện tại chỗ control; bug `escortId`/`targetId` đã hết
- [X] typecheck sạch; shared **3**, server **141** (126 pass + 15 skip, **không đổi** — không sửa file server nào), client **101/101**
- [X] `check:bundle` 6/6 chunk ≤ 500 KiB; `AdvancedDrawer` vẫn lazy (chunk riêng 16.5 KiB)
- [X] E2E **20/21** trong một lần chạy full trên port 3100/5174; test thứ 21 (`phase7c` treaty break) **xanh khi chạy riêng** → đúng flake đã ghi ở mục "Việc dọn nhỏ", không phải regression. Config tạm đã xoá

### Checkpoint C — sau UI-5 + UI-6 + UI-7

- [X] `ActivityColumn` và nửa phải `CommandTray` không còn placeholder nào trong code — mọi lần "PR4"/"PR5"/bridge còn sót lại là **comment lịch sử** kể slot từng rỗng, hoặc **test khẳng định thứ đã xoá không mọc lại**
- [X] Ba comment "PR4" / "PR5" / "Bridge" **xoá khỏi source** cùng thứ chúng mô tả (bridge xong ở UI-4)
- [X] typecheck sạch; shared **3**, server **141** (126 pass + 15 skip, **không đổi** — không sửa file server nào), client **101 → 146** (cả vòng: **78 → 146**, e2e **19 → 28**)
- [X] `npm run build` sạch; `check:bundle` **6/6** chunk ≤ 500 KiB (pixi 465,0 KiB sát nhất); `AdvancedDrawer` vẫn lazy (chunk riêng 16,4 KiB)
- [X] E2E **28/28 trong một lần chạy full** (4,2 phút, 14 file spec + `password-auth` là project riêng không nằm trong số này) trên port 3100/5174 — **không** flake, không phải chạy lại spec nào riêng lẻ. Config tạm đã xoá cùng `test-results-e2e/`
- [X] Kiểm mắt ở 5 viewport (1920/1440/1280/1024/900) — tìm ra **hai** lỗi không test nào bắt được: cột kingdom không scroll (flex-shrink bóp panel) và tray in cùng một câu ở cả hai nửa. Cả hai đã sửa trong UI-7, cả hai giờ có test
- [X] Ma trận test ở `docs/ROADMAP.md` cập nhật **sau khi đo**, không sửa trước (vòng trước đã sai đúng lỗi này)
- [X] `test:postgres` báo **skipped** (không Docker / `DATABASE_URL`) → **không** viết `verify:web-alpha` xanh
- [X] Push `feat/hud-overhaul`, mở **PR #6** base `perf/command-path` → chồng thành **sáu** PR. Xong 2026-09-03: 8 commit (7 task + `597b921` docs), [PR #6](https://github.com/HoangAnh411/KOM/pull/6). `main` không bị chạm; base local trùng `origin/perf/command-path` (`b285293`) nên diff của PR đúng 8 commit đó, không lẫn commit của PR dưới

## Phase C — Feature debt

- [ ] **C.1** Espionage `misinformation` (caveat ROADMAP dòng 99 + "Bước tiếp theo" #1): mission type mới, méo `scout`, audit, counter-intel, expiry, baseline vào `GAME-DESIGN.md` · M · **baseline cần owner chốt? (OQ #5)**
- [ ] **C.2a** [89] Mail: migration, send/read, rate-limit bucket riêng, snapshot per-viewer · M · ⚠️ 7D
- [ ] **C.2b** [89] Chat theo kênh (kingdom / alliance) + lịch sử giới hạn · M · ⚠️ 7D
- [ ] **C.2c** [89] Moderation boundary: report / mute / block, ghi `admin_actions` · M · ⚠️ 7D

### Checkpoint 3 — sau C.1 + C.2

- [ ] Dòng 89 tick; caveat misinformation ở dòng 99 xoá
- [ ] `verify:web-alpha` xanh, có e2e cho chat/mail

## Phase D — Kiến trúc scale (XL, cần owner chốt hướng)

### Checkpoint 4 — **trước** khi mở nhóm D

- [ ] Owner chốt hướng persistence (thế giới hiện là một hàng JSONB `game_state` dưới một advisory lock)
- [ ] Có số đo baseline từ Checkpoint 1 để chứng minh nhu cầu
- [ ] D.1 đã được decompose theo domain, không bắt đầu như một PR duy nhất
- [ ] **D.1** [130] PostgreSQL repository riêng cho từng domain — XL, decompose: logistics → combat → espionage → diplomacy → onboarding → core city/player · deps P0.2, P0.3 + owner
- [ ] **D.2** [131] Shard theo `kingdom_id`, bỏ `state_key='kingdom'` — XL · deps D.1
- [ ] **D.3** [132] Stateless WS gateway + economy worker (tick ra khỏi tiến trình HTTP) — XL · deps D.1, D.2
- [ ] **D.4** [77] Battle worker tiêu thụ từ queue, giữ deterministic + luật report chỉ tới participant — L · deps D.3

## Phase E — Đa nền tảng (Phase 8)

### Checkpoint 5 — **trước** khi mở nhóm E

- [ ] Nhóm D xong, **hoặc** owner chấp nhận ship đa nền tảng trước khi scale server (OQ #3)
- [ ] **E.1** [216] Texture/asset optimization + bundle splitting, giữ mọi chunk ≤ 500 KiB · M
- [ ] **E.2** [212] PWA service worker + offline shell, **không cache snapshot gameplay** · M · deps E.1
- [X] **E.3-pre** Band `compact` (<1024px) **đã được lái trong browser thật** (`afa072b`): thêm size thứ năm 900x800 vào vòng lặp có sẵn + một test riêng cho hành vi flyout. Không copy-paste assertion của band có track (`map.x === kingdom.w` ở compact pass vì cả hai bằng 0, tức pass vì lý do sai): band này khẳng định map chiếm cả hàng khi đóng, flyout neo **lên trên** map khi mở, hai flyout loại trừ nhau, không sinh scroll ngang, Pixi không remount. `login()` nhận thêm `contextVisible` vì mốc "shell đã dựng" ở compact phải là nút toggle trong header
- [ ] **E.3** [215] Touch/safe-area/viewport nhỏ — còn lại: touch pan/zoom trên map Pixi, safe-area inset, e2e mobile project (phần layout responsive đã được Situation Room làm gần hết) · L · deps E.3-pre
- [ ] **E.4** [213] Capacitor iOS/Android shell · L · deps E.2, E.3 + **owner cấp bundle ID / signing**
- [ ] **E.5** [214] Tauri desktop shell · M · deps E.2
- [ ] **E.6** [217] Crash reporting opt-in + policy nâng `PROTOCOL_VERSION` + update strategy · M · deps E.2
- [ ] **E.7** [218] Store listing / privacy policy / terms · M · deps E.4, E.6 · **owner quyết (pháp lý)**

## Phase F — Monetization guardrails

- [ ] **F.1 + F.3** [227] [229] Cosmetic catalog versioned trong `packages/shared` + test chặn power field — **một PR** để guardrail có hiệu lực từ đầu · M
- [ ] **F.2** [228] Battle pass chỉ cosmetic/title · M · deps F.1
- [ ] **F.4** [230] Thêm yêu cầu audit review monetization vào `docs/CONTRIBUTING.md` · XS · deps F.1

## Phase G — Asset roadmap

- [ ] **G.1** [239] Art style guide (palette, isometric perspective, tile size, ngưỡng readability) → `docs/ASSETS.md` · S
- [ ] **G.2** [237] Chọn pack license rõ ràng (CC0/CC-BY; không NC/ND/không rõ) · S · deps G.1
- [ ] **G.3** [238] Bảng URL/tác giả/license/version từng file trong `assets/CREDITS.md` + script check trong CI · S · deps G.2
- [ ] **G.4** [240] AI portrait concept, ghi rõ công cụ + license đầu ra · M · deps G.1, G.2
- [ ] **G.5** [241] Blender low-poly pipeline — **có điều kiện**, chỉ mở nếu kết luận 2D không đủ readability · L · deps G.3

## Việc dọn nhỏ (kèm vào PR liên quan, không phải mục roadmap)

Ba mục đầu **đã xong** trong `4817d1a`.

- [X] `militaryScore()` bỏ im lặng `strengthDestroyed` / `strengthLost` / `defeats` → **không phải code chết**: `combat.ts` ghi và persist, `buildSeasonAnalytics` phát đi; chúng chỉ nằm ngoài công thức điểm. Đổi công thức là quyết định thiết kế (`docs/GAME-DESIGN.md`) nên chỉ thu hẹp fallback ở call site cho đúng 4 field công thức đọc, kèm comment nói rõ vì sao — không tự đổi luật tính điểm
- [X] `buildingCosts` trong `store.ts` trùng `gameRules.buildings` → giờ derive từ shared; test mới trong `store.test.ts` đi qua từng building, khẳng định tài nguyên bị trừ và thời gian queue đúng bằng `cost`/`durationSeconds`
- [X] `infra/migrations/README.md` dừng ở `011` → viết lại: chỉ sang `npm run db:migrate` (hướng dẫn cũ `psql -f` **bỏ qua runner**, để `schema_migrations` rỗng và khiến `db:migrate:check` báo toàn bộ pending), giữ danh sách `001`–`014` làm manifest để review
- [ ] Playwright chạy in-memory (`AUTH_MODE=dev`, không `DATABASE_URL`) → **7D đã bù một phần**: `e2e/password-auth.spec.ts` chạy thật với password auth + PostgreSQL qua prod compose, nhưng chỉ bật khi `E2E_PROD_SMOKE=1` và không nằm trong CI. Suite Chromium mặc định vẫn in-memory
- [ ] **Mới:** flake mới trong full-suite run — `situation-room.spec.ts` "collapsing a column" đỏ ở `login()` vì `.map canvas` chưa xuất hiện trong 5 s (chunk pixi import động + WebGL context, ở cuối một lần chạy 19 test). `afa072b` nới riêng wait đó lên 15 s vì test không hề khẳng định canvas tới nhanh; run lại **19/19 pass**. Nếu tái diễn thì nghi vấn tiếp theo là số WebGL context sống đồng thời của Chromium, không phải layout
- [ ] **Mới (2026-09-03, CI gate 7):** `map-command.spec.ts:42` assert `Bộ binh · 10` nhưng NPC `mob_migration` ("Đám di cư · 90") có thể đứng đúng ô spec click nên inspector hiện NPC → đỏ. **Đỏ trên cả `main`** (run `33505482280`), không phải regression của stack. Hai hướng sửa đều là quyết định về ý nghĩa spec (chọn ô không có NPC, hay assert theo `data-testid` của army thay vì text inspector) → OQ #12, **chưa có PR**
- [ ] **Mới (S-7):** `/api/admin/player/{ban,unban}` là hai route duy nhất không đi qua Zod — `playerId` chỉ được `as string` cast, `reason` chỉ có sàn `length >= 3` mà không có trần, nên một `reason` 64 KB (đúng `bodyLimit`) vào audit trail mỗi lần ban. Không có injection (SQL tham số hoá, `findPlayer` là scan in-memory). Sửa: schema Zod trong `packages/shared`, `reason` ≤ 500 ký tự, `playerId` là UUID → **gộp vào PR admin kế tiếp** (C.2c moderation là chỗ tự nhiên)
- [ ] **Mới (S-8):** không có trần số WebSocket connection theo IP hay tổng; mỗi socket chưa auth giữ một timer 5 s + interval ping 30 s. `maxPayload: 8192` và "bỏ mọi frame sau AUTH" đã chặn đường bơm việc, nên phần còn lại chỉ là cạn socket. Sửa: trần `clients.size` + giới hạn connection/IP — **con số cần owner chốt** theo mục tiêu 100 người chơi đồng thời
- [ ] **Mới (S-10):** `ADMIN_DISABLED` trả 404 ở `moderate()` nhưng 503 ở `/api/admin/season/close` cho cùng điều kiện thiếu token. Không phải lỗ hổng; nếu thống nhất thì về 404 (không tiết lộ route tồn tại) — gộp vào PR admin kế tiếp

## Open questions cần owner trả lời trước khi bắt đầu

1. ~~Phạm vi Phase 7D~~ → **đã rõ sau `f6085a4`**: 7D là production/beta hardening (prod smoke gate, recovery drill, security headers, fail-closed rate limiter, auth metrics). 7D **không** chạm mục 204, không chạm nhóm P0, không chạm gameplay. Câu hỏi còn lại: owner có coi 7D là đã đóng, và có muốn thêm section 7D vào roadmap (N.1)?
2. Sức chứa thế giới: mở rộng map cho 100+ người, hay giữ 20×20 và hạ mục tiêu load test? (100 chỉ là default trong `loadtest-seed.ts`)
3. Thứ tự nhóm D vs nhóm E?
4. Contributor có quyền chạy prod compose / backup / k6? (7D chứng minh drill chạy được trên máy owner — cần biết máy tôi có Docker đủ để chạy `verify:web-beta` không)
5. Misinformation baseline do owner chốt hay contributor đề xuất trong PR?
6. `verify:web-beta` có nên vào CI không (N.2), hay owner cố ý giữ nó là gate chạy tay vì cần Docker-in-Docker?
7. ~~Có thêm rate-limit cho GET route không?~~ → **đã quyết trong P0.1** (owner mở phạm vi "làm hết tất cả"): ba GET có auth dùng chung bucket `read` 60/phút/player. Chọn 60 vì một vòng reconnect chỉ tốn 3 call, nên client bình thường không tới gần trần; test khẳng định 60 read pass và cái thứ 61 là 429. Owner muốn hạ/nâng thì chỉ sửa một số trong `rateBuckets`
8. ~~ba nhánh đang chờ review — merge theo thứ tự nào, và có muốn tôi mở PR hay owner tự lấy?~~ → **đóng 2026-09-03**: owner chốt "push cả ba nhánh + mở 3 PR". Đã push nguyên trạng và mở PR #1–#3 xếp tầng, cộng PR #4 phát sinh. Câu hỏi còn lại về **thứ tự merge** chuyển thành OQ #13
9. **Mới:** hai job CI Docker (`prod-smoke`, `recovery-drill`) chỉ chạy được trên runner — owner xem lại `if:` gating và cron ngày 2 hằng tháng có đúng ý không, vì tôi không quan sát được chúng xanh. **Cập nhật 2026-09-03 (đóng phần quan sát):** `if:` của chúng không khớp push nhánh PR nên năm PR **không** kích hoạt chúng lần nào; đã chạy `gh workflow run ci.yml --ref perf/command-path` → run `33707793916` (`workflow_dispatch`, ref `perf/command-path`): `verify` 10/10 gate, `prod-smoke` **xanh** (compose prod build thật, `password-auth` 1/1), `recovery-drill` **xanh** (3/3 drill, RPO 0 ms, RTO **4439 ms**, artifact `drill-report`). Câu hỏi còn lại cho owner **chỉ còn là ý định**: `if:` cố ý giới hạn `prod-smoke` ở `main`/dispatch/schedule và `recovery-drill` ở dispatch/schedule có đúng ý không, và cron ngày 2 hằng tháng (đường cron **vẫn chưa** tự chạy lần nào)
10. ~~**(S-5)** `ambush` không có tiền đề không gian nào~~ → **đóng 2026-09-03, owner chốt**: phải có quân trong bán kính Manhattan **3 ô** quanh vị trí caravan hiện tại, và `ambush` sang bucket **`combat`** (10/phút). Không thêm cost tài nguyên, không thêm cooldown ở vòng này. Bản thực thi là **B.1a**
11. **Mới (S-9, security review):** có thêm guard "production phải khai `TRUST_PROXY`" vào `config.ts` không? Để `false` sau Caddy thì mọi người chơi mang IP của Caddy, nên `register:<ip>` 3/giờ thành hạn mức **toàn cầu** — ba lần đăng ký đóng cửa đăng ký cả thế giới trong một giờ. Tôi không tự thêm vì guard đó sẽ chặn boot của một deployment phơi server trực tiếp mà tôi không kiểm chứng được. Kèm theo: S-1 cần owner xác nhận một lần trên stack thật (Caddy → Fastify) sau khi merge, vì máy tôi không có Docker nên chỉ chứng minh được nửa Fastify bằng `app.inject`
12. **Mới (2026-09-03):** flake gate 7 — sửa `map-command.spec.ts` bằng cách chọn ô không có NPC, hay bằng cách assert theo `data-testid` của army thay vì text inspector? Chưa mở PR vì cả hai là quyết định về ý nghĩa của spec, và nó đang đỏ **trên cả `main`** nên không chặn thêm PR nào
13. **Mới (2026-09-03):** thứ tự merge **5** PR. Đề xuất **#4 trước** (nó sửa gate 5 nên cả stack xanh theo, base là `main` nên không phải rebase gì), rồi #1 → #2 → #3 → **#5** theo đúng thứ tự tầng. Owner muốn squash từng PR hay giữ nguyên commit theo lớp?
