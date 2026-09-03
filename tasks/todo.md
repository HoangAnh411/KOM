# TODO — mục chưa tick trong `docs/ROADMAP.md` + việc phát sinh từ trạng thái repo

Chi tiết acceptance criteria / verification / files: [`tasks/plan.md`](./plan.md). Thứ tự thực thi đã chốt ở mục "Thứ tự thực thi" của plan: **Bước 0 = Z.1 (xong) → Bước 1 = Z.2–Z.4 (xong) → Bước 2 = P0.1 (xong) → Bước 3 = mở phạm vi (xong) → Bước 4 = B.1 (xong)**. Vòng 2026-09-03 thêm: **Bước 5 = PR.1 (xong) → Bước 6 = Z.5 (đang làm) → Bước 7 = B.1a S-5 → Bước 8 = P0.2 → Bước 9 = P0.3a + P0.3b**.

Bối cảnh: tôi là **contributor**. Owner **đã push Phase 7D** (`f6085a4`, 2026-09-02) — xem mục "Phase 7D đã landing" bên dưới. Task chạm `apps/server/src/store.ts`, `apps/server/src/app.ts`, `packages/shared/src/index.ts` vẫn đánh dấu ⚠️ hot file; owner đã cho phép mở phạm vi nên P0.1 chạm `app.ts` và mục dọn nhỏ chạm `store.ts`, nhưng đều ở nhánh riêng, **không chạm `main`**.

