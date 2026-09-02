# Implementation Plan: backlog `docs/ROADMAP.md` + thứ tự thực thi

> Lập ngày 2026-09-02, cập nhật cùng ngày sau khi Phase 7D landing. Checklist thực thi: [`tasks/todo.md`](./todo.md).

## Overview

**Kingdoms of Meridian** — game chiến thuật realtime, server-authoritative (React + PixiJS client, Fastify + `ws` server, `packages/shared` giữ Zod contract).

Người lập kế hoạch này là **contributor**, không phải owner. **Phase 7D đã landing** ở `f6085a4` (2026-09-02, local `main` == `origin/main`): production/beta hardening — `verify:web-beta`, `scripts/smoke-prod.mjs`, `scripts/drill-web-beta.mjs`, rate limiter fail-closed (503 `DEPENDENCY_UNAVAILABLE`), Caddy security headers, auth-failure metrics, broadcast coalesce. Chi tiết ở mục "Phase 7D đã landing" của `tasks/todo.md`. 7D **không** chạm gameplay, không chạm nhóm P0 và **không sửa dòng nào của `docs/ROADMAP.md`**.

Mục tiêu ban đầu của tài liệu: mỗi mục `- [ ]` còn lại có một task với acceptance criteria, cách verify và dependency. Bản cập nhật này thêm phần còn thiếu: **thứ tự thực thi** (mục ngay dưới) và nhóm Z — việc phát sinh từ trạng thái thật của repo chứ không từ roadmap.

Các nhãn `[NNN]` dưới đây là **ID task ổn định**, lấy theo số dòng `ROADMAP.md` *trước* truth-pass ngày 2026-09-02. Sau Z.3 các dòng đó dịch khoảng +2 và `[144]` đã được tick; đừng dùng nhãn như con trỏ dòng sống.

24 mục còn chưa tick (25 ban đầu, trừ `[144]` đã đóng ở Z.2):

| Nhóm | Dòng trong ROADMAP.md | Số |
|---|---|---|
| Phase 3 | 77 | 1 |
| Phase 4 | 89 | 1 |
| Phase 7A | 130, 131, 132, 141, 145 (`144` đã tick ở Z.2) | 5 |
| Phase 7C | 204 | 1 |
| Phase 8 | 212–218 | 7 |
| Monetization | 227–230 | 4 |
| Assets | 237–241 | 5 |

Ngoài roadmap, bản audit trước tìm được **5 blocker trong code** khiến mục 141 (load test) không chạy được. Chúng thành nhóm **P0** vì thiếu chúng thì 141 fail ngay ở bước seed, không phải fail vì hiệu năng.

## Thứ tự thực thi (chốt 2026-09-02)

Ba bước. Không mở nhóm C/D/E/F/G lúc này.

| Bước | Nội dung | Vì sao đứng ở đây | Trạng thái |
|---|---|---|---|
| **0** | **Z.1** — đưa 43 file redesign Situation Room vào git | Đó là công việc đã hoàn thành nhưng chỉ tồn tại trong working tree, không xuất hiện ở roadmap hay plan cũ. Rủi ro lớn hơn mọi mục roadmap còn lại | **Xong** — nhánh `feat/situation-room`, 4 commit |
| **1** | **Z.2 → Z.4** — làm tài liệu khớp code | Doc-only, không chạm file nóng, nên không cần chờ owner; và đóng được một checkbox roadmap thật (`[144]` — drill đã chạy, chỉ thiếu ghi vào runbook) | **Xong** — nhánh `docs/truth-pass`, 3 commit |
| **2** | **P0.1** — tách rate-limit bucket | Task server duy nhất nên làm ngay: 7D vừa chạm `rate-limit.ts` nên khả năng xung đột thấp nhất, và limiter fail-closed làm 429-sai-bucket dễ nổ hơn trước. Mở đường cho B.1 `[145]` | **Xong** — nhánh `feat/rate-limit-buckets`, `d1212b4` |
| **3** | Mở rộng theo yêu cầu owner ("làm hết tất cả"): **N.1**, **N.2**, nửa tự động của **A.1**, **E.3-pre**, ba việc dọn nhỏ | Đều là việc đã có đủ dữ kiện để làm đúng, không cần quyết định thiết kế mới. Những mục còn lại bị chặn bởi Docker/`k6`/quyết định gameplay thì **không** làm dở dang | **Xong** — cùng nhánh, `acf454a` `10c153d` `afa072b` `4817d1a` |