**Cập nhật 2026-09-03:** owner đã chốt push, nên 16 commit giờ nằm ở **bốn PR chưa merge** (`main` vẫn ở `f6085a4`, không merge PR nào) — xem PR.1 bên dưới. Vòng code tiếp theo đi trên nhánh `perf/command-path` cắt từ `feat/rate-limit-buckets`.

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
- [ ] **PR.1b** `gh workflow run ci.yml` bằng tay để `prod-smoke` + `recovery-drill` có lần quan sát đầu tiên. Hai job đó có `if:` giới hạn ở `main` / `workflow_dispatch` / `schedule` nên **push nhánh PR không bao giờ chạy chúng**. Lần thử trong phiên bị chặn bởi lỗi hạ tầng phân loại lệnh → **còn nợ**
- [X] **Z.5** `docs/ROADMAP.md` truth pass vòng 2: ngày `2026-09-03`; đoạn trạng thái bốn PR chưa merge + hai gate CI đỏ là flake; test matrix server `117 (102+15)` → **`124 (109+15)`**, Playwright `18` → **`19 test / 10 file`** với **3** (không phải 2) test layout Situation Room, client giữ **78** (con số `76` cũ là sai — đã đo lại); **tick** mục rate-limit bucket (P0.1 `d1212b4`, PR #3, bốn bucket `write 20 / combat 10 / spy 5 / read 60`, `commandBuckets` ở `apps/server/src/app.ts`); mục load test `[141]` ghi rõ bị chặn bởi P0.2+P0.3+P0.4 và `k6` chưa cài; mục security review ghi **S-5 đã chốt**; **section mới** `## Command path và sức chứa (chặn load test [143])` sau Phase 7D với 5 mục chưa tick. **Không** đặt tên "Phase 7E" (số phase là của owner), **không** tick `[204]` / `[141]` / B.2b
- [X] **Z.5a** `tasks/plan.md` + `tasks/todo.md` cập nhật tại chỗ (cùng phạm vi công việc nên không tách file mới)
- [ ] **Z.5b** `docs/SECURITY-REVIEW.md`: hàng S-5 từ `⚠️ owner quyết` → `✅ đã sửa + test`, ghi `file:line` của guard mới, xoá item 1 khỏi mục "việc còn treo cho owner" — **chờ B.1a xanh**, không tick trước
- **Bẫy đã gặp khi đo lại:** `npm test` trên code của `main` báo đỏ giả (`ENOENT tokens.css`, `.situation-room` không có rule) vì `apps/*/dist/*.test.js` còn sót từ nhánh feature — `tsc` không xoá output mồ côi. Phải `rm -rf apps/client/dist apps/server/dist packages/shared/dist` trước khi đo

### Checkpoint 1b — sau vòng 2026-09-03

- [X] 4 PR mở, base đúng, CI đã chạy; từng gate báo nguyên trạng kể cả đỏ
- [X] `docs/ROADMAP.md` không còn dòng khẳng định sai; checkbox rate-limit tick; section command path tồn tại
- [X] Chưa merge gì, chưa chạm `main`
- [ ] Nhánh `perf/command-path` (cắt từ `feat/rate-limit-buckets`) có 4 commit: B.1a, P0.2, P0.3a, P0.3b → PR #5 base `feat/rate-limit-buckets`
- [ ] typecheck sạch; server unit xanh (124 + test mới); client 78 + shared 3 xanh; 19 e2e xanh trên port 3100/5174; `check:bundle` ≤ 500 KiB/chunk
- [ ] `test:postgres` báo là **skipped** (không Docker) — tuyệt đối không viết `verify:web-alpha` xanh
- [ ] PR.1b: `prod-smoke` + `recovery-drill` có lần quan sát đầu tiên
- [ ] Còn lại cho owner: P0.4 (sức chứa map), S-9, xác nhận S-1 trên stack Caddy thật, S-7, S-8, flake gate 7, thứ tự merge 4 PR

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
- [ ] **P0.2** (= S-4) Bỏ full-table reload `event_ledger` khỏi command path — ⚠️ hot file · M · 7D không chạm · **Bước 8**. Đo lại từ code 2026-09-03: `store.ts:99` (command) + `store.ts:122` (moderation) gọi `await this.load()` **bên trong** transaction, `Store.load()` (`store.ts:72`) kết thúc bằng `ledger.load()`, và `EventLedger.load()` `SELECT` **cả bảng kể cả `payload` JSONB**, không `WHERE` không `LIMIT` → mỗi command trả tiền cho toàn bộ lịch sử season. Nó nạp hai chỗ: `history` — **`ledger.all()` có 6 call site và toàn bộ là test**, production không đọc lịch sử ledger — và `commandIds` cho fast path `hasCommand()` (`store.ts:95`). Authority thật ở PG mode là point query `SELECT 1 … WHERE command_id=$1` + partial unique index `event_ledger_command_idx` (migration 003, đã có). Sửa: `load()` chỉ `SELECT command_id` có `LIMIT <window>` (mặc định 20 000 = *idempotency window*), `load({ skipLedger: true })` ở command/moderation path, `load()` **thôi xoá `this.events`** pending, `hasCommand()` thành cache dương trong window. Test mới `event-ledger.test.ts` dùng pool giả → **chạy được không cần Docker**
- [ ] **P0.3a** (= S-3, phần 1) Một registry dedupe có trần, thay ba Set `claim()` của repo — ⚠️ hot file · M · deps P0.2 (dùng chung window) · **Bước 9**. Đọc code 2026-09-03 thì S-3 rộng hơn bản ghi cũ: **năm** cơ chế dedupe song song, và **ba** trong số đó bị sao chép **hai lần mỗi command** (`store.ts:96` capture cho rollback + `store.ts:99` `load()` dựng lại) — `CombatRepository.commands` (`combat.ts:104`, 6 call site), `LogisticsRepository.commands` (`logistics.ts:103`, 5), `OnboardingRepository.commands` (`onboarding.ts:92`, 1), cộng `state.processedCommands` bị `structuredClone` 2×. Không cơ chế nào có trần. Sửa: `command-registry.ts` mới (Set trần FIFO: `has` / `claim` / `forget(ids)` / `clear`), ba repo nhận registry qua constructor và `claim()` chỉ còn delegate — **không đổi call site nào**; rollback đổi từ copy cả Set sang `forget()` danh sách id đã claim trong transaction đó
- [ ] **P0.3b** (= S-3, phần 2) Bỏ `state.processedCommands` khỏi JSONB — ⚠️ hot file · M · deps P0.3a · **Bước 9**. Vì nó nằm trong `game_state` JSONB nên phình cả **trên đĩa**, không chỉ RAM. Chuyển sang registry: `store.ts:134` (build), `espionage.ts:52,53`, **11 cặp** check/push trong `diplomacy.ts` (41/56, 62/70, 76/92, 103/109, 114/117, 123/129, 134/139, 152/181, 188/209, 215/236, 242/260); bỏ field ở `types.ts:27`, bỏ reset ở `season-reset.ts:26`, **strip key cũ khi load** (`store.ts:72`) để hàng JSONB đang có co lại — một key không cần migration riêng. Một thay đổi hành vi phải ghi vào commit body: id dẫn xuất `commandId + "-violate"` (`combat.ts:246` từ tick `combat.ts:393`, và `logistics.ts:176`) mất dedupe **bền qua restart** — an toàn vì `breakTreaty` có guard cứng `TREATY_NOT_ACTIVE` (`diplomacy.ts:246`) và pursuit order tiêu ngay khi resolve
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
- [ ] **B.1a** (S-5) `ambush` phải có tiền đề không gian · S · ⚠️ chạm `app.ts` một dòng · **Bước 7**, đứng **trước** P0.3 để P0.3 không phải rebase `logistics.ts` hai lần. Hôm nay `logistics.ts:166-186` chỉ kiểm player active + caravan đang `moving` + không phải caravan của mình: không đòi quân, không đòi ở gần, không tốn gì, và chạy ở bucket `write` 20/phút (`ambush` không có trong `commandBuckets`, `app.ts:125`) → một người chơi xoá 60% hàng của **mọi** caravan trên map, từ bất kỳ đâu, miễn phí, và hệ thống hộ tống thành vô nghĩa. **Luật owner chốt:** phải có quân trong bán kính Manhattan **3 ô** quanh vị trí caravan hiện tại + `ambush` sang bucket **`combat`** (10/phút). Thực thi: helper thuần `caravanTile()` trong `logistics.ts` **mirror phép lerp của client** (`apps/client/src/map.ts:322-335`, vì caravan **không có** `x`/`y`) + comment trỏ chéo; guard đặt **sau** `INVALID_ATTACKER` và **trước** `claim()`/seed, đòi army `ownerPlayerId === attackerPlayerId` không `frozen` với Manhattan `<= 3`, sai thì `AMBUSH_OUT_OF_RANGE` → 400; Manhattan inline theo idiom `HARVEST_OUT_OF_RANGE` (`logistics.ts:111`), **không** thêm util mới; `ambush: "combat"` vào `commandBuckets`. Không đổi mã lỗi / schema / `PROTOCOL_VERSION`. Test: cập nhật `logistics.test.ts:42` (đặt army của `enemy` cạnh caravan) + out-of-range + biên 3/4 + frozen army + test bucket. E2E không bị ảnh hưởng (đã grep `e2e/`, không spec nào gọi `ambush`)
- [X] **B.2** [144] → **đóng ở Z.2 + Z.3**: drill đã chạy 2026-09-02 (3/3 pass, RPO 0 ms, RTO 5795 ms), kết quả + cadence + caveat đã vào `docs/OPERATIONS.md`, `[144]` đã tick
- [ ] **B.2b** Drill của 7D dùng `docker compose exec postgres pg_dump` (`scripts/drill-web-beta.mjs:120`), **không chạy `infra/backup/backup.sh` / `restore.sh`** đã commit → hai script đó (custom format, retention 7 daily + 4 weekly, checksum vào `backup.log`, guard `BACKUP_ALLOW_LOCAL`) vẫn chưa được kiểm chứng lần nào. Drill kỳ sau 2026-10-02 nên đi qua đúng hai script · S · cần Docker (OQ #4)
- [ ] **B.3** [141] Chạy load test 15 phút, lưu report, link từ `OPERATIONS.md` · S · deps P0.2–P0.5 · 7D thêm script `npm run test:load:full` nhưng **chưa có report** và blocker seed còn nguyên

### Checkpoint 2 — sau A.1 + B.1 + B.3

- [ ] `[204]`, `[141]` tick được, hoặc blocker ghi rõ (`[144]` đã tick ở Z.2/Z.3, `[145]` đã tick ở B.1)
- [ ] Report load test lưu và link từ `OPERATIONS.md`
- [ ] Phase 7C đóng; Phase 7A hết mục "trước beta"

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
9. **Mới:** hai job CI Docker (`prod-smoke`, `recovery-drill`) chỉ chạy được trên runner — owner xem lại `if:` gating và cron ngày 2 hằng tháng có đúng ý không, vì tôi không quan sát được chúng xanh. **Cập nhật 2026-09-03:** `if:` của chúng không khớp push nhánh PR nên bốn PR **không** kích hoạt chúng lần nào; cần `workflow_dispatch` (PR.1b, còn nợ)
10. ~~**(S-5)** `ambush` không có tiền đề không gian nào~~ → **đóng 2026-09-03, owner chốt**: phải có quân trong bán kính Manhattan **3 ô** quanh vị trí caravan hiện tại, và `ambush` sang bucket **`combat`** (10/phút). Không thêm cost tài nguyên, không thêm cooldown ở vòng này. Bản thực thi là **B.1a**
11. **Mới (S-9, security review):** có thêm guard "production phải khai `TRUST_PROXY`" vào `config.ts` không? Để `false` sau Caddy thì mọi người chơi mang IP của Caddy, nên `register:<ip>` 3/giờ thành hạn mức **toàn cầu** — ba lần đăng ký đóng cửa đăng ký cả thế giới trong một giờ. Tôi không tự thêm vì guard đó sẽ chặn boot của một deployment phơi server trực tiếp mà tôi không kiểm chứng được. Kèm theo: S-1 cần owner xác nhận một lần trên stack thật (Caddy → Fastify) sau khi merge, vì máy tôi không có Docker nên chỉ chứng minh được nửa Fastify bằng `app.inject`
12. **Mới (2026-09-03):** flake gate 7 — sửa `map-command.spec.ts` bằng cách chọn ô không có NPC, hay bằng cách assert theo `data-testid` của army thay vì text inspector? Chưa mở PR vì cả hai là quyết định về ý nghĩa của spec, và nó đang đỏ **trên cả `main`** nên không chặn thêm PR nào
13. **Mới (2026-09-03):** thứ tự merge 4 PR. Đề xuất **#4 trước** (nó sửa gate 5 nên cả stack xanh theo, base là `main` nên không phải rebase gì), rồi #1 → #2 → #3 theo đúng thứ tự tầng. Owner muốn squash từng PR hay giữ nguyên commit theo lớp?