Còn chặn thật, đã báo thay vì làm dở: **P0.4** (sức chứa thế giới — quyết định gameplay, OQ #2), **P0.5 + B.3** `[141]` (không `k6`), **B.2b** + hai job CI mới (không Docker), **A.1** phần phiên tay 30–60 phút (người phải chạy), nhóm **D** (owner chốt hướng persistence), phần lớn **Phase 8** và **G.2–G.5** (bundle ID, signing, license).

Lý do **không** đảo Bước 1 lên trước Bước 0: mọi verification của Bước 1 (số test, band layout) đọc từ code trong working tree; nếu tree mất thì tài liệu vừa viết cũng sai theo.

Lý do **không** đưa P0.2–P0.5 vào Bước 2: P0.2/P0.3 chạm `store.ts` sâu và cần số đo p95 trước/sau, nên nên đi sau khi P0.1 tạo tiền lệ owner-review; P0.4 chờ owner quyết (OQ #2); P0.5 phụ thuộc P0.4 và `k6` chưa cài trên máy này.

## Nhóm Z — Việc phát sinh từ trạng thái repo (không có trong roadmap)

Đặt ngay đây, trước phần tham chiếu, vì đây là **trạng thái hiện tại**: Z.1–Z.4 đã chạy xong hôm nay. Các nhóm P0/A/B/C/D/E/F/G bên dưới vẫn là backlog.

### Z.1 — Đưa Situation Room redesign vào git ✅

43 file redesign (20 modified + 23 untracked, +783/−646) nằm trên 7D và không xuất hiện ở `docs/ROADMAP.md` hay bản plan gốc. Đã đưa lên nhánh `feat/situation-room` cắt từ `f6085a4`, **không** push, **không** chạm `main`, 4 commit theo thứ tự phụ thuộc suy ra từ import graph nên mỗi commit typecheck được:

| Commit | Nội dung | File |
|---|---|---|
| `9df0dea` | design system (token, primitive, variant, icon) | 10 |
| `f3098cb` | map geometry/label + `MapSurface` + `vite.config.ts` tách chunk pixi | 6 |
| `f8116e9` | Situation Room shell (`layout.ts`, 3 column, `App.tsx`, 7 panel) | 17 |
| `90fb7a9` | e2e reconciliation sang selector role + accessible name | 10 |

- [X] 4 commit; `main` không bị chạm; không push
- [X] Tại tip: `typecheck` sạch; `npm test` = shared 3/3, server 102 pass + 15 skip (postgres-gated), client 76/76; `build` + `check:bundle` 6/6 chunk ≤ 500 KiB (pixi 465,0 KiB sát nhất — đúng lý do C2 tách nó ra); `test:e2e` **18/18 pass trong 2,6 phút**, gồm cả hai spec hay flake
- [X] `git diff --check` sạch; không đổi line ending; không commit secret
- **Giới hạn đã ghi rõ:** thứ tự 4 commit được kiểm bằng import analysis, chỉ **tip** là trạng thái đã chạy thật; message của `f8116e9` nói thẳng e2e chỉ xanh từ commit sau. `test:postgres` không chạy được ở máy này → **không** có claim `verify:web-alpha` xanh.

### Z.2 — Ghi kết quả drill vào runbook → đóng `[144]` ✅ `1687a53`

`docs/OPERATIONS.md` tự yêu cầu "ghi kết quả (file, thời gian, kết quả) vào runbook" nhưng không ghi kết quả nào, dù `infra/backup/drill-report.md` đã có sẵn. Gộp luôn B.2 và B.2b.

- [X] Mục "Kết quả drill": 2026-09-02, link report, 3/3 pass, RPO 0 ms, RTO 5795 ms, kỳ hạn kế 2026-10-02
- [X] Caveat B.2b ghi thẳng vào runbook: `scripts/drill-web-beta.mjs:120` dùng `docker compose exec postgres pg_dump`, nên `infra/backup/backup.sh` / `restore.sh` **vẫn chưa được kiểm chứng lần nào** — drill tháng sau nên đi qua đúng hai script đó
- [X] Tick `[144]` trong `ROADMAP.md` (ở Z.3)

### Z.3 — ROADMAP truth pass ✅ `06d573a`

Chỉ sửa chỗ **khẳng định sai**, **không** tự thêm section 7D (N.1 là quyết định của owner).

- [X] Ngày cập nhật; trạng thái 7C (còn đúng một mục manual) + 7D đã landing ở `f6085a4`; nêu tên hai việc owner quyết (N.1, N.2)
- [X] "Playwright desktop/mobile": project `mobile` đã bỏ từ 7C → suite là Chromium desktop, `password-auth` gated `E2E_PROD_SMOKE=1`
- [X] Mục desktop shell: **giữ tick**, đánh dấu superseded — shell 56/64/360/72px và thông báo "viewport desktop chưa được hỗ trợ" không còn trong code; hiện là Situation Room với `layout.ts` 3 band (`compact` <1024, `medium` ≥1024, `wide` ≥1440)
- [X] Test matrix: client 35 → 76, server 102 → 117 (102 pass + 15 skip), Playwright "16 scenario" → 18 test / 10 file
- [X] Tick `[144]`; **không** tick manual acceptance `[204]`, load test `[141]`, security review `[145]`
- [X] Thay tham chiếu "dòng N" trong prose bằng tên mục để khỏi lệch khi file dịch dòng

### Z.4 — API.md truth pass ✅ `b273629`

Bốn khẳng định sai đã kiểm từng dòng trên `apps/server/src/app.ts`, cộng một mã lỗi thiếu và hợp đồng realtime chưa được ghi.

- [X] "Read REST 60/phút/player" — **không GET route nào bị limit**: đúng 7 call site `rateLimited(`, tất cả POST
- [X] "WebSocket command 30/phút/player" — xoá: sau `AUTH` server `if (authenticated) return` với mọi frame, không có đường command nào để limit
- [X] spy 5 / combat 10 "khi được bật" — nói thật là hiện dùng chung counter `write:${playerId}`, trỏ tới P0.1 là bản sửa
- [X] "Login 10/phút/IP" → password mode 5 lần / 15 phút theo **IP + username**; dev 30/phút/IP; bổ sung `register:` 3/giờ, `refresh:` 30/phút, `admin:` 10 và 5/phút; mỗi hạn mức kèm `file:line`
- [X] Thêm 503 `DEPENDENCY_UNAVAILABLE` (limiter fail-closed của 7D) và ghi chú fail-closed
- [X] Mục WebSocket: push là change-driven + coalesce trong một tick (`tickMs` 1000 ms) → command→push ≤ ~1 tick (đo 0,2–1,0 s trên dev in-memory); không có trickle tài nguyên thụ động

### Checkpoint 0 — sau Bước 0 + Bước 1 ✅

- [X] `feat/situation-room` tồn tại, 4 commit, tip xanh (typecheck + unit + 18 e2e + bundle)
- [X] `[144]` tick được và có số RPO/RTO trong `OPERATIONS.md`
- [X] `ROADMAP.md` không còn dòng nào khẳng định sai; không tự thêm section 7D
- [X] `API.md` không còn hạn mức không tồn tại; có 503
- [X] Không chạm `store.ts` / `app.ts` / `packages/shared` → chưa cần owner review
- [ ] Owner xem lại hai nhánh và quyết N.1 / N.2 / OQ #2

## Architecture Decisions

- **Nhóm Z đi trước nhóm P0.** Việc đã hoàn thành nhưng chưa vào git (43 file redesign) là rủi ro cao hơn mọi mục roadmap còn lại, và tài liệu lệch code làm mọi ước lượng sau đó sai theo. Cả hai đều rẻ và không chạm file nóng.
- **Trong nhóm P0, P0.1 đi trước** vì 7D vừa chạm `rate-limit.ts` (khả năng xung đột thấp nhất) và nó là dependency của B.1 `[145]`. Mục 141 vẫn cần cả P0.2–P0.5: nó không phải "chưa có thời gian chạy" mà là "chạy sẽ throw `KINGDOM_FULL` ở user thứ ~17".
- **Nhóm D (130/131/132/77) không phải việc tăng dần.** Thế giới sống là một hàng JSONB duy nhất `game_state` với `state_key='kingdom'`, ghi lại toàn bộ mỗi command dưới một advisory lock. Ba mục đó đòi thay tầng persistence, nên bắt buộc decompose theo domain và cần owner chốt hướng.
- **Vertical slice cho mỗi mục roadmap**: một mục = một PR gồm domain rule + test + doc, không chia theo lớp (schema hết rồi mới API rồi mới UI).
- **File nóng vẫn là file nóng sau 7D**: `apps/server/src/store.ts`, `apps/server/src/app.ts`, `packages/shared/src/index.ts` — 7D đã sửa chúng, nên rủi ro giờ là đụng việc tiếp theo của owner chứ không phải đụng 7D.

## Ràng buộc dành cho contributor

- **Va chạm với owner:** 3 file nóng trên do owner chủ động. Mọi task chạm chúng (P0.1–P0.4, B.3, nhóm D, C.2) phải hỏi owner trước khi bắt đầu. Nhóm Z không chạm file nào trong số đó — đó là lý do nó chạy được ngay.
- **1 mục roadmap = 1 PR**, giữ nhỏ để không đụng file dùng chung.
- Mỗi PR phải: có test cho domain rule, cập nhật doc domain liên quan (`GAME-DESIGN.md` / `API.md` / `DATABASE.md` / `OPERATIONS.md`), tick checkbox trong `ROADMAP.md` — theo Definition of Done ở `docs/TESTING.md`.
- Gate trước khi mở PR: `npm run verify:web-alpha` (typecheck → build → test → test:postgres → test:e2e → check:bundle → git diff --check). **Giới hạn máy này:** không có Docker và không có `DATABASE_URL`/`TEST_DATABASE_URL` nên `test:postgres` chỉ skip → báo cáo từng gate riêng, **không** viết "`verify:web-alpha` xanh". 7D còn thêm `verify:web-beta` (`npm audit --audit-level=high` + `test:prod-smoke`) và `drill:web-beta`, cả hai cần Docker và chưa vào CI (N.2).

## Dependency graph

```
Z.1 situation-room vào git ──> Z.3 (số test/band layout lấy từ code đã commit)
Z.2 [144] drill vào runbook ──> tick [144] (thay B.2, B.2b)
Z.3 ROADMAP truth pass ──┐
Z.4 API.md truth pass ───┴──> baseline đúng cho B.1 [145]

P0.4 world capacity ──┐
P0.5 harness fix ─────┤
P0.2 ledger reload ───┼──> B.3 [141] load test run + report
P0.3 processedCommands┘
P0.1 rate-limit ──────────> B.1 [145] security review

A.1 [204] manual acceptance ──> đóng Phase 7C

D.1 [130] domain repos ──> D.2 [131] shard kingdom_id ──> D.3 [132] stateless gateway
                                                              └──> D.4 [77] battle worker
C.1 misinformation (độc lập)
C.2 [89] chat/mail/moderation (độc lập; tái dùng ban/frozen sẵn có)

E.3-pre band compact (rẻ, độc lập) ──> E.3 [215] touch/safe-area/viewport
E.1 [216] bundle ──> E.2 [212] PWA ──> E.4 [213] Capacitor ──> E.7 [218] store policies
E.3 [215] touch ──────────────────────┘                            │
E.6 [217] crash + protocol version ──> E.2/E.4/E.5 ────────────────┘
                                       E.5 [214] Tauri

G.1 [239] style guide ──> G.2 [237] chọn pack ──> G.3 [238] credits ──> G.4 [240] portraits
                                                        └──> G.5 [241] Blender (có điều kiện)
F.1 [227] catalog ──> F.2 [228] battle pass ──> F.3 [229] guard test
F.4 [230] audit process (độc lập)
```

## Nhóm P0 — Prerequisite (không có trong roadmap, chặn mục 141)

### P0.1 — Tách rate-limit bucket theo nhóm command ✅ `d1212b4`

`app.ts:98` dùng chung key `write:${playerId}` cho mọi command nhưng caller truyền limit khác nhau: spy 5, combat 10, default 20. Counter dùng chung nên sau 6 lệnh build, lệnh spy kế tiếp bị 429 vì 7 > 5. `attack` không truyền limit → chạy ở 20/phút trong khi `set-formation` ở 10, ngược logic. 7D sửa *hành vi* `rate-limit.ts` (fail-closed) nhưng **không** sửa key, nên 429 sai bucket giờ càng dễ nổ ra ngoài. `docs/API.md` sau Z.4 đã ghi đúng hiện trạng "dùng chung counter" và trỏ tới task này là bản sửa.

**Đã làm khác thiết kế ban đầu, và vì sao:** thay vì thêm tham số bucket cho `command()` — tức vẫn để call site khai báo hạn mức, đúng cái đã sinh ra bug — bảng `rateBuckets` (write 20 / combat 10 / spy 5 / read 60) và `commandBuckets` khai báo **tập trung** trong `app.ts`, còn tham số `rlLimit` bị bỏ hẳn ở 9 call site. Một limit không còn cách nào lệch khỏi counter nó tiêu. Hai việc phát sinh sửa kèm vì cùng vùng code: ba GET có auth vào bucket `read` (trả lời OQ #7), và `rateLimited()` phân biệt `RATE_LIMITED` với `DEPENDENCY_UNAVAILABLE` — trước đó Redis chết ở production làm `command()` throw **ngoài** `try` của nó, không có `setErrorHandler`, nên trả HTTP 500 trong khi `API.md` hứa 503.

**Acceptance criteria:**
- [X] Bucket riêng cho từng nhóm: `write:`, `combat:`, `spy:` (+ `read:`) + `${playerId}`
- [X] `attack` nằm ở bucket combat, cùng `set-formation`
- [X] Tiêu hết hạn mức spy không ảnh hưởng hạn mức build và ngược lại
- [X] Mã lỗi và HTTP status không đổi cho trường hợp quá hạn mức (429 / `RATE_LIMITED`); 503 chỉ xuất hiện khi dependency chết
- [X] `docs/API.md` mục hạn mức ghi trạng thái mới, có nguyên tắc "một bucket = một hạn mức"

**Verification:**
- [X] `npm test -w @kingdoms/server` — 121 test: 106 pass, 0 fail, 15 skip (postgres-gated). Test mới: bucket độc lập trong `rate-limit.test.ts`; trong `app.test.ts` spy cạn không chặn build, read thứ 61 trả 429, read không auth vẫn 401
- [X] `npm run typecheck` sạch; `test:postgres` không chạy được ở máy này (báo riêng, không gộp vào `verify:web-alpha`)

**Dependencies:** None (⚠️ chạm `app.ts`; owner đã cho phép mở phạm vi) · **Scope:** S
**Files:** `apps/server/src/app.ts`, `apps/server/src/rate-limit.test.ts`, `apps/server/src/app.test.ts`, `docs/API.md`

### P0.2 — Bỏ full-table reload của event ledger khỏi command path

`event-ledger.ts` `load()` chạy `SELECT ... FROM event_ledger ORDER BY created_at` không `WHERE`/`LIMIT`, và `store.ts:94` gọi `await this.load()` **trong mỗi transaction command**. Mảng `history` mà nó nạp **không có consumer production nào** — `ledger.all()` chỉ xuất hiện ở 6 chỗ trong test. Idempotency chỉ cần `hasCommand()`, và DB đã có partial unique index `event_ledger_command_idx` (`003_event_ledger.sql:11`).

**Acceptance criteria:**
- [ ] `load()` không còn nạp toàn bộ `event_ledger` vào `history`
- [ ] `hasCommand()` đúng qua point query dùng `event_ledger_command_idx`, hoặc Set giới hạn theo season với DB index làm authority
- [ ] Retry cùng `commandId` vẫn trả `already_processed` và không trừ resource lần hai
- [ ] `ledger.all()` vẫn dùng được cho test, hoặc test đổi sang query DB trực tiếp

**Verification:**
- [ ] `npm test -w @kingdoms/server`
- [ ] `RUN_POSTGRES_INTEGRATION=1 npm run test:postgres` — case retry sau persist fail sẵn có vẫn xanh
- [ ] Đo `command_duration` p95 qua `/metrics` trước/sau, ghi số vào PR

**Dependencies:** None (nhưng chạm `store.ts` → hỏi owner) · **Scope:** M
**Files:** `apps/server/src/event-ledger.ts`, `apps/server/src/store.ts`, `apps/server/src/store.test.ts`, `apps/server/src/postgres.integration.test.ts`

### P0.3 — Chặn `processedCommands` phình vô hạn

`state.processedCommands: string[]` nằm trong JSONB `game_state`, mỗi command push thêm một id, kiểm tra bằng `.includes()` O(n), chỉ xoá ở `season-reset.ts`. Sau một season nó là mảng rất lớn được đọc và ghi lại **mỗi command**.

**Acceptance criteria:**
- [ ] Dedupe không còn phụ thuộc mảng không giới hạn (dùng `hasCommand` từ P0.2, hoặc cửa sổ trượt có giới hạn ghi rõ)
- [ ] Mọi domain đang tự check `processedCommands.includes()` đi qua một đường dedupe duy nhất
- [ ] Test idempotency sẵn có vẫn xanh; thêm test ranh giới nếu chọn cửa sổ trượt

**Verification:**
- [ ] `npm test -w @kingdoms/server`
- [ ] `npm run test:postgres`

**Dependencies:** P0.2 · **Scope:** M — chạm 5 file, nếu vượt thì tách theo domain
**Files:** `apps/server/src/store.ts`, `espionage.ts`, `logistics.ts`, `combat.ts`, `onboarding.ts`

### P0.4 — Nâng sức chứa thành phố của thế giới

`cityPlacement()` (`store.ts:26-45`) quét `[2..17]²`, yêu cầu Manhattan ≥3 giữa các city và ≤2 tới anchor. Anchor chỉ có 4: 3 resource node (6,8 / 15,10 / 10,14) + 1 market hub quanh (10,10), do `logistics.ts` `seed()` và `seedMarketHub()` tạo. Mỗi đĩa Manhattan bán kính 2 nhận ~4 city → trần ~16, khớp ghi chú "trần ~16 ô đặt thành phố" ở roadmap dòng 203. `loadtest-seed.ts` từ chối `LOADTEST_USERS < 100` nên seed throw `KINGDOM_FULL` khoảng user thứ 17.

**Cần owner quyết trước khi làm** (Open Question #2): mở rộng map, hay giữ 20×20 và hạ mục tiêu load test.

**Acceptance criteria:**
- [ ] Kích thước map thành một hằng số chia sẻ duy nhất; xoá hardcode ở `packages/shared/src/index.ts:278` (`moveArmyCommandSchema` clamp 0..19) và `apps/client/src/map.ts:9,114`
- [ ] Số anchor scale theo sức chứa mong muốn; `cityPlacement()` đặt được ≥ N city với N là mục tiêu đã chốt
- [ ] Test khẳng định sức chứa: đặt N city liên tiếp không throw `KINGDOM_FULL`
- [ ] Nếu mở rộng map: ghi ảnh hưởng travel time / logistics distance vào `docs/GAME-DESIGN.md`

**Verification:**
- [ ] `npm test -w @kingdoms/server` — test sức chứa mới trong `store.test.ts`
- [ ] `npm run test:e2e` — E2E hiện dựa vào trần ~16, có thể phải sửa `reset.spec.ts`
- [ ] Mở `npm run dev:web`, xác nhận map render đúng kích thước mới

**Dependencies:** Owner decision · **Scope:** M–L tuỳ phương án
**Files:** `packages/shared/src/index.ts`, `apps/server/src/store.ts`, `apps/server/src/logistics.ts`, `apps/client/src/map.ts`, `apps/server/src/store.test.ts`

### P0.5 — Sửa harness k6 cho khớp hạn mức thật

Scenario `commands` trong `e2e/loadtest/loadtest.js` chạy `constant-arrival-rate` 10/s với `preAllocatedVUs: 10, maxVUs: 30`, chọn user bằng `fixture.users[__VU % length]` → chỉ ~10 user thật nhận tải, tức ~60 command/phút/user so với hạn mức 20/phút. `429` không nằm trong tập chấp nhận (`ok = status === 200 || (400 && gameplayRejection)`) nên rate-limit rejection bị tính là lỗi và phá threshold `command_errors: rate<0.01`.

**Acceptance criteria:**
- [ ] Tải phân bố đều trên toàn bộ user trong fixture
- [ ] Tốc độ mỗi user dưới hạn mức write, **hoặc** `429` đo thành metric riêng thay vì tính là lỗi — chọn một và ghi rõ trong comment đầu file
- [ ] `options.thresholds` phản ánh đúng ý nghĩa đã chọn

**Verification:**
- [ ] `k6 run --duration 1m e2e/loadtest/loadtest.js` trên stack local, không có lỗi giả từ 429

**Dependencies:** P0.4 (seed phải chạy xong mới có fixture) · **Scope:** S
**Files:** `e2e/loadtest/loadtest.js`, `apps/server/src/loadtest-seed.ts`

### Checkpoint 1 — sau P0.1–P0.5
- [ ] `npm run verify:web-alpha` xanh
- [ ] Có số đo p95 command trước/sau P0.2+P0.3
- [ ] Seed `LOADTEST_USERS` mục tiêu không throw `KINGDOM_FULL`
- [ ] **Owner review** — nhóm này chạm `store.ts` / `app.ts`

## Nhóm A — Đóng Phase 7C

### A.1 — [204] Manual acceptance Phase 7C

Owner đang ở 7D nên **rất có thể mục này thuộc phần owner tự chạy** — xác nhận trước (Open Question #1). Phần contributor làm được: biến dòng 204 thành checklist chạy được, và tự động hoá phần kiểm tra được.

**Acceptance criteria:**
- [X] `docs/ACCEPTANCE-7C.md`: walkthrough 8 bước onboarding (lấy từ `onboardingSteps` trong `packages/shared`), kịch bản phiên 30–60 phút, bảng tick cho 3 tiêu chí ở dòng 204 — không lộ raw ID, không dùng native `prompt()`/`confirm()`, không jank. Cố ý **loại** những gì test tự động đã phủ, để phiên tay chỉ đi phần máy không đo được
- [X] Phần tự động: `apps/client/src/no-native-dialogs.test.ts` quét toàn bộ `apps/client/src`, bỏ comment trước khi quét (comment giải thích vì sao `confirm()` không còn không được làm đỏ test) và có test tự kiểm regex để guard không im lặng chết
- [ ] Kết quả phiên ghi lại: ngày, người chạy, blocker. Sạch thì tick dòng 204 — **người phải chạy**, không tự tick

**Verification:**
- [X] `npm test -w @kingdoms/client` — 78/78, gồm 2 test mới của guard
- [ ] `npm run dev:web` rồi chạy hết checklist (owner)

**Dependencies:** None · **Scope:** S
**Files:** `docs/ACCEPTANCE-7C.md` (mới ✅), `apps/client/src/no-native-dialogs.test.ts` (mới ✅), `docs/ROADMAP.md`

## Nhóm B — Pre-beta Phase 7A

### B.1 — [145] Security review auth / permissions / input / secrets

**Acceptance criteria:**
- [ ] `docs/SECURITY-REVIEW.md` phủ 4 trục: **auth** (session rotation, refresh cookie `sameSite: strict`, close 4401, `timingSafeEqual` cho admin token), **permissions** (ownership guard, frozen/banned, permission matrix alliance/treaty, `/api/battles` chỉ thấy trận mình tham gia), **input** (Zod ở mọi command, `bodyLimit: 64*1024`, `requestTimeout: 15_000`), **secrets** (Zod production gate, `METRICS_TOKEN`, không log credential)
- [ ] Mỗi phát hiện có severity + `file:line` + đề xuất sửa
- [ ] Finding mức cao có test hồi quy trong `security.test.ts`
- [ ] Hạn mức thật đã đối chiếu với `docs/API.md` (kết quả Z.4 + P0.1)
- [ ] Xử lý hai finding đã có sẵn từ Z.4: (a) **không GET route nào bị rate-limit** — `/api/bootstrap`, `/api/season-history`, `/api/battles` không có hạn mức nào (7 call site `rateLimited(` đều là POST); (b) bucket write dùng chung cho mọi command (P0.1). Việc **có** thêm read limit hay không là quyết định của owner, không tự thêm trong PR review
- [ ] Re-baseline theo code sau 7D: 7D đã tự xử log redaction, cookie `Path=/api/auth`, chặn request thiếu Origin, limiter fail-closed, che `/metrics` `/health/ready` `/api/dev/*` ở Caddy, security headers → review chỉ còn phần chưa được xử lý

**Verification:**
- [ ] `npm test -w @kingdoms/server`
- [ ] Owner review lại tài liệu

**Dependencies:** P0.1 · **Scope:** M
**Files:** `docs/SECURITY-REVIEW.md` (mới), `apps/server/src/security.test.ts`, `docs/ROADMAP.md`

### B.2 — [144] Restore drill + log vào runbook ✅ → **đóng ở Z.2**

Drill đã chạy thật ngày 2026-09-02 qua `npm run drill:web-beta` (3/3 pass, RPO 0 ms, RTO 5795 ms) và kết quả đã vào `docs/OPERATIONS.md` ở Z.2 (`1687a53`); `[144]` tick ở Z.3 (`06d573a`). Phần **chưa** làm được, đã ghi thành caveat trong runbook:

- [ ] **B.2b** — drill dùng `docker compose exec postgres pg_dump` (`scripts/drill-web-beta.mjs:120`), **không** đi qua `infra/backup/backup.sh` / `restore.sh`. Nên hai script đó — custom format, retention 7 daily + 4 weekly, checksum/size vào `backup.log`, guard `BACKUP_ALLOW_LOCAL` — vẫn chưa được kiểm chứng lần nào. Drill kỳ sau (2026-10-02) nên đi qua đúng hai script để tick được cả đường cron thật · S · cần Docker (OQ #4)

### B.3 — [141] Chạy full load test 15 phút và lưu report

**Acceptance criteria:**
- [ ] Seed thành công `LOADTEST_USERS` = mục tiêu đã chốt vào DB hậu tố `_loadtest`
- [ ] `k6 run e2e/loadtest/loadtest.js` 15 phút đạt threshold: `command_duration p95<250 p99<750`, `command_errors<0.01`, `ws_connect_ok>0.99`, `ws_reconnect_ok>0.99`, `duplicate_idempotent==1`
- [ ] `npm run test:loadtest:verify` xanh
- [ ] Report lưu lại (summary k6 + outbox backlog/age + tick lag) và link từ `docs/OPERATIONS.md`
- [ ] Tick dòng 141

**Verification:**
- [ ] Chính threshold của k6
- [ ] Đối chiếu `/metrics` trong lúc chạy (`command_duration`, `tick_lag`, outbox backlog)

**Dependencies:** P0.2, P0.3, P0.4, P0.5 · **Scope:** S về code — nếu p95 fail thì mở task tối ưu riêng
**Files:** `docs/OPERATIONS.md`, `docs/ROADMAP.md`, artifact report

### Checkpoint 2 — sau A.1 + B.1 + B.3
- [ ] `[204]`, `[141]`, `[145]` tick được, hoặc blocker ghi rõ (`[144]` đã tick ở Z.2/Z.3)
- [ ] Report load test lưu và link từ `OPERATIONS.md`
- [ ] Phase 7C đóng; Phase 7A hết mục "trước beta"

## Nhóm C — Feature debt

### C.1 — Espionage misinformation (caveat dòng 99 + "Bước tiếp theo" #1)

`docs/GAME-DESIGN.md:65` yêu cầu "Sabotage/misinformation luôn ghi audit event và có counter-intelligence" nhưng `misinformation` **không tồn tại trong code**: `spyMissionTypes` (shared dòng 202) chỉ có `scout`, `sabotage`, `steal`, `counter_intel`. Baseline số liệu cũng chưa định nghĩa → phải chốt trong `GAME-DESIGN.md` cùng PR.

**Thiết kế đề xuất:** mission `misinformation` do A cắm lên B. Khi thành công, mọi `scout` của B nhắm vào A trong thời gian hiệu lực trả số liệu bị bóp méo, deterministic theo `hash(mission.id)` giống ambush/sabotage đang làm; hết hạn tự động; bị `counter_intel` của B chặn với cùng xác suất 30% / 52% Veiled như các mission khác.

**Acceptance criteria:**
- [ ] `spyMissionTypes` + `launchSpyCommandSchema` (shared dòng 315) nhận `misinformation`; `spyMissionConfig` có cost/duration/cooldown/baseAccuracy
- [ ] `espionage.tick()` resolve `misinformation`; `resolve()` áp méo lên nhánh `scout` khi hiệu lực còn
- [ ] Ghi event ledger (audit) và bị intercept bởi counter-intel
- [ ] Hiệu lực hết hạn deterministic và persist qua restart
- [ ] Client hiện mission type mới trong drawer espionage
- [ ] Số liệu mới ghi vào mục "Phase 5 implementation baseline" của `docs/GAME-DESIGN.md`; xoá chữ "misinformation còn thiếu" ở roadmap dòng 99

**Verification:**
- [ ] `npm test -w @kingdoms/server` — case mới trong `espionage.test.ts`: success, intercepted, expiry, scout bị méo
- [ ] `npm run test:postgres` — persist qua restart
- [ ] `npm run verify:web-alpha`

**Dependencies:** None · **Scope:** M
**Files:** `packages/shared/src/index.ts`, `apps/server/src/espionage.ts`, `apps/server/src/espionage.test.ts`, drawer espionage ở `apps/client/src/`, `docs/GAME-DESIGN.md`

### C.2 — [89] Chat, mail và moderation boundary

L-sized → tách thành 3 PR:

- **C.2a Mail** — migration bảng mail, command send/read, rate-limit bucket riêng (dùng kết quả P0.1), snapshot chỉ trả mail của viewer theo pattern per-viewer filter sẵn có trong `getSnapshot`
- **C.2b Chat theo kênh** (kingdom / alliance) — transport, lịch sử giới hạn số bản ghi, rate-limit riêng
- **C.2c Moderation boundary** — report / mute / block, tái dùng ban/frozen và `admin_actions` đã có trong `moderation.ts` + `store.moderatePlayerUnlocked()`

**Acceptance criteria (áp cho cả 3):**
- [ ] Nội dung người dùng nhập không bao giờ render như HTML ở client, và có giới hạn độ dài server-side
- [ ] Mọi hành động moderation ghi `admin_actions`
- [ ] Người bị ban/frozen không gửi được
- [ ] Snapshot không leak mail/chat của người khác

**Verification:**
- [ ] Unit test cho mỗi sub-task
- [ ] 1 scenario e2e gửi/nhận
- [ ] `npm run verify:web-alpha`

**Dependencies:** Nên chờ 7D lên `main` (chạm `app.ts` / `getSnapshot`) · **Scope:** L → 3 PR
**Files:** migration mới trong `infra/migrations/`, module mới trong `apps/server/src/`, `app.ts`, panel mới ở client, `docs/API.md`, `docs/DATABASE.md`

### Checkpoint 3 — sau C.1 + C.2
- [ ] Dòng 89 tick; caveat misinformation ở dòng 99 xoá
- [ ] `verify:web-alpha` xanh, có e2e cho chat/mail

## Nhóm D — Kiến trúc scale (XL, cần owner chốt hướng)

Cả nhóm này bị chặn bởi một sự thật: **thế giới sống là một hàng JSONB duy nhất** `game_state` với `state_key='kingdom'` (`001_initial.sql`), ghi lại toàn bộ mỗi command, dưới một advisory lock chung. Ba mục 130/131/132 **không phải việc tăng dần trên thiết kế hiện tại** — chúng đòi thay tầng persistence. Roadmap nên ghi rõ điều đó để không hiểu sai khối lượng.

### D.1 — [130] PostgreSQL repository riêng cho từng domain

Đã có repository theo domain (`logistics.ts`, `combat.ts`, `espionage.ts`, `diplomacy.ts`, `onboarding.ts`, `raiders.ts`) nhưng state vẫn đi qua JSONB dùng chung.

**Acceptance criteria:**
- [ ] Mỗi domain đọc/ghi bảng riêng, không qua JSONB dùng chung
- [ ] `game_state` không còn là nguồn sự thật cho domain đã chuyển; ghi rõ domain nào còn lại
- [ ] Rollback transaction vẫn đúng cho mọi domain
- [ ] Restart giữ nguyên state

**Verification:**
- [ ] `npm run test:postgres` — test restart + rollback sẵn có vẫn xanh
- [ ] `npm run verify:web-alpha`
- [ ] Đo p95 command trước/sau

**Dependencies:** P0.2, P0.3 (làm trước để giảm phạm vi) + owner decision · **Scope:** XL
**Bắt buộc decompose:** mỗi domain một PR — logistics → combat → espionage → diplomacy → onboarding → core city/player
**Files:** migration mới, `store.ts` + toàn bộ repository, `docs/DATABASE.md`, `docs/ARCHITECTURE.md`

### D.2 — [131] Shard theo `kingdom_id`

**Acceptance criteria:**
- [ ] Không còn hằng số `state_key='kingdom'`; state khoá theo `kingdom_id`
- [ ] `pg_advisory_xact_lock(hashtext('state:' || kingdomId))` (`store.ts:94` đã theo dạng này) thực sự tách kingdom — hai kingdom ghi song song không chặn nhau
- [ ] Snapshot/broadcast chỉ trong phạm vi kingdom
- [ ] Test: 2 kingdom, command song song, không deadlock, score độc lập

**Verification:** `npm run test:postgres` (multi-kingdom); load test 2 kingdom
**Dependencies:** D.1 · **Scope:** XL → decompose sau khi D.1 xong

### D.3 — [132] Stateless WebSocket gateway + economy worker + battle worker

Hiện `app.ts` chạy tick 1s và save 10s bằng `setInterval` **trong tiến trình HTTP**.

**Acceptance criteria:**
- [ ] Gateway không giữ state gameplay; snapshot lấy từ store/Redis
- [ ] Tick economy chạy ở worker riêng
- [ ] Nhiều instance gateway không nhân đôi tick (leader election / advisory lock)
- [ ] Reconnect qua instance khác vẫn thấy đúng snapshot

**Verification:** integration test multi-instance (theo pattern season lock sẵn có trong `postgres.integration.test.ts`); load test reconnect burst
**Dependencies:** D.1, D.2 · **Scope:** XL → decompose sau

### D.4 — [77] Battle worker khi simulation cần scale độc lập

**Acceptance criteria:**
- [ ] Battle simulation chạy ngoài request path, tiêu thụ từ queue
- [ ] Cùng seed → cùng report (giữ tính deterministic của `battle-engine.ts`)
- [ ] Report vẫn chỉ tới participant (giữ luật 7C ở `getSnapshot` / `broadcastReport`)

**Verification:** `battle-engine.test.ts` giữ nguyên xanh; integration test worker
**Dependencies:** D.3 (hạ tầng worker) · **Scope:** L

### Checkpoint 4 — trước khi mở nhóm D
- [ ] Owner chốt hướng persistence
- [ ] Có số đo baseline từ Checkpoint 1 để chứng minh nhu cầu
- [ ] D.1 đã được decompose theo domain, không bắt đầu như một PR duy nhất

## Nhóm E — Phase 8 đa nền tảng

### E.1 — [216] Texture/asset optimization và bundle splitting
Làm trước trong Phase 8 vì gate `check:bundle` (500 KiB/chunk, manifest-based) đã có sẵn để đo.
- [ ] Mọi chunk vẫn ≤ 500 KiB sau khi thêm asset thật
- [ ] Asset qua pipeline nén; lazy-load theo panel giữ pattern dynamic import Pixi sẵn có

**Verify:** `npm run check:bundle`; devtools performance trace · **Deps:** G.2/G.3 nếu đã có asset thật · **Scope:** M

### E.2 — [212] PWA service worker và offline shell
- [ ] Manifest + service worker; offline shell hiện được khi mất mạng
- [ ] **Không cache snapshot gameplay** — server-authoritative, tránh state cũ gây lệch
- [ ] Có update strategy (gắn với E.6)

**Verify:** build + devtools Application panel; test SW registration · **Deps:** E.1 · **Scope:** M

### E.3-pre — Kiểm band `compact` trong browser (phần rẻ nhất của E.3) ✅ `afa072b`
Situation Room (Z.1) **đã có** band `compact` <1024px: `layout.ts` biến hai column thành flyout và `toggleSurface` cho chúng loại trừ nhau, thay vì chặn viewport như rào 7C. Rào "viewport desktop chưa được hỗ trợ" **không còn trong `apps/client/src`**. Nhưng `e2e/situation-room.spec.ts` chỉ đi qua 1920/1440/1280/1024, nên band `compact` **chưa từng được chạy trong browser lần nào**.
- [X] Thêm một size thứ năm (<1024px) vào vòng lặp viewport đã có — 900x800
- [X] **Không** copy-paste assertion: ở `compact`, `map.x === kingdom.w` pass vì cả hai bằng 0, tức pass vì lý do sai → band này khẳng định `map.x === 0` và `map.w === viewport` khi đóng, còn flyout thì neo lên trên map (`kingdom.x === map.x`, `activity` neo phải) mà không cắt bớt box của map
- [X] Khẳng định hai column loại trừ nhau: mở `activity` thì `kingdom` đóng
- [X] Phát sinh: `login()` nhận `contextVisible` vì mốc "shell đã dựng" ở compact không thể là column kingdom (nó đóng sẵn) mà phải là nút toggle trong header

**Verify:** ✅ `afa072b` — full suite trên port 3100/5174: **19/19 pass**. Wait cho `.map canvas` nới lên 15 s sau khi thấy nó timeout 5 s một lần ở cuối run (import động chunk pixi + WebGL context); test không hề khẳng định canvas tới nhanh · **Deps:** Z.1 · **Scope:** S

### E.3 — [215] Touch controls, safe area và viewport nhỏ
Tách 3 PR: (a) touch pan/zoom trên map Pixi, (b) layout responsive, (c) e2e mobile project. Phần (b) đã được Situation Room làm gần hết — xem E.3-pre.
- [ ] Touch pan/zoom trên map Pixi (hiện chỉ có pointer/wheel)
- [ ] Safe-area inset; action bar dùng được bằng ngón

**Verify:** thêm project mobile viewport vào `playwright.config.ts` (7C đã hoãn sang Phase 8) · **Deps:** E.3-pre · **Scope:** L → 3 PR

### E.4 — [213] Capacitor iOS/Android shell
- [ ] Shell load `dist-web`; API URL cấu hình được; deep link + back button
- [ ] Không có gameplay logic riêng ở shell (giữ invariant `docs/ARCHITECTURE.md`)

**Verify:** build trên máy có Xcode/Android SDK; smoke trên simulator · **Deps:** E.2, E.3 + **owner cấp bundle ID và signing/store account** · **Scope:** L

### E.5 — [214] Tauri desktop shell
- [ ] Shell load `apps/client/dist` theo ghi chú sẵn ở `apps/client/src-tauri/README.md`; cùng cấu hình API URL; build được 3 OS

**Verify:** build local + smoke · **Deps:** E.2 · **Scope:** M

### E.6 — [217] Crash reporting, versioned client protocol, update strategy
- [ ] Crash/error reporting opt-in, không gửi PII
- [ ] `PROTOCOL_VERSION` đã có cơ chế khoá lệnh khi lệch → mở rộng thành policy nâng version + client nhắc cập nhật
- [ ] Update strategy cho từng shell

**Verify:** test protocol mismatch sẵn có ở `apps/client/src/protocol.test.ts`; thêm test opt-in reporting · **Deps:** E.2 · **Scope:** M

### E.7 — [218] Store / privacy policy / terms cho từng nền tảng
- [ ] Privacy policy nêu đúng dữ liệu thật đang thu (account, session, `analytics_events`, crash nếu bật)
- [ ] Terms; store listing iOS/Android; yêu cầu độ tuổi

**Verify:** đối chiếu checklist store; owner review · **Deps:** E.4, E.6 · **Scope:** M — **có yếu tố pháp lý, owner quyết**

### Checkpoint 5 — trước khi mở nhóm E
- [ ] Nhóm D xong, **hoặc** owner chấp nhận ship đa nền tảng trước khi scale server

## Nhóm F — Monetization guardrails

Guardrail đã có ở mức nguyên tắc trong `docs/ROADMAP.md` và `docs/GAME-DESIGN.md`; ba mục còn lại là biến nguyên tắc thành catalog + test.

### F.1 + F.3 — [227] [229] Cosmetic catalog versioned + test chặn power field
Một PR, không tách, để guardrail có hiệu lực từ commit đầu tiên thay vì sau.
- [ ] Định nghĩa item cosmetic versioned trong `packages/shared` (id, version, loại, không có field nào ảnh hưởng gameplay)
- [ ] Test khẳng định **không** item nào mang power modifier: whitelist field, fail nếu xuất hiện field lạ
- [ ] Không có đường nào từ catalog vào score/combat/resource

**Verify:** `npm test -w @kingdoms/shared` · **Deps:** None (⚠️ chạm `packages/shared`) · **Scope:** M

### F.2 — [228] Battle pass chỉ cosmetic/title
- [ ] Track tiến độ theo hành vi chơi, thưởng chỉ cosmetic/title (tái dùng legacy cosmetic của Phase 6)
- [ ] Không rút ngắn queue, không tăng tài nguyên

**Verify:** test khẳng định reward set ⊆ catalog cosmetic · **Deps:** F.1 · **Scope:** M

### F.4 — [230] Audit review trước mỗi thay đổi monetization
- [ ] Thêm yêu cầu audit vào `docs/CONTRIBUTING.md`: PR chạm catalog/battle pass phải có checklist "không power modifier" và người review thứ hai

**Verify:** đọc lại `CONTRIBUTING.md` · **Deps:** F.1 · **Scope:** XS

## Nhóm G — Asset roadmap

Thứ tự bắt buộc: style guide → chọn pack → credits. Chọn pack trước khi có style guide là cách chắc chắn nhất để phải chọn lại.

### G.1 — [239] Art style guide
- [ ] `docs/ASSETS.md`: palette, phối cảnh isometric, tile size khớp `map-geometry.ts`, ngưỡng readability ở mức zoom nhỏ nhất

**Verify:** owner review · **Deps:** None · **Scope:** S

### G.2 — [237] Chọn pack từ nguồn có license rõ ràng
- [ ] Chỉ CC0/CC-BY; **loại** NC/ND và mọi nguồn không ghi rõ license
- [ ] Pack khớp style guide G.1

**Verify:** đối chiếu license từng nguồn · **Deps:** G.1 · **Scope:** S

### G.3 — [238] Ghi URL/tác giả/license/version từng file
- [ ] Bảng đầy đủ trong `assets/CREDITS.md`
- [ ] Script CI fail nếu có file asset không có dòng credit tương ứng

**Verify:** chạy script trên cây asset hiện tại · **Deps:** G.2 · **Scope:** S

### G.4 — [240] AI portrait concept
- [ ] Chỉ sau khi có art direction; ghi rõ công cụ + license đầu ra cho từng ảnh

**Verify:** owner review · **Deps:** G.1, G.2 · **Scope:** M

### G.5 — [241] Blender low-poly pipeline (có điều kiện)
- [ ] **Chỉ mở nếu** G.1–G.3 kết luận 2D không đủ readability; nếu đủ thì đóng mục này với lý do

**Verify:** so sánh readability 2D vs render · **Deps:** G.3 · **Scope:** L

## Việc dọn nhỏ (kèm vào PR liên quan, không phải mục roadmap)

Ba mục đầu xong trong `4817d1a`; kết luận của mục 1 khác đề bài ban đầu nên ghi lại đây.

- [X] `militaryScore()` bỏ im lặng `strengthDestroyed` / `strengthLost` / `defeats` → **không phải code chết**: `combat.ts:296-310` cộng, `combat.ts:98-99` persist, `combat.ts:66-67` đọc lại, `analytics.ts:16` phát đi, `types.ts:12` khai báo. Chúng chỉ nằm ngoài công thức điểm — nghĩa là hôm nay thua trận không mất điểm. Đó là luật chơi (`docs/GAME-DESIGN.md`), owner quyết, **không** phải bug để tự sửa; nên chỉ thu hẹp fallback ở call site về đúng 4 field công thức đọc và ghi comment nói rõ vì sao
- [X] `buildingCosts` trong `store.ts` trùng `gameRules.buildings` → derive từ shared, thêm test đi qua từng building đối chiếu `cost` và `durationSeconds`
- [X] `infra/migrations/README.md` dừng ở `011` → phát hiện thêm: hướng dẫn `psql -f` từng file **bỏ qua runner của 7A**, để `schema_migrations` rỗng và khiến `db:migrate:check` báo toàn bộ pending. README giờ chỉ sang `npm run db:migrate`, giữ manifest `001`–`014`
- [ ] Suite Chromium mặc định vẫn chạy in-memory (`AUTH_MODE=dev`); `e2e/password-auth.spec.ts` của 7D chạy thật với PostgreSQL nhưng chỉ khi `E2E_PROD_SMOKE=1` và không nằm trong CI
- [ ] **Mới:** `.map canvas` timeout 5 s một lần ở cuối full-suite run (19 test) → đã nới riêng wait đó lên 15 s. Nếu tái diễn thì nghi vấn tiếp theo là số WebGL context sống đồng thời của Chromium, không phải layout

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| 43 file redesign mất do lệnh git sai | ~~High~~ | **Đã xử:** Z.1 commit theo lớp lên nhánh riêng trước mọi việc khác; không `reset --hard`, không `clean -f`, không `stash drop` |
| Nhánh `feat/situation-room` chưa được owner review, càng để lâu càng lệch `main` | Medium | Báo owner sớm; nhánh đứng độc lập, không chạm `store.ts`/`app.ts`/`shared` nên rebase rẻ |
| Sửa dòng đã tick trong roadmap bị hiểu là viết lại lịch sử | Medium | Giữ tick, chỉ thêm "superseded" + sự thật hiện tại; không bỏ tick mục nào |
| P0.1 xung đột với việc owner đang làm trên `app.ts` | Medium | Nhánh riêng `feat/rate-limit-buckets`, không push; diff gọn (một bảng bucket + đổi key + bỏ tham số `rlLimit`), giữ nguyên 429/`RATE_LIMITED` cho trường hợp quá hạn mức |
| Hai job CI mới (`prod-smoke`, `recovery-drill`) chưa từng chạy | Medium | Ghi rõ "wired, chưa quan sát xanh" ở cả `todo.md` và mục N.2; gating `if:` giới hạn ở main/dispatch/cron nên PR thường không bị chặn bởi job chưa kiểm chứng |
| Nhóm D bắt đầu như một PR duy nhất | High | Checkpoint 4 chặn: phải decompose theo domain và có số đo baseline trước |
| Báo cáo gate mạnh hơn thực tế (`test:postgres` chỉ skip) | Medium | Luôn báo từng gate riêng; không dùng chữ "`verify:web-alpha` xanh" ở máy này |
| Chạy e2e trúng port stack dev của owner | Low | Xác định chủ port bằng `netstat -ano` trước; nếu đang chạy thì dùng config tạm 3100/5174 |
| Một spec cuối run đỏ bị coi là regression | Low | `production-loop` season close và `phase7c` treaty break là flake đã biết — chạy lại riêng lẻ trước khi kết luận |

## Open Questions

1. ~~Phạm vi Phase 7D~~ → **đóng** sau `f6085a4`. Câu hỏi còn lại: owner có coi 7D là đã đóng, và có muốn thêm section 7D vào roadmap (N.1)?
2. **Sức chứa thế giới:** mở rộng map cho 100+ người, hay giữ 20×20 và hạ mục tiêu load test? Chặn P0.4 → P0.5 → B.3 `[141]`.
3. Thứ tự nhóm D (scale server) vs nhóm E (đa nền tảng)?
4. Contributor có quyền chạy prod compose / backup / k6 không? Máy này chưa có Docker và chưa có `k6`.
5. Misinformation baseline do owner chốt hay contributor đề xuất trong PR (C.1)?
6. `verify:web-beta` có vào CI không (N.2), hay cố ý giữ là gate chạy tay vì cần Docker-in-Docker?
7. **Mới:** có thêm rate-limit cho GET route (`/api/bootstrap`, `/api/season-history`, `/api/battles`) không? Hiện **không có** hạn mức nào. Là finding của B.1, không tự sửa.
