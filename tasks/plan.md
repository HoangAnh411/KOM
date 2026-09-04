# Implementation Plan: backlog `docs/ROADMAP.md` + thứ tự thực thi

> Lập ngày 2026-09-02, cập nhật cùng ngày sau khi Phase 7D landing, cập nhật lần cuối **2026-09-03** (vòng PR.1 → P0.3b). Checklist thực thi: [`tasks/todo.md`](./todo.md).

## Overview

**Kingdoms of Meridian** — game chiến thuật realtime, server-authoritative (React + PixiJS client, Fastify + `ws` server, `packages/shared` giữ Zod contract).

Người lập kế hoạch này là **contributor**, không phải owner. **Phase 7D đã landing** ở `f6085a4` (2026-09-02, local `main` == `origin/main`): production/beta hardening — `verify:web-beta`, `scripts/smoke-prod.mjs`, `scripts/drill-web-beta.mjs`, rate limiter fail-closed (503 `DEPENDENCY_UNAVAILABLE`), Caddy security headers, auth-failure metrics, broadcast coalesce. Chi tiết ở mục "Phase 7D đã landing" của `tasks/todo.md`. 7D **không** chạm gameplay, không chạm nhóm P0 và **không sửa dòng nào của `docs/ROADMAP.md`**.

**Cập nhật 2026-09-03 — công việc đã ra khỏi một máy.** Toàn bộ commit sau `f6085a4` đã được push và nằm ở **bảy PR chưa merge**: #1 `feat/situation-room` (base `main`, 4 commit) → #2 `docs/truth-pass` (base #1, 4 commit) → #3 `feat/rate-limit-buckets` (base #2, 8 commit) → **#5 `perf/command-path`** (base #3, 6 commit: Z.5 + B.1a + P0.2 + P0.3a + P0.3b + docs) → **#6 `feat/hud-overhaul`** (base #5, 8 commit: UI-1…UI-7 + docs, cộng `1d9acc1` sửa flake gate 7) → **#7 `feat/espionage-misinformation`** (base #6, C.1), cộng #4 `fix/postgres-test-isolation` (base `main`, 1 commit) sửa race làm CI gate 5 đỏ ngẫu nhiên. `main` vẫn đứng ở `f6085a4`; không nhánh nào được merge. Hai gate CI hay đỏ **không theo quy luật** và cả hai đã chứng minh là flake **có sẵn trên `main`**, không phải regression của stack: gate 5 (`test:postgres` — các file integration chạy song song trên cùng một database, một file `TRUNCATE` giữa assertion của file khác) → PR #4 là bản sửa; gate 7 (Playwright — `map-command.spec.ts` click phải NPC `mob_migration` đứng cùng ô) → **đã sửa ở `1d9acc1`**, nguyên nhân thật là `pickAt()` để thứ tự `snapshot.armies` phân xử thế hoà khoảng cách. Hai job Docker `prod-smoke` / `recovery-drill` không chạy từ push nhánh PR nên chỉ quan sát được qua `workflow_dispatch`.

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

## Thứ tự thực thi (chốt 2026-09-02, mở rộng 2026-09-03 và 2026-09-04)

Năm bước đầu là vòng 2026-09-02 (kế hoạch gốc + phần owner mở phạm vi). Năm bước sau là vòng
2026-09-03: owner hỏi "tiếp theo làm gì" và chốt hai quyết định (push + mở PR; luật `ambush`).
Bước 10–12 là vòng UI cùng ngày: owner nhờ cải thiện **toàn bộ UI/HUD** — nhóm UI ở
dưới, nhánh `feat/hud-overhaul` cắt từ tip `perf/command-path`.
Bước 13–14 là vòng 2026-09-04: owner nhờ **thiết kế map**, tức chính P0.4 — nhóm M ở dưới,
nhánh `feat/world-map-36` cắt từ tip `feat/espionage-misinformation`.
Không mở nhóm D/E/F/G lúc này.

| Bước | Nội dung | Vì sao đứng ở đây | Trạng thái |
|---|---|---|---|
| **0** | **Z.1** — đưa 43 file redesign Situation Room vào git | Đó là công việc đã hoàn thành nhưng chỉ tồn tại trong working tree, không xuất hiện ở roadmap hay plan cũ. Rủi ro lớn hơn mọi mục roadmap còn lại | **Xong** — nhánh `feat/situation-room`, 4 commit |
| **1** | **Z.2 → Z.4** — làm tài liệu khớp code | Doc-only, không chạm file nóng, nên không cần chờ owner; và đóng được một checkbox roadmap thật (`[144]` — drill đã chạy, chỉ thiếu ghi vào runbook) | **Xong** — nhánh `docs/truth-pass`, 3 commit |
| **2** | **P0.1** — tách rate-limit bucket | Task server duy nhất nên làm ngay: 7D vừa chạm `rate-limit.ts` nên khả năng xung đột thấp nhất, và limiter fail-closed làm 429-sai-bucket dễ nổ hơn trước. Mở đường cho B.1 `[145]` | **Xong** — nhánh `feat/rate-limit-buckets`, `d1212b4` |
| **3** | Mở rộng theo yêu cầu owner ("làm hết tất cả"): **N.1**, **N.2**, nửa tự động của **A.1**, **E.3-pre**, ba việc dọn nhỏ | Đều là việc đã có đủ dữ kiện để làm đúng, không cần quyết định thiết kế mới. Những mục còn lại bị chặn bởi Docker/`k6`/quyết định gameplay thì **không** làm dở dang | **Xong** — cùng nhánh, `acf454a` `10c153d` `afa072b` `4817d1a` |
| **4** | **B.1** `[145]` — security review auth / permissions / input / secrets | Dependency duy nhất của nó (P0.1) vừa xong ở Bước 2, và P0.1 đã dời hai finding cũ (bucket dùng chung, GET không hạn mức) ra khỏi phạm vi review nên review có baseline đúng. Đọc code phát hiện thêm **hai lỗ High chưa từng được ghi ở đâu** | **Xong** — cùng nhánh, `docs/SECURITY-REVIEW.md` + hai bản sửa High kèm test |
| **5** | **PR.1** — push 3 nhánh + mở PR xếp tầng | 16 commit đã verify nhưng chỉ tồn tại trên một máy là rủi ro lớn hơn mọi mục roadmap còn lại; và hai gate Docker chỉ CI quan sát được. **Owner đã chốt** | **Xong** — **5 PR** (phát sinh PR #4 vì CI gate 5 đỏ; PR #5 mở sau khi vòng command-path xong). PR.1b cũng xong: `workflow_dispatch` run `33707793916` cho `prod-smoke` + `recovery-drill` lần quan sát đầu tiên, cả hai xanh |
| **6** | **Z.5** — ROADMAP/docs truth pass vòng 2 | Chính yêu cầu của owner ("nhớ cập nhật lại roadmap"); doc-only nên chạy song song được với phần code | **Xong** — `dbf5c6f` + Z.5b đóng cùng B.1a |
| **7** | **B.1a (S-5)** — `ambush` đòi quân trong bán kính 3 + bucket `combat` | Đứng **trước** P0.3 vì P0.3 viết lại chính `claim()` của `logistics.ts`; làm sau thì phải rebase file đó hai lần. **Owner đã chốt luật** | **Xong** — server unit 124 → **128** |
| **8** | **P0.2** (= S-4) — bỏ full-table ledger reload khỏi command path | Rẻ nhất trong ba task command-path và không phụ thuộc gì; nó cũng định nghĩa *idempotency window* mà P0.3a dùng lại làm trần | **Xong** — server unit 128 → **132**, S-4 đóng |
| **9** | **P0.3a → P0.3b** (= S-3) — gộp 5 cơ chế dedupe về một registry có trần | Phải sau P0.2 để dùng chung một con số window; tách 2 task để mỗi task ≤ 5 file và verify riêng được | **Xong** — server unit 132 → **139** (P0.3a `97822af`) → **141** (P0.3b `f94ac22`), S-3 đóng |
| **10** | **UI-1 + UI-2** — từ vựng/gate/pending selector, rồi một primitive modal | Owner nhờ cải thiện **toàn bộ UI/HUD**. Hai task này là nền dùng chung của năm task sau, và UI-2 đứng trước UI-3 vì `ArmyPanel` có hai modal inline — làm ngược lại là sửa cùng file hai lần | **Xong** — `bae7060` + `1d1723a`, Checkpoint A xanh |
| **11** | **UI-3 + UI-4** — lắp cột kingdom rồi drawer từ primitives, **xoá rule bridge** | Bridge `.hud .kom-panel` chỉ xoá được khi **cả** cột và drawer đã lắp từ panel — đúng điều kiện comment của nó ghi từ vòng trước. Đóng luôn nợ kỹ thuật lớn nhất của redesign | **Xong** — `b7ee0a4` + `a7434b6`, Checkpoint B xanh (13/13 bề mặt, client unit 101) |
| **12** | **UI-5 → UI-7** — lấp hai slot đặt chỗ (`ActivityColumn`, nửa phải `CommandTray`) + chrome/a11y pass | Hai slot đó là hai comment "PR4"/"PR5" mà vòng trước tự để lại; UI-7 đi sau cùng vì nó chạm phần còn lại (toast, frozen, heading, `AuthScreen`, map toolbar) | **Xong** — `c8a4f84` + `0895bd1` + `d19cd0e`, Checkpoint C xanh (client unit 101 → **146**, e2e 21 → **28/28** một lần chạy) |
| **13** | **M-1 → M-2 → M-4** — một nguồn sự thật cho kích thước, thế giới 36×36 vẽ tay, rồi sức chứa | Owner nhờ "thiết kế map", tức chính **P0.4** đang chặn P0.5 và `[141]`. M-1 đứng trước vì M-2 đổi extent — làm ngược lại là sửa 8 chỗ rồi sửa tiếp, và một trong 8 chỗ (`moveArmyCommandSchema .max(19)`) sẽ ship thành bug im lặng. M-4 đi sớm trong ba task sau M-2 vì nó là cái đang chặn roadmap | **Xong** — `143a0dc` + `f62d64a` + `fa6fd0d`; sức chứa **14 → 135**, P0.4 đóng |
| **14** | **M-3 + M-5 + M-6** — protocol version, chiếm vùng bằng quân đóng, vùng hiện ra trên màn hình | Ba task còn lại của nhóm M, độc lập với nhau sau M-2. M-6 chờ M-5 vì không có gì để vẽ trước khi có chủ vùng; M-5 đổi **luật tính điểm** nên owner phải thấy (OQ #15) | **Xong** — `9603f1b` terrain rời dây + `PROTOCOL_VERSION = 2`; `f3e9b1a` lãnh thổ có người ghi, một tỉnh 73–76 điểm thay vì 300; `5dd2e87` + `0169655` vùng hiện ra trên map/feed/tray, dây chở **18 byte** thay vì 1 493 mỗi tick. E2E full **29/29**, không spec nào flake |

Bảng trên không có hàng cho **C.1** (misinformation, `fb27af7`): nó chạy giữa Bước 12 và Bước 13 như một mục của nhóm C, không phải một bước của vòng nào.

Còn chặn thật, đã báo thay vì làm dở: **P0.5 + B.3** `[141]` (không `k6`; deps P0.4 **đã hết** — sức chứa 135 ≥ profile 120), **B.2b** + hai job CI Docker (không Docker ở máy này — sau PR.1 thì `recovery-drill` trên CI là chỗ quan sát đầu tiên, cần `workflow_dispatch`), **A.1** phần phiên tay 30–60 phút (người phải chạy), **S-7 / S-8 / S-9** (gộp PR admin kế tiếp / owner chốt con số / owner quyết guard boot), nhóm **D** (owner chốt hướng persistence), phần lớn **Phase 8** và **G.2–G.5** (bundle ID, signing, license). **M-5 đã làm và đã đo** (`f3e9b1a`), nhưng thang điểm mới là **đổi luật**, nên OQ #15 vẫn mở: owner giữ hoặc đổi `fullScoreTiles`, một hằng số và một fixture. Nhóm **M đã xong cả sáu task**; còn đúng **một** việc cần người: kiểm bằng mắt ở 5 viewport (marker seat và tên tỉnh có đè lên quân/thành không) — máy đo được kích thước và zoom gate, không đo được "đọc có rối không".

Lý do **không** đảo Bước 1 lên trước Bước 0: mọi verification của Bước 1 (số test, band layout) đọc từ code trong working tree; nếu tree mất thì tài liệu vừa viết cũng sai theo.

Lý do **không** đưa P0.2–P0.5 vào Bước 2: P0.2/P0.3 chạm `store.ts` sâu và cần số đo p95 trước/sau, nên nên đi sau khi P0.1 tạo tiền lệ owner-review; P0.4 chờ owner quyết (OQ #2 — đã chốt 2026-09-04, thực thi ở Bước 13); P0.5 phụ thuộc P0.4 và `k6` chưa cài trên máy này.

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
- [ ] Owner xem lại hai nhánh và quyết N.1 / N.2 (OQ #2 đã chốt 2026-09-04 → nhóm M)

### PR.1 — Đưa 16 commit ra khỏi một máy ✅ (2026-09-03)

Nhãn của plan 2026-09-03 cho task này là "D.1"; ở đây gọi **PR.1** để không lẫn với
**D.1 `[130]`** (repository theo domain, nhóm scale). Owner đã chốt: push cả ba nhánh
**nguyên trạng** — không rebase, không squash, không merge — rồi mở PR xếp tầng.

| PR | Nhánh | Base | Commit | Nội dung |
|---|---|---|---|---|
| #1 | `feat/situation-room` | `main` | 4 | design tokens/primitives, Pixi resize, shell Situation Room, e2e theo role |
| #2 | `docs/truth-pass` | `feat/situation-room` | 4 | drill result vào runbook, ROADMAP + API truth pass, tasks |
| #3 | `feat/rate-limit-buckets` | `docs/truth-pass` | 8 | P0.1 bucket, CI 7D, test client/e2e, `buildingCosts`, B.1 security review |
| #4 | `fix/postgres-test-isolation` | `main` | 1 | **phát sinh** — `--test-concurrency=1` + assertion theo id cho outbox integration |

- [X] Ba nhánh có trên `origin` với tracking; **không** push `main`, **không** merge PR nào
- [X] Base của #2/#3 trỏ đúng nhánh cha (kiểm bằng `gh pr view --json baseRefName`) → diff mỗi PR đúng 4/4/8 commit, không nuốt commit của PR dưới
- [X] Mỗi PR body ghi rõ gate nào xanh ở máy contributor và `test:postgres` / `test:prod-smoke` / `drill:web-beta` **chưa từng quan sát được ở đây** (không Docker) — CI là chỗ chứng minh
- [X] PR #3 nêu hai High của B.1 và việc còn treo cho owner
- [X] Title ≤ 70 ký tự

**Hai gate CI đỏ, và bằng chứng chúng là flake có sẵn trên `main`:**
- **gate 5** (`test:postgres`) — `main` run `33479184803` đỏ ở `not ok 10`, PR #1 run `33660496854` đỏ ở `not ok 9`: khác test, cùng nguyên nhân. `git diff --stat main..feat/situation-room` chỉ chạm `apps/client/**` + `e2e/**` nên PR #1 không thể là nguyên nhân. Nguyên nhân thật: `node --test *.integration.test.js` chạy một tiến trình cho mỗi file với concurrency mặc định, mọi file dùng **cùng một database**, và các assertion cũ nói về *cả batch* (`report.failed`) chứ không về row đang test → hàng của file khác lọt vào. Sửa ở PR #4: `--test-concurrency=1` + helper `only(ids, id)` thu hẹp 8 assertion về đúng id của test đó. Base `main` là cố ý — merge #4 trước thì cả stack xanh mà không phải rebase nhánh đã push
- **gate 7** (Playwright) — `main` run `33505482280`, PR #2 `33660751567`, PR #3 `33660516946` đều đỏ ở gate 7; mỗi PR có hai run (`push` + `pull_request`) và chúng chia nhau một pass một fail, đúng dấu hiệu flake. Nguyên nhân: NPC `mob_migration` ("Đám di cư · 90") đứng đúng ô mà `map-command.spec.ts:42` click, nên inspector hiện NPC thay vì `Bộ binh · 10`. Đã ghi vào roadmap là flake đã biết, **chưa sửa** — sửa nó bây giờ sẽ đẩy Bước 7–9 ra khỏi vòng này

**Giới hạn:** hai job Docker (`prod-smoke`, `recovery-drill`) có `if:` giới hạn ở
`main` / `workflow_dispatch` / `schedule`, nên **push nhánh PR không bao giờ chạy chúng**.
Muốn có lần quan sát đầu tiên thì phải `gh workflow run` bằng tay — lần thử trong phiên này bị
chặn bởi lỗi hạ tầng phân loại lệnh, **vẫn còn nợ**.

**Scope:** S · **Deps:** none · **Owner đã chốt**

### Z.5 — ROADMAP/docs truth pass vòng 2 (2026-09-03)

Z.3 đã làm truth pass một lần, nhưng bốn thứ đã đổi sau đó: B.1 thêm test (server 117 → 124),
E.3-pre thêm một e2e (18 → 19), P0.1 đã landing nên checkbox rate-limit tick được, và 16 commit
giờ nằm ở PR chứ không còn là nhánh local. Nguyên tắc như Z.3: **chỉ sửa chỗ đang khẳng định
sai hoặc thiếu**, không viết lại lịch sử, không tự tick mục cần người chạy.

- [X] Ngày cập nhật `2026-09-02` → `2026-09-03`
- [X] Thêm đoạn trạng thái: công việc sau `f6085a4` nằm ở **bốn PR chưa merge**, `main` vẫn ở `f6085a4`, và hai gate CI đỏ là flake có sẵn (gate 5 → PR #4, gate 7 chưa có PR)
- [X] Test matrix: server `117 (102 pass + 15 skip)` → **`124 (109 pass + 15 skip)`**; Playwright `18 test / 10 file` → **`19 test / 10 file`** với `3` (không phải 2) test layout Situation Room; client giữ **78** — đã đo lại trên nhánh, con số `76` cũ là sai
- [X] **Tick** mục rate-limit bucket: P0.1 landing ở `d1212b4` (PR #3), ghi bốn bucket `write 20 / combat 10 / spy 5 / read 60` và `commandBuckets` khai báo tập trung trong `apps/server/src/app.ts`
- [X] Mục load test `[141]`: ghi rõ đang bị chặn bởi command path (P0.2 + P0.3) và sức chứa map (P0.4), `k6` chưa cài ở máy contributor, trỏ tới section mới
- [X] Mục security review: ghi **S-5 đã được owner chốt 2026-09-03** (bán kính Manhattan 3 + bucket `combat`), giữ S-9 / S-1-trên-stack-thật / S-7 / S-8 là việc của owner
- [X] **Section mới** `## Command path và sức chứa (chặn load test [143])` đặt sau Phase 7D, 5 mục chưa tick: S-5, P0.2 (= S-4), P0.3 (= S-3, ghi đủ **năm** cơ chế dedupe), P0.4 (owner chốt sức chứa, trần ~16 city), P0.5 (rerun load test) + tiêu chí đóng. **Không** đặt tên "Phase 7E" — số phase là của owner
- [X] `tasks/plan.md` + `tasks/todo.md` cập nhật tại chỗ (cùng phạm vi công việc nên không tách file mới)
- [ ] `docs/SECURITY-REVIEW.md`: hàng S-5 từ `⚠️ owner quyết` → `✅ đã sửa + test` — **chờ Bước 7 xanh**, không tick trước

**Verification:**
- [X] Mỗi con số trong test matrix đối chiếu output thật trên nhánh: `ℹ tests 3` (shared), `ℹ tests 124 / pass 109 / skipped 15` (server), `ℹ tests 78 / pass 78` (client), `playwright test --list` = 19
- [X] **Không** tick manual acceptance `[204]`, load test `[141]`, `backup.sh`/`restore.sh` (B.2b)
- [X] `git diff --check` sạch

**Bẫy đã gặp:** `npm test` trên code của `main` báo đỏ giả (`ENOENT tokens.css`, `.situation-room`
không có rule) vì `apps/*/dist/*.test.js` còn sót từ nhánh feature — `tsc` không xoá output mồ
côi. Phải `rm -rf apps/client/dist apps/server/dist packages/shared/dist` trước khi đo, nếu
không thì con số ghi vào roadmap là số của nhánh khác.

**Scope:** S · **Deps:** phần S-5 chờ Bước 7 · **Files:** `docs/ROADMAP.md`, `tasks/plan.md`, `tasks/todo.md`, `docs/SECURITY-REVIEW.md` (sau Bước 7)

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

PR.1 push + 4 PR ──> CI chạy prod-smoke + recovery-drill (cần workflow_dispatch) ──> B.2b có
                     quan sát đầu tiên
                └──> Z.5 ROADMAP truth pass vòng 2 (doc-only, chạy song song được)

B.1a S-5 ambush ──> (đứng trước P0.3 vì P0.3 viết lại claim() của logistics.ts)
P0.2 ledger window ──> P0.3a registry có trần ──> P0.3b bỏ state.processedCommands
       └──────────────┴──> dùng chung một con số idempotency window

P0.4 world capacity ──┐  ✅ đóng ở M-4 (135 ô)
P0.5 harness fix ─────┤
P0.2 ledger reload ───┼──> B.3 [141] load test run + report
P0.3 processedCommands┘
P0.1 rate-limit ──────────> B.1 [145] security review ──> B.1a S-5

M-1 một nguồn sự thật cho kích thước ──> M-2 thế giới 36×36 vẽ tay ──┬──> M-3 terrain rời dây
   (đứng trước vì M-2 đổi extent)          (client và server đọc     │     + PROTOCOL_VERSION 2
                                            cùng một world-map.ts)   │
                                                                     ├──> M-4 sức chứa ──> đóng
                                                                     │     P0.4, mở P0.5
                                                                     └──> M-5 chiếm vùng bằng
                                                                           quân đóng ──> M-6 vùng
                                                                           hiện ra trên màn hình

A.1 [204] manual acceptance ──> đóng Phase 7C

D.1 [130] domain repos ──> D.2 [131] shard kingdom_id ──> D.3 [132] stateless gateway
                                                              └──> D.4 [77] battle worker
C.1 misinformation (độc lập) ✅
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

### P0.2 — Bỏ full-table reload của event ledger khỏi command path (= S-4) ✅ `e22cde5`

**Đo lại từ code 2026-09-03.** `store.ts:99` (command) và `store.ts:122` (moderation) gọi
`await this.load()` **bên trong** transaction; `Store.load()` (`store.ts:72`) kết thúc bằng
`await this.ledger.load()`, và `EventLedger.load()` chạy
`SELECT id, event_type, …, payload, created_at FROM event_ledger ORDER BY created_at` —
**không `WHERE`, không `LIMIT`, và kéo cả `payload` JSONB** (payload chứa battle report). Nghĩa
là mỗi command trả tiền cho toàn bộ lịch sử season, không phải chỉ cho dedupe.

Nó nạp vào đúng hai chỗ: `history` — chỉ đọc qua `ledger.all()`, **6 call site và toàn bộ là
test**, production không đọc lịch sử ledger — và `commandIds`, đọc bởi `hasCommand()`
(`store.ts:95`) làm fast path **trước** transaction. Authority thật ở PG mode là point query
`SELECT 1 FROM event_ledger WHERE command_id=$1` trong transaction, dựa trên partial unique
index `event_ledger_command_idx` (`003_event_ledger.sql:11`, đã có sẵn).

**Thiết kế:**
1. `EventLedger.load()` chỉ `SELECT command_id … WHERE command_id IS NOT NULL ORDER BY created_at DESC LIMIT <window>` — một cột, có trần, mặc định 20 000, gọi thẳng là *idempotency window*. Không nạp `history` từ DB nữa.
2. `load()` **thôi xoá `this.events`** (event chưa persist). Hôm nay vô hại vì mọi appender chạy trong cùng slot `runExclusive` và `save()` được gọi ngay trong slot đó (`app.ts:216`), nhưng đó là mìn: appender mới nằm ngoài slot sẽ mất event im lặng.
3. Command/moderation path gọi `this.load({ skipLedger: true })` → command path phát **0** truy vấn ledger ngoài point query. Boot path giữ `load()` đầy đủ.
4. `hasCommand()` giữ chữ ký sync, đổi ngữ nghĩa thành **cache dương trong window**: miss thì rơi xuống transaction và point query bắt. Ở in-memory mode (không pool) Set vẫn đầy đủ theo process — ghi comment nói rõ ràng buộc này.

**Acceptance criteria:**
- [X] Command path không phát truy vấn nào lên `event_ledger` ngoài `WHERE command_id=$1` — `store.ts:99` và `:122` gọi `load({ skipLedger: true })`
- [X] Boot chỉ đọc một cột, có `LIMIT`, không đọc `payload` — `event-ledger.ts:53`; test khẳng định bằng `doesNotMatch /payload/` và `doesNotMatch /event_type|aggregate_type|aggregate_id|actor_player_id/`
- [X] Event pending sống sót qua `load()` — test append → `load()` → `persist()` thấy đúng id pending được INSERT
- [X] Dedupe không yếu đi: id ngoài window vẫn bị chặn bởi unique index (PG) / Set (in-memory) — `postgres.integration.test.ts:27`, `:37` assert trên DB (`count(*) … WHERE command_id=$1`), không đọc history in-memory, nên gate PG vẫn đúng bài
- [X] Retry cùng `commandId` vẫn trả `already_processed` và không trừ resource lần hai — `app.test.ts:77` xanh không sửa
- [X] `ledger.all()` vẫn dùng được cho test — `history` vẫn là buffer trong process (thêm trim theo window), chỉ không nạp từ DB; 6 call site test xanh không sửa

**Verification:**
- [X] `apps/server/src/event-ledger.test.ts` **mới**, pool giả ghi lại query, **không cần Docker**: 4 test — một query duy nhất chỉ `command_id` + `LIMIT $1` + `WHERE command_id IS NOT NULL` + `ORDER BY created_at DESC`; pending event không bị `load()` xoá; `hasCommand` miss ngoài window; history có trần + `discard()` nhả lại command id
- [X] `store.test.ts` (`hasCommand` ở `:37`, `:88`) và `moderation.test.ts:44` xanh không sửa assertion
- [X] `npm test -w @kingdoms/server` = **132 test / 117 pass / 0 fail / 15 skip** (128 → 132); `npm run typecheck` exit 0
- [X] **Không** khẳng định con số p95 PostgreSQL: máy này không chạy được `test:postgres` → đo trên CI hoặc stack owner sau

**Ghi chú thực thi (khác plan gốc ở ba điểm):**
1. Trần không hardcode: thêm env `IDEMPOTENCY_WINDOW` (Zod, `min 1000`, default `20000`) → `config.idempotencyWindow`, và `EventLedger` nhận nó qua tham số constructor thứ hai nên test đặt window nhỏ được (window 3 trong test history). Ghi vào `.env.example`, `infra/.env.prod.example`, `docs/OPERATIONS.md`, `docs/API.md` mục protocol.
2. `history` cũng bị trim theo cùng window (`event-ledger.ts:19`). Plan chỉ nói "không nạp từ DB", nhưng buffer append-only vẫn phình được trong một season dài chạy liên tục; trim là một dòng và `all()` chỉ có test đọc. Trim **không** phải quyết định dedupe: `commandIds` vẫn giữ id đã bị trim khỏi history.
3. `app.ts:151` (register) cố tình **giữ** `load()` đầy đủ: route này rate-limit 3/giờ/IP và sau bản sửa thì full load cũng chỉ còn một cột có trần.

**Một thay đổi hành vi, nói rõ ra:** id trùng do **process khác** ghi, hoặc cũ hơn window, không còn bị `hasCommand()` bắt ở fast path nên sẽ mở một transaction rồi bị point query từ chối. Đắt hơn một chút cho retry cũ, không mất bảo đảm — và fast path cũ vốn cũng không bắt được id của process khác trừ khi vừa boot.

**Dependencies:** None (⚠️ chạm `store.ts`) · **Scope:** M
**Files:** `apps/server/src/event-ledger.ts`, `apps/server/src/store.ts`, `apps/server/src/config.ts`, `apps/server/src/event-ledger.test.ts` (mới), `.env.example`, `infra/.env.prod.example`, `docs/OPERATIONS.md`, `docs/API.md`, `docs/ROADMAP.md`, `docs/SECURITY-REVIEW.md`

### P0.3 — Gộp dedupe về một đường có trần (= S-3) ✅ `97822af` + `f94ac22`

**Đọc code 2026-09-03 thì S-3 rộng hơn bản ghi cũ:** không phải một mảng phình, mà **năm** cơ
chế dedupe song song, và **ba** trong số đó bị sao chép **hai lần mỗi command** ở `store.ts:96`
(capture cho rollback) + `store.ts:99` (`load()` dựng lại):

| # | Cơ chế | Ở đâu | Trần | Copy mỗi command |
|---|---|---|---|---|
| 1 | `EventLedger.commandIds` Set | fast path `store.ts:95` | không | không |
| 2 | unique index + point query | `store.ts:99` — **authority duy nhất ở PG mode** | — | không |
| 3 | `state.processedCommands: string[]` trong JSONB | build `store.ts:134`, `espionage.ts:52,53`, **11 cặp** `diplomacy.ts` | không | 2× `structuredClone` |
| 4 | `CombatRepository.commands` Set | `combat.ts:104`, 6 call site | không | 2× `capture()` (`combat.ts:23`) |
| 5 | `LogisticsRepository.commands` + `OnboardingRepository.commands` | `logistics.ts:103` (5 call site), `onboarding.ts:92` (1) | không | 2× `capture()` |

Vì `state.processedCommands` nằm trong `game_state` JSONB nên nó phình cả **trên đĩa**; ba Set
kia phình trong RAM và bị sao chép hai lần mỗi command — cùng một triệu chứng, khác chỗ ở. Trần
dùng chung *idempotency window* của P0.2 để không có hai con số cần giữ đồng bộ.

#### P0.3a — Một registry có trần, thay ba Set `claim()` của repo ✅ `97822af`

- [X] `command-registry.ts` mới: Set có trần FIFO (`has`, `claim`, `begin`, `commit`, `rollback`, `forget(ids)`, `clear`, `size`), trần dùng chung `config.idempotencyWindow` của P0.2
- [X] `CombatRepository` / `LogisticsRepository` / `OnboardingRepository` nhận registry qua constructor, `private claim()` chỉ còn delegate — **không đổi call site nào** (6 + 5 + 1 chỗ giữ nguyên chữ ký)
- [X] Rollback: `Store` mở journal `begin()` trước `action()` và `rollback()` quên đúng id command này đã claim, thay cho `capture()`/`restore()` copy cả Set. `logistics.capture()` bỏ field `commands` (giữ `structuredClone(this.data)`), `onboarding.capture()` chỉ còn `progress`, `combat.capture()`/`restore()` **xoá hẳn** vì Set đó là toàn bộ state ngoài `GameState` của nó
- [X] Journal thay vì truyền danh sách id như plan viết ban đầu: `claim()` nằm sâu trong method của repository nên store không quan sát được id nào vừa bị claim. `begin()` cố tình huỷ journal mồ côi — `runExclusive` serialize transaction nên tới được `begin()` nghĩa là command trước đã xong. `moderatePlayerUnlocked` không bọc journal (nó không claim command id nào)

**Verification:**
- [X] `command-registry.test.ts` mới, 7 test: claim hai lần, eviction FIFO (id cũ nhất ra trước, id mới nhất còn), rollback quên đúng id của command lỗi kể cả id dẫn xuất, commit đóng journal, claim ngoài transaction là vĩnh viễn (path tick), `begin()` huỷ journal mồ côi, `clear()`
- [X] `logistics.test.ts` / `combat.test.ts` / `onboarding.test.ts` xanh **không sửa assertion**
- [X] Test rollback sẵn có ở `store.test.ts` vẫn khẳng định đúng "no ledger residue"
- [X] `npm run typecheck` sạch; server unit **139** (124 pass + 15 skip vì gate PostgreSQL)

**Dependencies:** P0.2 (dùng chung window) · **Scope:** M · ⚠️ hot file
**Files:** `apps/server/src/command-registry.ts` (mới), `store.ts`, `combat.ts`, `logistics.ts`, `onboarding.ts` + 1 test mới

#### P0.3b — Bỏ `state.processedCommands` ✅ `f94ac22`

- [X] `startBuild` ở `store.ts`, `espionage.ts` (`launchMission` + `activateCounterIntel`), **11 cặp** check/push trong `diplomacy.ts` chuyển sang registry; `DiplomacyRepository`/`EspionageRepository` nhận registry qua constructor như ba repo kia
- [X] Bỏ field ở `types.ts`, bỏ dòng reset ở `season-reset.ts` — store gọi `commands.clear()` **sau khi reset đã bền** (sau COMMIT ở path PostgreSQL, ngay sau `hardReset` ở path in-memory) nên một season close bị rollback không xoá dedupe; **strip key cũ khi load** bằng destructure trong `Store.load()` để hàng JSONB đang tồn tại co lại ở lần `persistState` kế tiếp — một key không cần migration riêng
- [X] Ghi vào commit body **ba** thay đổi hành vi, không phải một: (1) dedupe giờ **claim tại chỗ check** thay vì push khi thành công — an toàn vì mọi command REST đi qua `command()` → `executeCommand` và rollback `forget()` đúng id đó; (2) id dẫn xuất `commandId + "-violate"` (tick `combat.ts`, ambush `logistics.ts`) mất dedupe **bền qua restart** — an toàn vì `breakTreaty` có guard cứng `TREATY_NOT_ACTIVE` và pursuit order bị tiêu ngay khi resolve; (3) `commands.clear()` khi đóng season giờ quên cả id combat/logistics/onboarding (trước đây ba Set đó sống qua ranh giới season) — PG mode vẫn được `event_ledger` + unique index chặn, in-memory mode yếu hơn sau một season close

**Verification:**
- [X] `combat.test.ts` chuyển sang `store.commands.has("purs-8-violate")`
- [X] Test diplomacy cũ xanh không sửa assertion; test mới "a retried break treaty is idempotent, not a second penalty": cùng `commandId` hai lần → `already_processed`, reputation vẫn −150 (không phải −300), và một `commandId` **khác** vẫn bị `TREATY_NOT_ACTIVE`
- [X] Test mới `store.test.ts` "a build that fails on cost leaves its commandId claimable" — ca hay gặp nhất của claim-tại-chỗ-check: build thiếu tài nguyên → throw nhưng `commandId` không bị tiêu, retry cùng id được nhận rồi lần ba trả `already_processed`
- [X] `npm test -w @kingdoms/server` **141** (126 pass + 15 skip) + `npm run typecheck` sạch

**Dependencies:** P0.3a · **Scope:** M · ⚠️ hot file
**Files:** `apps/server/src/store.ts`, `diplomacy.ts`, `espionage.ts`, `types.ts`, `season-reset.ts` + tests

### P0.4 — Nâng sức chứa thành phố của thế giới ✅ → **thực thi ở nhóm M** (2026-09-04)

`cityPlacement()` (`store.ts:26-45`) quét `[2..17]²`, yêu cầu Manhattan ≥3 giữa các city và ≤2 tới anchor. Anchor chỉ có 4: 3 resource node (6,8 / 15,10 / 10,14) + 1 market hub quanh (10,10), do `logistics.ts` `seed()` và `seedMarketHub()` tạo. Mỗi đĩa Manhattan bán kính 2 nhận ~4 city → trần ~16, khớp ghi chú "trần ~16 ô đặt thành phố" ở roadmap dòng 203. `loadtest-seed.ts` từ chối `LOADTEST_USERS < 100` nên seed throw `KINGDOM_FULL` khoảng user thứ 17.

**Đo lại trước khi làm:** trần thật là **14** (2 thành seed + 12), không phải ~16 — 51 ô nằm trong Manhattan 2 của anchor, luật cách ≥3 cắt còn 14. Và `LOADTEST_USERS` mặc định **120**, không phải 100.

**Quyết định (OQ #2, chốt qua plan `snuggly-forging-spring.md` 2026-09-04):** mở map. Bốn quyết định và bản thực thi nằm ở **nhóm M** dưới đây (M-1 → M-4 đã xong, `143a0dc` / `f62d64a` / `fa6fd0d`). Kết quả đo: **14 → 135 ô**. Owner vẫn cần xác nhận trước khi push vì change set chạm ba hot file.

**Acceptance criteria:**
- [X] Kích thước map thành một hằng số chia sẻ duy nhất; xoá hardcode ở `packages/shared/src/index.ts` (`moveArmyCommandSchema` clamp 0..19) và `apps/client/src/map.ts` — đo thật có **8** chỗ khai lại, không phải 5; xem M-1
- [X] Số anchor scale theo sức chứa mong muốn (**36** anchor vẽ tay: 4 thương cảng + 32 mỏ); `cityPlacement()` đặt được **135** city, mục tiêu là 120
- [X] Test khẳng định sức chứa: `logistics.test.ts` đặt city tới `KINGDOM_FULL`, assert sàn `>= 130`, và assert `citySiteCapacity()` **bằng** số store thật đạt được
- [X] Ảnh hưởng travel time / logistics distance ghi vào `docs/GAME-DESIGN.md` — kèm cái không tự đổi: `raiders.targetCount`, `capacity`/`recoveryRate` của mỏ và bán kính supply vẫn là số của thế giới 20×20 (OQ #17)

**Verification:**
- [X] `npm test` — sức chứa đo trong `logistics.test.ts` (không `store.test.ts`: placement cần bộ anchor thật của logistics)
- [ ] `npm run test:e2e` — **chưa chạy lại sau khi đổi bản đồ**; trần ~16 không còn là lý do reset per-scenario, nhưng `map.spec.ts` / `map-command.spec.ts` / `economy.spec.ts` là guard thật cho thế giới mới
- [ ] Mở `npm run dev:web`, xác nhận map render đúng kích thước mới — kiểm mắt ở Checkpoint C của nhóm M

**Dependencies:** Owner decision (đã có) · **Scope:** M–L tuỳ phương án
**Files:** `packages/shared/src/index.ts`, `apps/server/src/store.ts`, `apps/server/src/logistics.ts`, `apps/client/src/map.ts`, `apps/server/src/logistics.test.ts`

### P0.5 — Sửa harness k6 cho khớp hạn mức thật

Scenario `commands` trong `e2e/loadtest/loadtest.js` chạy `constant-arrival-rate` 10/s với `preAllocatedVUs: 10, maxVUs: 30`, chọn user bằng `fixture.users[__VU % length]` → chỉ ~10 user thật nhận tải, tức ~60 command/phút/user so với hạn mức 20/phút. `429` không nằm trong tập chấp nhận (`ok = status === 200 || (400 && gameplayRejection)`) nên rate-limit rejection bị tính là lỗi và phá threshold `command_errors: rate<0.01`.

**Acceptance criteria:**
- [ ] Tải phân bố đều trên toàn bộ user trong fixture
- [ ] Tốc độ mỗi user dưới hạn mức write, **hoặc** `429` đo thành metric riêng thay vì tính là lỗi — chọn một và ghi rõ trong comment đầu file
- [ ] `options.thresholds` phản ánh đúng ý nghĩa đã chọn

**Verification:**
- [ ] `k6 run --duration 1m e2e/loadtest/loadtest.js` trên stack local, không có lỗi giả từ 429

**Dependencies:** ~~P0.4~~ (xong ở nhóm M — fixture seed được 120 user với dư 15) · **Scope:** S
**Files:** `e2e/loadtest/loadtest.js`, `apps/server/src/loadtest-seed.ts`

### Checkpoint 1 — sau P0.1–P0.5
- [ ] `npm run verify:web-alpha` xanh
- [ ] Có số đo p95 command trước/sau P0.2+P0.3
- [X] Seed `LOADTEST_USERS` mục tiêu không throw `KINGDOM_FULL` — sức chứa **135** so với profile **120**; vượt trần thì `loadtest-seed` từ chối kèm trần thật **trước khi ghi hàng đầu tiên** (`fa6fd0d`)
- [ ] **Owner review** — nhóm này chạm `store.ts` / `app.ts`

### Checkpoint 1b — sau Bước 5–9 (vòng 2026-09-03)

- [X] **5** PR mở, base đúng, CI đã chạy; kết quả từng gate báo nguyên trạng kể cả đỏ
- [X] `docs/ROADMAP.md` không còn dòng khẳng định sai; checkbox rate-limit tick; section command path tồn tại
- [X] Chưa merge gì, chưa chạm `main`
- [X] Nhánh `perf/command-path` (cắt từ `feat/rate-limit-buckets`) đã push và mở **PR #5** base `feat/rate-limit-buckets` — thực tế **6 commit** chứ không 4: Z.5 `dbf5c6f` cũng nằm trên nhánh này, cộng commit doc đóng P0.3 `fa676c7`. CI của PR (`33707700712`) **10/10 gate xanh**, gồm gate 5 `test:postgres` và gate 7 Playwright — lần đầu một PR trong chồng có đủ 10 gate xanh; nhưng cả hai gate đó đỏ *ngẫu nhiên* nên một lần xanh không phải bằng chứng race đã hết
- [X] typecheck sạch; server unit **141** (126 pass + 15 skip); client **78/78**; shared **3/3**; **19/19** e2e trên port 3100/5174 (config tạm, đã xoá — không chạm stack 3000/5173)
- [X] `check:bundle` ≤ 500 KiB/chunk — 6/6 chunk trong hạn, lớn nhất `pixi` **465.0 KiB**
- [X] `test:postgres` báo cáo là **skipped ở máy này** (không có Docker / `DATABASE_URL`) → **không** khẳng định `verify:web-alpha` xanh dựa trên máy contributor; 15 test server skip chính là gate đó. Nó **đã xanh trên CI** (gate 5, run `33707700712` + `33707793916`) — đó là chỗ duy nhất quan sát được, và cũng là phần phủ đúng `store.ts`/`event-ledger.ts` mà P0.2/P0.3 sửa
- [X] `gh workflow run` để `prod-smoke` + `recovery-drill` có lần quan sát đầu tiên — **xong 2026-09-03**, run `33707793916` (`workflow_dispatch`, ref `perf/command-path`): `verify` 10/10 gate, `prod-smoke` **xanh** (compose prod build thật, `password-auth` 1/1), `recovery-drill` **xanh** (3/3 drill, RPO 0 ms, RTO **4439 ms**, artifact `drill-report`). Kết quả đã vào `docs/OPERATIONS.md` mục "Kết quả drill" và `docs/ROADMAP.md` section 7D
- [ ] Còn lại cho owner: ~~P0.4 (sức chứa map)~~ (đóng 2026-09-04 ở nhóm M — 135 ô), S-9, xác nhận S-1 trên stack Caddy thật, S-7, S-8, thứ tự merge **8** PR, và `infra/backup/backup.sh`/`restore.sh` vẫn chưa được kiểm chứng lần nào (drill đi qua `pg_dump` trực tiếp). Flake gate 7 **không còn trong danh sách này** — đã sửa ở `1d9acc1`

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

### B.1 — [145] Security review auth / permissions / input / secrets ✅ **xong**

`docs/SECURITY-REVIEW.md` đã viết; `[145]` đã tick. Kết quả: 10 finding, hai High **đã sửa kèm test hồi quy**, một Low hardening đã sửa, hai Medium trỏ về P0.2/P0.3 đã có task, một Medium + hai Low để owner quyết.

**Acceptance criteria:**
- [X] `docs/SECURITY-REVIEW.md` phủ 4 trục: **auth** (scrypt `N=131072`, sha256 digest, `timingSafeEqual`, `dummyPasswordHash`, refresh rotation thu hồi cả `family_id`, `FOR UPDATE`), **permissions** (matrix 22 hành động, mỗi dòng có `file:line`; guard nằm ở tầng domain nên không route nào bỏ sót được), **input** (26 command POST đều Zod, `bodyLimit` 64 KB, `requestTimeout` 15 s, SQL tham số hoá), **secrets** (production gate, `METRICS_TOKEN`, Pino redact)
- [X] Mỗi phát hiện có severity + `file:line` + đề xuất sửa
- [X] Finding mức cao có test hồi quy: **S-1** ở `security.test.ts` (`x-forwarded-for: "1.2.3.4, 203.0.113.9"` từ peer `172.18.0.5` → `request.ip === "203.0.113.9"`) + `config.test.ts` (`"trustProxy":1` cho `TRUST_PROXY=true`, từ chối `"0"`/`"yes"`); **S-2** ở `app.test.ts` (viewer thấy kho của mình, thấy 0/`{}`/`[]` ở city người khác, `store.snapshot` vẫn giữ số thật, `id`/`x`/`y`/`playerName`/`frozen` không bị blank)
- [X] Hạn mức thật đã đối chiếu `docs/API.md` — mục "Rate limit" của review dẫn `app.ts:102-105` và mọi key IP-based có `file:line`
- [X] Hai finding từ Z.4 đã xử: (a) GET không có hạn mức → P0.1 cho ba GET bucket `read` 60/phút; (b) bucket write dùng chung → P0.1 tách `write`/`combat`/`spy`
- [X] Re-baseline theo code sau 7D: review chỉ ghi phần **chưa** được xử lý, và có riêng mục "kiểm soát đã xác nhận" để những gì 7D làm đúng không bị báo lại thành finding

**Hai finding cao đã sửa:**
- **S-1 (High)** `TRUST_PROXY` là boolean nên tới `proxy-addr` thành "tin cả chuỗi `X-Forwarded-For`", và `proxy-addr` khi đó trả entry **ngoài cùng bên trái** — thứ client tự ghi, vì Caddy *append* peer address chứ không thay thế. Mọi hạn mức theo IP (`login` 5/15m, `register` 3/h, `refresh` 30/m, `admin` 10/m + 5/m) bị vô hiệu bằng cách đổi một header, tức lockout credential stuffing tắt hẳn. Sửa: `TRUST_PROXY` thành **số hop** (`config.trustProxy: false | number`), `app.ts` biến số hop thành đúng predicate `proxy-addr` compile ra (`hop < trustedHops`) vì kiểu của Fastify nhận predicate mà không nhận `number`.
- **S-2 (High)** `getSnapshot()` phát `resources`/`buildings`/`queues` thật của **mọi** city qua `/api/bootstrap`, mọi response command và mọi broadcast — trong khi mission `scout` tốn iron, có cooldown, bị counter-intel chặn và làm mờ theo `accuracy` để bán đúng ba field đó. Là **thiếu sót chứ không phải thiết kế**: `battleReports` và `spyMissions` ngay cạnh đã lọc theo viewer, `cities` là collection duy nhất bị bỏ sót. Sửa: city người khác giữ phần map hợp pháp hiển thị, nội thất về 0/`{}`/`[]`. Zero thay vì bỏ field nên `WorldSnapshot` giữ một shape, không sửa `packages/shared`, không sửa client — đã kiểm cả 8 panel đều resolve city của chính mình qua `playerId`.

**Verification (đã chạy):**
- [X] `npm test -w @kingdoms/server` → **124 test, 109 pass, 0 fail, 15 skip** (postgres-gated), tăng từ 121/106/15
- [X] `npm run typecheck` sạch cả ba workspace
- [X] E2E 19/19 pass trên port 3100/5174 (không chạm stack dev của owner)
- [ ] `test:postgres` **không chạy được ở máy này** (không Docker, không `DATABASE_URL`) → báo cáo là skipped, **không** viết `verify:web-alpha` xanh
- [ ] Owner review lại tài liệu

**Dependencies:** P0.1 (xong) · **Scope:** M
**Files:** `docs/SECURITY-REVIEW.md` (mới), `docs/API.md` (mục `## World snapshot`), `docs/ROADMAP.md` (tick `[145]`, ghi chú `TRUST_PROXY` ở dòng security baseline), `apps/server/src/{app,config}.ts`, `apps/server/src/{app,config,security}.test.ts`, `.env.example`

**Việc còn treo cho owner** (đã vào Open questions #10, #11): ~~tiền đề không gian của `ambush`~~ → **S-5 đã được owner chốt 2026-09-03**, thành task B.1a ngay dưới; còn lại là có bắt buộc `TRUST_PROXY` ở production không (S-9, guard đó có thể chặn boot một deployment tôi không kiểm chứng được) và xác nhận S-1 trên stack thật có Docker. Ba Low còn lại (S-7 admin route không Zod, S-8 trần WS connection, S-10 status `ADMIN_DISABLED` lệch) đã vào mục "việc dọn nhỏ".

### B.1a — S-5: `ambush` phải có tiền đề không gian ✅ `b90fb59`

`logistics.ts:166-186` hôm nay chỉ kiểm ba thứ: player active, caravan đang `moving`, và không
phải caravan của mình. **Không** đòi có quân, không đòi ở gần, không tốn tài nguyên, không
cooldown, và chạy ở bucket `write` 20/phút (`ambush` không có trong `commandBuckets` ở
`app.ts:125`). Một người chơi xoá được 60% hàng của **mọi** caravan trên map, từ bất kỳ đâu,
miễn phí — và hệ thống hộ tống thành vô nghĩa. `attack` thì đòi sở hữu army và chỉ resolve khi
cùng ô.

**Luật owner chốt 2026-09-03:** người tấn công phải có quân trong bán kính Manhattan **3 ô**
quanh vị trí caravan hiện tại, và `ambush` chuyển sang bucket **`combat`** (10/phút).

**Thiết kế:**
- Helper thuần `caravanTile(caravan, state, hubs)` trong `logistics.ts`: lerp `source city → destination (city | market hub)` theo `progress` rồi `Math.round`. Caravan **không có** `x`/`y` — vị trí là thứ client tính ở `apps/client/src/map.ts:322-335`, nên đây là **bản mirror** của đoạn đó: server kiểm đúng ô mà người chơi nhìn thấy. Ghi comment trỏ chéo hai chỗ. (Gộp về `packages/shared` là follow-up: chạm shared cần owner review, và lerp phía client nằm trong vòng Pixi nên không unit-test được ở máy này.)
- Guard mới trong `ambush()`, đặt **sau** `INVALID_ATTACKER` và **trước** `claim()`/seed: phải có ít nhất một army `ownerPlayerId === attackerPlayerId`, không `frozen`, với `Math.abs(army.x - tile.x) + Math.abs(army.y - tile.y) <= 3`; sai thì `throw new Error("AMBUSH_OUT_OF_RANGE")` → 400. Viết cùng idiom với `HARVEST_OUT_OF_RANGE` (`logistics.ts:111`): Manhattan inline, **không** thêm util mới (repo đang inline ở 9 chỗ).
- `app.ts:125`: thêm `ambush: "combat"` vào `commandBuckets`. Không đổi mã lỗi, không đổi schema, không đổi `PROTOCOL_VERSION`.

**Acceptance criteria:**
- [X] Ambush không có quân trong bán kính 3 → 400 `AMBUSH_OUT_OF_RANGE`, caravan **không** đổi trạng thái và **không** tiêu `commandId`
- [X] Quân ở đúng khoảng cách 3 → chấp nhận; khoảng cách 4 → từ chối (test biên hai phía)
- [X] Army đang `frozen` không tính là hợp lệ
- [X] `ambush` tiêu bucket `combat`: cạn 10 lệnh combat thì ambush bị 429, và ambush **không** làm 429 lệnh build
- [X] Ô kiểm là ô lerp theo `progress`, không phải city nguồn — caravan giữa đường vẫn ambush được nếu quân ở gần *nó*

**Verification:**
- [X] `logistics.test.ts:42` (test ambush sẵn có) cập nhật: helper `ambushScenario()` dựng cảnh, test cũ đặt army của `enemy` cạnh caravan (8,9); thêm 4 test — out-of-range + `commandId` chưa bị tiêu, biên 3/4 + ô theo `progress` 0.6 → (11,10), `frozen`/`strength 0`, và `caravanTile` mirror + fail closed
- [X] Test bucket cho `ambush` → `combat`: mở rộng `app.test.ts` "command rate-limit buckets are independent per command group" — vòng 10 lệnh combat luân phiên attack/formation/**ambush**, lệnh 11 (attack) 429, ambush cũng 429, harvest vẫn không 429
- [X] `npm test -w @kingdoms/server` xanh: **128 test → 113 pass / 0 fail / 15 skip** (từ 124/109); `npm run typecheck` sạch
- [X] E2E không bị ảnh hưởng — đã grep `e2e/`, không spec nào gọi `ambush`

**Ghi chú thực thi (khác plan gốc ở ba điểm, đều là chặt hơn):**
1. Guard đòi thêm `army.strength > 0`. Army `strength 0` bị xoá khỏi `state.armies` ở `combat.ts:320-321` và tick bỏ qua ở `:329-330`, `attack` chặn bằng `ARMY_DESTROYED` (`combat.ts:151`) — nếu không kiểm, một army chết vẫn "canh đường" cho tới tick sau. Định nghĩa "army còn sống" của repo là `strength > 0 && !frozen`.
2. `caravanTile()` trả `undefined` khi không resolve được hai đầu route → guard **fail closed** (`AMBUSH_OUT_OF_RANGE`). Client cũng ẩn caravan đó (`visible = false`), nên không có ô nào người chơi có thể đứng cạnh một cách hợp lệ.
3. `caravanTile` được `export` để test lerp trực tiếp (biên rounding), không chỉ test qua `ambush()`. `ambushRange = 3` là hằng module cạnh `mapExtent`, có comment vì sao là 3.

**Dependencies:** None — nhưng **đứng trước P0.3** để P0.3 không phải rebase `logistics.ts` hai lần · **Scope:** S · ⚠️ chạm `app.ts` một dòng
**Files:** `apps/server/src/logistics.ts` (`ambushRange` :16, `caravanTile` :42, guard :192), `apps/server/src/app.ts` (:125), `apps/server/src/logistics.test.ts`, `apps/server/src/app.test.ts`, `docs/API.md`, `docs/SECURITY-REVIEW.md`, `docs/ROADMAP.md`

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
- [ ] `[204]`, `[141]` tick được, hoặc blocker ghi rõ (`[144]` đã tick ở Z.2/Z.3, `[145]` đã tick ở B.1)
- [ ] Report load test lưu và link từ `OPERATIONS.md`
- [ ] Phase 7C đóng; Phase 7A hết mục "trước beta"

## Nhóm UI — Cải tổ HUD, Situation Room vòng 2 (2026-09-03)

Owner nhờ cải thiện **toàn bộ UI/HUD**. Việc này không bắt đầu từ số không: vòng redesign trước
ship Situation Room thành ba phần (tokens + primitives, Pixi resize bridge, shell 5 vùng) và **tự
để lại ba mốc trong code** nói rõ phần còn thiếu — `ActivityColumn.tsx:6` ("PR4 replaces the whole
`<ActivityFeed />` slot below"), `CommandTray.tsx:17` ("PR5 fills it with contextual command
groups") và bridge `.hud .kom-panel` ở `styles.css:120-124` ("It goes away with `.hud section`
once the column is assembled from panels"). Nên "cải thiện toàn bộ" = **đi hết con đường đã
vạch** + bịt 12 lỗi đọc được từ code, **không** đổi hướng thiết kế.

Ràng buộc chung cho cả nhóm: **không sửa một file nào trong `apps/server` hoặc `packages/shared`**
(nên vòng này không cần owner ping cho hot file, và con số server unit **141** phải không đổi);
client test chạy trên bare `node --test` nên mọi logic mới là **module thuần**, contract CSS/markup
assert bằng **text scan** theo idiom `ui-primitives.test.ts` / `layout.test.ts`; 5 tên class e2e đo
(`.strategic-header` `.kingdom-column` `.map` `.activity-column` `.command-tray`) là **bất biến**;
`<MapSurface />` không re-key, không `position: absolute` cho column.

### UI-1 — Từ vựng, gate giá và selector pending ✅ `bae7060`

Ba module thuần mọi task sau đều cần, cộng consumer đầu tiên để task tự đứng được. `StrategicHeader.tsx:43`
in **key snapshot tiếng Anh thô** (`food`/`wood`/`stone`/`iron`) trong UI tiếng Việt, và ba panel
viết giá theo ba cách (`{cost.wood}g {cost.stone}đ {cost.iron}s`, `hàng {cargo.wood}g/...`, một
biến thể ở `ArmyPanel`), không chỗ nào dùng `.kom-num`.

**Acceptance criteria:**
- [X] `ui/vocabulary.ts`: `resourceLabels` phủ `keyof Resources` (import read-only từ shared) → thêm resource mới là **lỗi compile**, không phải lỗi hiển thị
- [X] `formatCost` / `formatCargo` là **một** cách viết duy nhất; không component nào còn template giá viết tay
- [X] `affordable(city, cost)` trả `{ ok, reason }` nêu **đúng** loại tài nguyên thiếu, không phải "không đủ tài nguyên" chung
- [X] `pendingFor(pending, kind, match?)` phân biệt hai lệnh cùng `kind` khác `body`, và phân biệt `sending` vs `uncertain`
- [X] `data-testid={`resource-${key}`}` **không đổi** → không spec e2e nào phải sửa

**Verification:** `vocabulary.test.ts` (nhãn đủ, một cách viết giá, text scan chặn chuỗi giá viết tay) + `validation.test.ts` (đủ/thiếu từng loại) + `commands.test.ts` (`pendingFor` theo `body`/`status`); typecheck sạch

**Files:** `ui/vocabulary.ts` (mới), `validation.ts`, `commands.ts`, `components/StrategicHeader.tsx`, test mới · **Deps:** none

### UI-2 — Một implementation modal duy nhất ✅ `1d1723a`

Bốn modal, ba cái sai. `TreatyBreakModal` (`AdvancedDrawer.tsx:12-42`) đã làm đúng: focus trap,
Escape, restore focus. Nâng nó thành primitive rồi kéo ba cái còn lại vào. Đứng **trước** UI-3 vì
`ArmyPanel` có hai modal inline — làm ngược lại là sửa cùng file hai lần.

**Acceptance criteria:**
- [X] Cả bốn modal: Tab không rời dialog, Escape đóng, focus về đúng control đã mở nó
- [X] Mỗi dialog có `aria-modal="true"` và được đặt tên bằng chính tiêu đề của nó
- [X] `role="dialog"` chỉ xuất hiện ở `ui/Modal.tsx`
- [X] Không thêm `confirm()`/`alert()` (`no-native-dialogs.test.ts` vẫn xanh)

**Verification:** text scan mới trong `ui-primitives.test.ts` (file duy nhất chứa `role="dialog"`); e2e treaty modal (focus trap / Escape / −150) **xanh không sửa assertion** — bằng chứng primitive không làm rớt hành vi

**Files:** `ui/Modal.tsx` (mới), `components/BattleReportModal.tsx`, `components/ArmyPanel.tsx`, `components/AdvancedDrawer.tsx`, `ui-primitives.test.ts` · **Deps:** none

### UI-3 — Cột kingdom: bốn panel người chơi dùng mỗi phút ✅ `b7ee0a4`

Task lớn nhất và là chỗ đổi cảm giác chơi nhiều nhất. Mỗi panel đi một lượt **trọn vẹn** (markup →
gate → pending → state per-row → test) thay vì ba lượt ngang qua cả bốn file.

**Acceptance criteria:**
- [X] Nav bỏ emoji `🏰 ⚔ 🚚 🕊` → `Icon`, `<button>` thô → `Button variant="ghost"`, giữ `aria-current`
- [X] Không còn `<section className="...-panel">` + `<h2>` viết tay; tất cả qua `Panel`/`PanelHeader`/`PanelBody`
- [X] Không nút nào `disabled` mà không có `reason` nhìn thấy được (guard trong `ui-primitives.test.ts`)
- [X] `CityPanel` khoá nút Xây khi thiếu tài nguyên, nêu **thiếu loại nào** — không còn để server trả 400
- [X] Chip pending xuất hiện **cạnh chính control đã phát lệnh**, thành `uncertain` + "Thử lại" khi timeout; `.pending-strip` giữ làm bản tổng hợp cho band compact
- [X] `escortId` của `LogisticsPanel` và `targetId` của `ArmyPanel` thành state **theo từng hàng** — chọn ở hàng 1 không còn áp cho hàng 3
- [X] Bề rộng cột và vị trí map không đổi (`situation-room.spec.ts` xanh không sửa)

**Verification:** `ui-primitives.test.ts` + `layout.test.ts` (CSS legacy vào danh sách dead-CSS absence); client unit xanh; e2e layout + double-submit xanh

**Files:** `components/KingdomColumn.tsx`, `CityPanel.tsx`, `ArmyPanel.tsx`, `LogisticsPanel.tsx`, `OnboardingPanel.tsx`, `styles.css`, `styles/primitives.css`, hai file test · **Deps:** UI-1, UI-2

### UI-4 — Drawer nâng cao, rồi xoá rule bridge ✅ `a7434b6`

Cặp `.hud section` + `.hud .kom-panel` **tự duy trì nhau**: khi `.hud section` còn dressing panel
thì xoá bridge làm padding gấp đôi; khi bridge còn zero padding thì xoá `.hud section` không thấy
gì đổi. Nên hai rule phải đi trong **một** commit, và `margin-top: 1rem` từng phát cho mỗi panel
được thay bằng `gap` của chính cột.

**Acceptance criteria:**
- [X] Bốn bề mặt drawer (`AlliancePanel` `EventsPanel` `ArchivePanel` `DiplomacyPanel`) qua primitives → **13/13** bề mặt dùng design system
- [X] Không component nào in raw enum/ID cho người chơi đọc (`worldEventLabels` / `treatyLabels` / `allianceRoleLabels`)
- [X] `.hud section` và `.hud .kom-panel` **không còn** trong `styles.css`, mà panel vẫn đúng khoảng cách (`.kingdom-column` flex + `gap: var(--kom-space-6)`)
- [X] `DiplomacyPanel` hết nhảy `h2` → `h4`
- [X] `AdvancedDrawer` vẫn lazy — chunk riêng 16.5 KiB, `check:bundle` 6/6 trong hạn

**Verification:** `layout.test.ts` khẳng định **cả hai absence + bản thay thế** (không để rule mọc lại sau một comment hứa xoá sau); `ui-primitives.test.ts` mirror test "một wording, một glyph, một chip cho mỗi world event"; ba assertion e2e đổi sang wording tiếng Việt người chơi thật đọc

**Phát sinh sửa kèm:** `.pending-strip` (0,1,0) từng bị `.hud section` (0,1,1) đè nên render nổi trên `--kom-surface` thay vì hộp sunken nó tự khai — đọc specificity phát hiện, không phải nhìn màn hình.

**Files:** `components/AdvancedDrawer.tsx`, `KingdomColumn.tsx`, `ui/vocabulary.ts`, `styles.css`, `styles/tokens.css`, `layout.test.ts`, `ui-primitives.test.ts`, `e2e/phase7c.spec.ts`, `e2e/production-loop.spec.ts` · **Deps:** UI-1, UI-3

### Checkpoint A — sau UI-1 + UI-2 ✅
- [X] Không còn chuỗi giá viết tay; header hết key tiếng Anh
- [X] Cả 4 modal có focus trap + Escape + restore focus; `role="dialog"` chỉ ở `ui/Modal.tsx`
- [X] typecheck sạch, client unit xanh, e2e treaty regression xanh **không sửa assertion**

### Checkpoint B — sau UI-3 + UI-4 ✅
- [X] **13/13** bề mặt qua primitives; **rule bridge `.hud .kom-panel` và `.hud section` đã xoá**
- [X] Không nút khoá nào thiếu lý do; pending hiện tại chỗ control
- [X] Bug state dùng chung (`escortId`, `targetId`) đã hết
- [X] `layout.test.ts` dead-CSS absence phủ mọi rule vừa xoá → không thể mọc lại
- [X] typecheck sạch; shared **3**, server **141** (126 pass + 15 skip, **không đổi** — không sửa file server nào), client **101/101**
- [X] `check:bundle` 6/6 chunk ≤ 500 KiB; `AdvancedDrawer` vẫn lazy
- [X] E2E **20/21** trong một lần chạy full trên port 3100/5174, test thứ 21 (`phase7c` treaty break) **xanh khi chạy riêng** — đúng dấu flake đã ghi, không phải regression

### UI-5 — Cột hoạt động: feed thật, suy từ client (slot "PR4") ✅ `c8a4f84`

Slot được đặt chỗ có chủ ý kèm lý do: *"Inventing rows that look like real events would be worse
than an empty state."* Nên feed **chỉ** dựng từ nguồn client đã giữ — pending transition, `reports`,
`notices`, diff snapshot — **không** thêm route, không thêm event server, không sửa protocol.

**Acceptance criteria:**
- [X] Mỗi lệnh người chơi phát sinh **đúng một** hàng feed, không trùng khi snapshot lặp — dedupe theo id của chính sự việc, không theo "đổi so với tick trước"
- [X] Ring có trần 50, mới nhất trên đầu, không rò bộ nhớ theo thời gian chơi; tick không có gì mới trả **cùng một array** (identity) nên không re-render
- [X] Mỗi `kind` có đúng một state + một icon + một wording (**dùng chung** map với `EventsPanel` của UI-4); thêm `kind` mà quên wording là **lỗi test**
- [X] Không hàng nào in raw ID/enum; hàng có `anchor` thì click gọi `revealPanel()` đã có (`openSurface` là cái mới: `toggleSurface` sẽ đóng đúng cột mà cú nhảy đang mở)
- [X] Rỗng thì vẫn là empty state thật ("Chưa có gì cần chú ý."), không skeleton giả
- [X] Cột không đổi bề rộng, không sinh scroll ngang ở band `wide`
- [X] Thêm panel **"Cần chú ý"** đọc trực tiếp từ snapshot hiện tại (lệnh chưa xác nhận, treaty/vote chờ ta trả lời, quân dưới ngưỡng attrition) — nằm **trên** feed vì cột là chỗ scroll, việc chờ trả lời không được nằm dưới 50 hàng lịch sử

**Verification:** `activity.test.ts` (bare node: dedupe, thứ tự, trần 50, mọi `kind` có wording+icon+state, diff snapshot sinh đúng hàng cho từng loại thay đổi); `ui-primitives.test.ts` khẳng định `ActivityColumn` không còn `placeholderRows`/skeleton `aria-hidden`; `layout.test.ts` thêm class skeleton vào dead-CSS absence; e2e mới (một lệnh = một hàng qua 8 giây snapshot; hàng nhảy tới panel ở cả band medium và compact) — client unit 101 → **124**, e2e **23/23**

**Files:** `activity.ts` + `activity.test.ts` (mới), `state.tsx`, `components/ActivityColumn.tsx`, `ui/vocabulary.ts`, `styles.css`, `layout.test.ts`, `e2e/` · **Deps:** UI-1 (+ dùng chung wording với UI-4)

### UI-6 — Command tray: nhóm lệnh theo ngữ cảnh + cross-highlight (slot "PR5") ✅ `0895bd1`

**Acceptance criteria:**
- [X] `tray-groups.ts` thuần: chọn army của mình → nhóm lệnh quân; city của mình → nhóm xây/logistics; ô trống → gợi ý; của người khác → **chỉ thông tin, không lệnh**
- [X] Chỉ nhóm lại **lệnh đã tồn tại** — không thêm command server nào; `cancel_army_order` dùng **đúng** payload `ArmyPanel` gửi (hai cách viết một lệnh sẽ để chip pending của panel tối trong lúc lệnh đang bay)
- [X] Lệnh không hợp lệ hiện **khoá kèm lý do**, không ẩn đi (ẩn làm người chơi tưởng game thiếu tính năng)
- [X] Tray **không đổi chiều cao** khi nhóm lệnh xuất hiện/biến mất — `trayCommandLimit = 4` và độ dài nhãn/tiêu đề là test, vì bare `node --test` không đo được pixel
- [X] Band compact (<1024px) thấy nhóm lệnh — `.command-tray__reserved` và rule `display: none` của nó bị xoá
- [X] Selection đồng bộ hai chiều map ↔ panel, **không** thêm method cho `WorldMap`, **không** re-key `MapSurface`; ref `pickedHere` phân biệt hai chiều nên camera không giật về mỗi tick
- [X] Nửa phải nói **việc làm được**, không phải bản sao thứ hai của nửa trái (sửa ở UI-7 sau khi soi bằng mắt: ba selection đang in lại y nguyên nửa trái)

**Verification:** `tray-groups.test.ts` (bảng selection × nhóm mong đợi, gồm ca "của người khác" và "ô trống"); `layout.test.ts` (`command-tray__reserved` vào dead-CSS absence); e2e mới (chọn army → thấy nhóm; chiều cao tray đo trước/sau bằng nhau; ở 900px nhóm vẫn hiện); `situation-room.spec.ts` assert `tray.w === viewport width` vẫn xanh — client unit 124 → **139**, e2e **7/7** ở lần chạy task

**Files:** `tray-groups.ts` + test (mới), `components/CommandTray.tsx`, `components/MapSurface.tsx`, `styles.css`, `layout.test.ts`, `e2e/` · **Deps:** UI-1

### UI-7 — Chrome và accessibility pass ✅ `d19cd0e`

Phần còn lại, mỗi mục là **một lỗi đã xác định**, không phải "polish" chung chung.

**Acceptance criteria:**
- [X] Toast: `onClick` chết trên `<div>` bị xoá, thay bằng `Button` đóng thật — thân toast **giữ** `pointer-events: none` (roadmap dòng 199 yêu cầu toast không chặn pointer) nên chỉ nút đóng nhận pointer; `role="status"` + `aria-live="polite"` trên **một layer** thay vì mỗi toast `position: fixed` cùng một góc
- [X] Thêm Escape xoá cả stack — nút đóng focus được nhưng tab tới nó mất nhiều hơn 4 giây toast sống; listener chỉ mắc khi có notice, và nhường Escape mà dialog đã xử lý (`ui/Modal.tsx` gọi `preventDefault()`)
- [X] `.hud-frozen` thôi dùng `opacity: .5` + `pointer-events: none` → `<fieldset disabled>` quanh ba panel lệnh (thứ **duy nhất** trong platform disable mọi control bên trong: rule cũ chỉ chặn chuột, nút vẫn trong tab order và vẫn kích hoạt bằng Enter, chữ dưới opacity đó tụt dưới 3:1) + `StatusChip state="frozen"` nêu lý do một lần ở head
- [X] Trang sau login có **đúng một `h1`** (hiện `AuthScreen` là chỗ duy nhất có `h1`, và nó unmount khi vào game); không nhảy cấp heading ở bất kỳ bề mặt nào
- [X] `AuthScreen` dựng lại bằng primitives, **label thật** cho input (tên field trước đó chỉ sống trong `placeholder` — chữ biến mất ngay khi người chơi gõ)
- [X] `.map-toolbar` sang `Button` + `Icon`, thêm "Về giữa map" dùng `focusCity` đã có
- [X] Không component nào (trừ `ui/Button.tsx`) còn `<button` thô — còn lại: `AuthScreen`, `BattleReportModal`, `CommandTray`, `MapSurface`, `StrategicHeader`
- [X] "Build queues: N/2" (chuỗi tiếng Anh cuối cùng người chơi đọc) sang tiếng Việt, kèm **14 assertion** e2e trong 6 spec đang đo nó (đo bằng `git show d19cd0e -- e2e/`; assertion thứ 15 là câu *reason* "Hàng đợi xây đang đầy (2/2)" của `validation.ts`, đã có từ UI-3)
- [X] `BattleReportModal` thôi in `⚔ 120 - 80` — glyph không có tên đọc được và dấu gạch để người đọc tự đoán số nào của bên nào; hai bên lấy tên từ `sideNames` mà các cột trên đã dùng

**Verification:** `ui-primitives.test.ts` (`.toast` vẫn `pointer-events: none` **và** nút đóng `pointer-events: auto`; `.hud-frozen` hết `opacity: .5`; text scan `<button` thô; ba assertion cho listener Escape); e2e mới `chrome-a11y.spec.ts` 3 test (đóng bằng chuột **và** Escape; `elementFromPoint` ở tâm thân toast và tâm nút — kiểm từ **cả hai** phía; hai toast xếp chồng chứ không in lên nhau) — client unit 139 → **146**, e2e **28/28**

**Bug tìm được nhờ mục "kiểm bằng mắt ở 5 viewport" của kế hoạch — không text-scan test nào thấy được:** `.kom-panel` có `overflow: hidden`, nên automatic minimum size của panel là 0 → mọi panel là flex item **co được** trong một cột ngắn hơn nội dung. Browser làm đúng điều đó: bóp tất cả cho vừa, `scrollHeight` của cột bằng luôn `clientHeight` (**không còn gì để scroll**), và mỗi panel tự cắt nội dung của mình. `OnboardingPanel` đang vẽ 67px của một checklist 445px, các nút "Đi tới" của nó **có trên trang, đo được, và không được vẽ ở đâu cả** — ba spec xanh chỉ vì `scrollIntoViewIfNeeded` scroll được bên trong một box `overflow: hidden`. `<fieldset>` không co được nên từ chối hấp thụ phần thiếu, panel tụt còn **2px** và click rơi xuống cột phía sau. Sửa: `flex: none` cho con của hai cột + của fieldset; khoá bằng luật mới trong `layout.test.ts` đọc **body** của rule trong stylesheet.

**Files:** `App.tsx`, `components/AuthScreen.tsx`, `MapSurface.tsx`, `StrategicHeader.tsx`, `KingdomColumn.tsx`, `CityPanel.tsx`, `BattleReportModal.tsx`, `tray-groups.ts`, `styles.css`, `layout.test.ts`, `ui-primitives.test.ts`, `tray-groups.test.ts`, `e2e/chrome-a11y.spec.ts` (mới) + 6 spec đo câu tiếng Anh cũ · **Deps:** UI-3, UI-6

### Checkpoint C — sau UI-5 + UI-6 + UI-7 ✅
- [X] `ActivityColumn` và nửa phải `CommandTray` không còn placeholder nào trong code
- [X] Ba comment "PR4" / "PR5" / "Bridge" **xoá khỏi source** cùng với thứ chúng mô tả (bridge đã xong ở UI-4) — chỗ nào còn nhắc tên chúng là **test khẳng định chúng không mọc lại** hoặc comment kể lại vì sao, không phải lời hứa còn nợ
- [X] E2E cũ xanh + spec mới xanh trên port 3100/5174 — **28/28 trong một lần chạy**, không lần nào phải chạy lại lẻ
- [X] Đo lại rồi mới cập nhật ma trận test ở `docs/ROADMAP.md` — **đo trước, sửa sau** (vòng trước đã sai đúng lỗi này): shared **3**, server **141** (126 pass + 15 skip, **không đổi** — không sửa file server nào), client **146**, e2e **28** trong 14 spec (`password-auth.spec.ts` là project riêng, chỉ chạy khi `E2E_PROD_SMOKE=1`, nên không nằm trong 28)
- [X] `check:bundle` 6/6 chunk ≤ 500 KiB (`pixi` 465.0 KiB là chunk lớn nhất; `AdvancedDrawer` vẫn lazy 16.4 KiB)
- [X] `test:postgres` báo **skipped** ở máy này (không Docker, không `DATABASE_URL`); **không** viết `verify:web-alpha` xanh
- [X] Gate đó **được CI đóng thay**: PR #6 run [`33759437598`](https://github.com/HoangAnh411/KOM/actions/runs/33759437598) (`pull_request`, ref `feat/hud-overhaul`) **10/10 xanh** — gate 5 `test:postgres` 15/15, gate 6 unit **khớp từng số** với đo local (shared 3, server 141 = 126 pass + 15 skip, client 146), gate 7 Playwright 28 passed, gate 8 bundle, gate 10 `npm audit`. Nên câu đúng là "10 gate CI xanh trên runner", **không** phải "`verify:web-alpha` xanh ở máy tôi"
- [X] Kiểm mắt ở 5 viewport (1920/1440/1280/1024/900) — **đây là gate tìm ra hai lỗi nặng nhất của cả vòng**, cả hai không test nào bắt được: cột kingdom không scroll (`overflow: hidden` cho panel min-height 0 → flex bóp mọi panel vừa khung) và tray in cùng một câu ở cả hai nửa. Cả hai đã sửa trong UI-7 và giờ đều có test
- [X] `docs/ROADMAP.md`: thêm section "Cải tổ HUD — Situation Room vòng 2" (**không** tự đặt số phase, ghi "Số phase để owner đặt" đúng như section command path), sửa ma trận test dòng 207 **sau khi đo**, bổ sung một câu ở dòng 197 rằng vòng 1 để lại hai slot + bridge và vòng 2 đã đóng cả ba, và ghi vào dòng 199 (yêu cầu toast không chặn pointer) rằng thân toast vẫn `pointer-events: none` — chỉ nút đóng được bật lại

### Không mở trong nhóm UI — và vì sao

| Việc | Chặn bởi |
|---|---|
| Touch pan/zoom trên map, safe-area inset | **E.3** (Phase 8) — cần project e2e mobile riêng, khác scope desktop HUD |
| Đổi palette / art direction / asset thật | **G.1** cần owner chốt art style guide trước |
| Thêm command server mới cho tray | Cố ý: UI-6 chỉ nhóm lại lệnh đã có. Command mới là gameplay, không phải UI |
| `misinformation` trong drawer espionage | **C.1**, cần server trước — đã xong ở `fb27af7`: picker và câu chi phí suy từ `launchableSpyMissionTypes`, nên không phải sửa drawer lần nữa khi thêm mission type |
| Sức chứa map | **P0.4** — không liên quan UI; chốt và thực thi ở **nhóm M** (2026-09-04) |
| Primitive `Select` thay `<select>` thô | Làm ở đuôi UI-3 nếu rẻ; nếu phải thêm >1 rule CSS mới thì tách task riêng để `emitted.size` của `ui-primitives.test.ts` không bị nới lỏng vội |

## Nhóm C — Feature debt

### C.1 — Espionage misinformation (caveat dòng 99 + "Bước tiếp theo" #1) ✅ `fb27af7`

`docs/GAME-DESIGN.md:65` yêu cầu "Sabotage/misinformation luôn ghi audit event và có counter-intelligence" nhưng `misinformation` **không tồn tại trong code**: `spyMissionTypes` (shared dòng 202) chỉ có `scout`, `sabotage`, `steal`, `counter_intel`. Baseline số liệu cũng chưa định nghĩa → phải chốt trong `GAME-DESIGN.md` cùng PR.

**Thiết kế đề xuất:** mission `misinformation` do A cắm lên B. Khi thành công, mọi `scout` của B nhắm vào A trong thời gian hiệu lực trả số liệu bị bóp méo, deterministic theo `hash(mission.id)` giống ambush/sabotage đang làm; hết hạn tự động; bị `counter_intel` của B chặn với cùng xác suất 30% / 52% Veiled như các mission khác.

**Acceptance criteria:**
- [X] `spyMissionTypes` + `launchSpyCommandSchema` (shared dòng 315) nhận `misinformation`; `spyMissionConfig` có cost/duration/cooldown/baseAccuracy — 120 sắt, 540s, 1800s, 0.45. Enum của schema lấy từ `launchableSpyMissionTypes` (`satisfies ReadonlyArray<Exclude<SpyMissionType, "counter_intel">>`) nên picker của client và validator của server **không thể lệch nhau**
- [X] `espionage.tick()` resolve `misinformation`; `resolve()` áp méo lên nhánh `scout` khi hiệu lực còn — hệ số `1 ± (0.25 + accuracy × 0.5)`, **dấu** từ `hash(mission.id)`: méo một chiều thì đối thủ chỉ cần chia đôi mọi report là vô hiệu hoá nó
- [X] Ghi event ledger (audit) và bị intercept bởi counter-intel — audit áp cho **mọi** mission type (`spy.<missionType>.<status>`) cộng `spy.misinformation.consumed` kèm hệ số, vì kết quả resolve trong `tick()` khi không còn command nào để command path ghi hộ. Đóng luôn nửa "sabotage" của yêu cầu cũ; giá là **một dòng** `store.ts` (tạo `EventLedger` trước espionage để inject được) — ngoài danh sách file dưới đây
- [X] Hiệu lực hết hạn deterministic và persist qua restart — hạn dùng nằm trong `report` (JSONB đã persist + đã reload) nên **không cần migration**; tính từ `completesAt` của mission và so với `completesAt` của scout, không phải `Date.now()`, nên tick muộn không đổi kết quả. `setPlayerFrozen` đẩy hạn ra bằng đúng thời gian bị ban
- [X] Client hiện mission type mới trong drawer espionage — `<select>` và câu chi phí đều suy từ `launchableSpyMissionTypes`; người bị lừa không thấy dấu hiệu nào, dòng "tin giả còn hiệu lực" chỉ actor đọc được nhờ per-viewer filter `app.ts:110`
- [X] Số liệu mới ghi vào mục "Phase 5 implementation baseline" của `docs/GAME-DESIGN.md`; xoá chữ "misinformation còn thiếu" ở roadmap dòng 99 (nay là 103) và bỏ mục "Bước tiếp theo" #1 đã xong

**Verification:**
- [X] `npm test -w @kingdoms/server` — 8 case mới trong `espionage.test.ts`: success, intercepted, expiry, scout bị méo (cả chiều đọc thấp), unfreeze, audit. Id bị ghi đè `misinfo-1` / `misinfo-2` / `lie-6` để hash ra kết quả biết trước → known-answer, không phải tung xúc xắc. Server **141 → 149** (134 pass + 15 skip, số skip không đổi); shared 3, client 148; typecheck sạch; `build` + `check:bundle` 6/6 ≤ 500 KiB; e2e **28/28** một lần chạy trên 3100/5174
- [ ] `npm run test:postgres` — persist qua restart: **skipped ở máy này** (không Docker, không `DATABASE_URL`). Đây là bản đầu tiên của stack có sửa file server, nên gate 5 CI là chỗ duy nhất kiểm được việc `espionage_actions.report` sống qua restart
- [ ] `npm run verify:web-alpha` — **không** khẳng định xanh từ máy contributor; chờ CI của PR

**Bug có sẵn tìm được trên đường đi:** nhánh `scout` trả `buildings: city.buildings` **theo tham chiếu** — một report cũ tự viết lại chính nó khi thành xây thêm, không ai thấy vì con số vẫn "đúng". Giờ luôn copy, méo hay không.

**Dependencies:** None · **Scope:** M
**Files:** `packages/shared/src/index.ts`, `apps/server/src/espionage.ts`, `apps/server/src/espionage.test.ts`, `apps/server/src/store.ts` (1 dòng, ngoài dự kiến — xem tiêu chí audit), `apps/client/src/vocabulary.ts`, `apps/client/src/components/EspionagePanel.tsx`, `docs/GAME-DESIGN.md`, `docs/ROADMAP.md`

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
- [ ] Dòng 89 tick (C.2 chưa mở); caveat misinformation ở dòng 99 **đã xoá** ở `fb27af7`, nên nửa C.1 của checkpoint này đóng — Phase 5 hết caveat
- [ ] `verify:web-alpha` xanh, có e2e cho chat/mail

## Nhóm M — Thiết kế lại bản đồ: thế giới 36×36 vẽ tay (2026-09-04)

Owner nhờ "thiết kế map". Đây **không** phải phạm vi mới: nó là **P0.4** của roadmap, và nhóm M là
bản thực thi của P0.4 chứ không phải một mục thứ hai. Ba vấn đề đo được của bản đồ cũ: (1) đúng
**14 ô** đặt được thành phố trong khi profile load test mặc định là **120** người — load test không
chạy chậm, nó **không seed nổi**, throw `KINGDOM_FULL` ở người thứ 13; (2) terrain là **ba phép
modulo** trong `combat.ts` (`(x+y)%7`, `(x*y)%11`, `(x+y)%13`) — những dải chéo, không vùng, không
chỗ nghẽn, không gì để nhớ; (3) `militaryScore` cho tới **300/1000** điểm theo `tilesControlled` mà
**không dòng code nào** tăng biến đó, và mỗi resource node được gán `regionId: randomUUID()` riêng
nên bảng `regions` là di tích.

Bốn quyết định trả lời OQ #2, chốt trong plan `snuggly-forging-spring.md`: phạm vi = **mở sức chứa +
bản đồ thật** (chưa cho terrain ảnh hưởng di chuyển/thu hoạch/tầm nhìn), kích thước **36×36**,
terrain **vẽ tay cố định** (không noise theo seed), lãnh thổ **chiếm bằng quân đóng**.

Ràng buộc chung cho cả nhóm: bản đồ sống ở **một** chỗ (`packages/shared/src/world-map.ts`) vì client
và server phải phân xử trên **cùng** mặt đất; mọi luật mới là **hàm thuần** + test trên bare
`node --test`; **không** đổi 5 tên class e2e đang đo, không re-key `<MapSurface />`; sáu toạ độ di
sản — thương cảng (10,10), mỏ (6,8) (15,10) (10,14), thành seed (8,8) (13,11) — **không được di
chuyển** vì `logistics.test.ts` và `espionage.test.ts` mô tả khoảng cách giữa chúng. Nhóm này **có**
chạm ba hot file (`packages/shared/src/index.ts`, `apps/server/src/store.ts`, `apps/server/src/app.ts`)
→ ping owner trước khi push. Nhánh `feat/world-map-36` cắt từ tip #7, sẽ là **PR #8**.

### M-1 — `gameRules.map`: một nguồn sự thật cho kích thước ✅ `143a0dc`

Refactor thuần, extent vẫn 20, không assertion nào phải sửa. Mục đích: biến "đổi kích thước map" từ
*sửa n literal và cầu may* thành *sửa một số*. Plan nói có **5** chỗ khai lại kích thước; thực tế
có **8**. Chỗ thứ tám là `moveArmyCommandSchema` với `targetX/targetY .max(19)` — để nguyên thì bản
đồ 36×36 ship kèm một bug im lặng: server từ chối **mọi** lệnh di chuyển qua ô 19 trong khi cả phần
còn lại của game đồng ý ô đó tồn tại.

**Acceptance criteria:**
- [X] `mapExtent` là **chỗ duy nhất** trong repo khai kích thước bản đồ; `cityPlacement` window suy ra từ nó, không còn 4 số hằng rời
- [X] `mapExtent` khai **gần đầu** `shared/index.ts`, không cạnh `gameRules` — schema đọc nó lúc module eval nên đặt cạnh `gameRules` là một **TDZ throw**, không phải một lựa chọn style
- [X] Trần texture 4096 là một **test đỏ được**: `terrainTextureSize()` chuyển vào `map-geometry.ts` thuần; extent 36 cần 4036px (dư 60px), extent 40 cần 4484px và **fail allocation**
- [X] Sàn zoom thành **hàm của extent** (`min(0.6, 900 / (extent · 56))`) → M-3 không cần chạm zoom nữa
- [X] Không một test hiện có nào phải sửa assertion (hành vi bất biến)

**Verification:** `map-size.test.ts` (mới, shared) quét repo bằng **ba regex hẹp** chỉ khớp hardcode *toạ độ ô* — quét `20` trơn là vô dụng vì `iron: 20`, `morale < 20`, `limit = 20` đều hợp lệ; shared 3 → 5, client 148 → 150, server không đổi; typecheck sạch

**Files:** `packages/shared/src/index.ts` ⚠️, `packages/shared/src/map-size.test.ts` (mới), `apps/server/src/{logistics,raiders,combat,world-events}.ts`, `apps/client/src/map-geometry.ts`, `apps/client/src/map-geometry.test.ts` · **Deps:** none · **Scope:** S

### M-2 — Thế giới 36×36 vẽ tay, sống trong `packages/shared` ✅ `f62d64a`

Phần "thiết kế" thật: hai lưới ký tự 36 dòng (một terrain, một vùng) + 36 anchor + metadata 16 tỉnh
trong `world-map.ts`, cộng hàm thuần `terrainAt` / `regionAt` / `worldMapDigest`. Địa hình là **cố ý**:
rừng bao mỏ gỗ, đồi bao mỏ đá và sắt, nên mặt đất nói cho người chơi biết chỗ nào có gì trước khi họ
click. Biên vùng bắc-nam là sống đồi, biên đông-tây là đầm — `terrainModifiers` đã ưu bên phòng thủ
trên đồi và phạt bên tấn công trong đầm, nên một đường biên là **nơi đáng đứng**.

**Acceptance criteria:**
- [X] Không còn phép modulo nào sinh terrain; `combat.ts` không tự biết bản đồ hình gì
- [X] Hai lưới đúng 36×36, chỉ ký tự hợp lệ; **16 tỉnh** `A`–`P` đều **liền khối** (flood fill), 79–83 ô mỗi tỉnh, seat nằm trong chính tỉnh nó
- [X] **36 anchor** = 4 thương cảng + 32 mỏ, **đúng hai mỏ mỗi tỉnh**, 12 gỗ / 12 đá / **8 sắt** (đối xứng xoay ngặt buộc bội của bốn; sắt vẫn là thứ khan hiếm, đúng điều recovery 3/tick so với 5 đã nói); không hai anchor trùng ô
- [X] Sáu toạ độ di sản vẫn hợp lệ và giữ vai trò cũ → `logistics.test.ts` và `espionage.test.ts` không phải viết lại
- [X] Tỷ lệ terrain **61.7 / 18.8 / 14.9 / 4.6** — cố ý sát thế giới modulo cũ (64/16/14/5) để thay bản đồ **không âm thầm dịch cân bằng battle**; ra khỏi dải là một quyết định, và là một test đỏ
- [X] Toàn bộ **59 ô đầm** nằm trên một đường biên vùng; mỗi ô thứ sáu của biên để trống làm **đèo** (37 đèo bắc-nam, 35 chỗ cạn đông-tây) nên không vùng nào bị bịt kín
- [X] `resource_nodes`/`market_hubs` **hội tụ** sau reseed: id suy deterministic từ `(kingdom, ô)`, hàng lạ bị prune. `load()` **đảo chiều**: bản đồ quyết định **mỏ nào tồn tại**, database chỉ nhớ **còn lại bao nhiêu**

**Hai thứ khác plan, và vì sao:** (1) `state.terrainMap` giữ lại nhưng **chỉ chứa override** (ô khác bản đồ authored) — nên payload terrain mỗi snapshot đi từ **6 323 → 2 byte** ngay ở M-2, không phải chờ M-3; một lưới dày 36×36 sẽ là 21 061 byte và **không byte nào** trong số đó lên dây. (2) Plan nói "không cần migration"; **sai**: `013` khai `market_hubs_one_per_kingdom_uq` mà một kingdom giờ có **bốn** thương cảng → `015_world_map_36.sql`.

**Verification:** `world-map.test.ts` (mới, shared, bare node) — mọi bất biến trên là test, cộng **digest vàng** `worldMapDigest()` nên một thay đổi với thế giới là một dòng diff phải cố ý; shared 5 → **17**; server 149 → 150 (mỏ trả đúng tỉnh); `test:postgres` **skipped** ở máy này → phần prune/upsert và migration 015 chỉ CI hoặc owner xác nhận được. Đo được **111 ô** đặt được thành phố — vẫn dưới 120, nên M-4 là **bắt buộc**, không phải tuỳ chọn.

**Files:** `packages/shared/src/world-map.ts` (mới), `world-map.test.ts` (mới), `packages/shared/src/index.ts` ⚠️, `apps/server/src/{combat,logistics}.ts`, `apps/server/src/logistics.test.ts`, `infra/migrations/015_world_map_36.sql` (mới), `docs/GAME-DESIGN.md` · **Deps:** M-1 · **Scope:** L

### M-4 — Sức chứa: 14 → 135 ô ✅ `fa6fd0d` → **đóng P0.4**

Làm trước M-3/M-5 vì đây là cái đang chặn roadmap. Ba luật quyết định con số, và không luật nào là
"nới ra cho đủ": tầm với anchor 2 → **3** (giữ 2 chỉ cho 111 ô, và mua phần thiếu bằng anchor thì cần
**49** cái, quá mức vẽ tay hợp lý), site phải với tới mỏ của **cả ba** loại tài nguyên, và đặt thành
phố **đi vòng theo tỉnh**. `minDistanceBetweenCities` giữ **3** — không nới, vì đó là luật giữ thành
phố không dính nhau.

**Cái bẫy vô hình thành luật:** **43 trong 134** site không với tới một loại tài nguyên nào đó trong
10 ô — sắt tệ nhất với **19** site. Công trình cần gỗ, đá **và** sắt, mỗi tỉnh chỉ có hai mỏ, nên hết
starter package là hết đường mà không có một thông báo nào. Thế giới 20×20 không có vấn đề này vì cả
ba mỏ đều trong tầm mọi nơi, nên luật này **chưa từng phải viết ra**.

**Tầm thu hoạch là một bug scale, không phải một dial cân bằng:** số `10` viết thẳng trong
`logistics.ts` **đúng là** `mapExtent / 2` của thế giới 20×20 nó được viết cho. Nay là
`gameRules.logistics.harvestRange = mapExtent / 2` = **18**. Muốn thu hoạch **thành ra cục bộ** thì hạ
nó xuống, và cái giá là sức chứa: 12 → 120 ô, 14 → 130, 18 → 135. Đó là **quyết định cân bằng** của
owner (OQ #16), không phải một con số kỹ thuật.

**Acceptance criteria:**
- [X] `store.addDevPlayer` đặt được **135** thành phố (2 seed + 133) rồi mới `KINGDOM_FULL` — đo tận tay, so với **14** trước đó
- [X] Mọi thành phố vẫn cách nhau ≥3 ô và ≤3 ô tới một thương cảng/mỏ; và với tới cả ba loại tài nguyên
- [X] 120 người đầu **không** dồn vào một góc: 14 người đầu vào đúng 14 tỉnh mà hai thành seed không đứng; ở 122 thành, tỉnh đông nhất có **8**, tỉnh ít nhất có **6**. Row-major trên bản đồ rộng 36 dồn 40 người đầu vào góc tây-bắc — vừa hỏng trải nghiệm vừa làm load test đo **một cụm** thay vì một thế giới
- [X] Đặt thành phố vẫn **deterministic**: tỉnh ít thành nhất trước (hoà thì theo mã `A`–`P`), row-major trong tỉnh
- [X] `citySiteCapacity()` export → `loadtest-seed` từ chối **trước khi ghi hàng đầu tiên**, kèm trần thật, thay vì chết giữa lúc seed bằng `KINGDOM_FULL`; và một test assert nó **bằng** số store thật đạt được — vì nếu lệch thì guard đang nói dối
- [X] `logistics.test.ts` thôi khai lại hằng số của luật (`2..17`, `>= 3`, `<= 2`) → đọc từ `gameRules.cityPlacement`; đúng lỗi đã xảy ra một lần

**Verification:** server 150 → **151** (136 pass + 15 skip); shared 17, client 150; typecheck sạch; `test:postgres` **skipped** (không Docker/`DATABASE_URL`) và vòng này **có** đổi đường ghi `resource_nodes`/`market_hubs` nên rủi ro ở gate đó **không** bằng không; `npm run test:load:full` **chưa chạy** (`k6` chưa cài = P0.5) → chỉ phần seed được xác nhận
- [ ] E2E **chưa chạy lại** sau M-2/M-4 — bản đồ đổi nên `map.spec.ts` / `map-command.spec.ts` / `economy.spec.ts` là guard thật
- [ ] Kiểm bằng mắt ở 5 viewport (1920/1440/1280/1024/900): bản đồ mới có đọc được không

**Files:** `apps/server/src/store.ts` ⚠️, `packages/shared/src/index.ts` ⚠️, `apps/server/src/{loadtest-seed,logistics}.ts`, `apps/server/src/{logistics,app}.test.ts`, `docs/GAME-DESIGN.md` · **Deps:** M-2 · **Scope:** M

### M-3 — Đặt đúng tên cho thứ đang đi trên dây, và khoá client cũ ✅ `9603f1b`

**Phạm vi đã teo lại một nửa vì M-1 và M-2 đi trước:** sàn zoom và trần texture xong ở M-1; **6 321
byte** tiết kiệm được đã lấy ở M-2 (`terrainMap` thành overrides-only, 6 323 → 2 byte). Còn lại là
phần *sự thật*, không phải phần *băng thông*: một field tên `terrainMap` mà chỉ chứa override là một
cái tên nói dối, và một client cũ gặp server mới hôm nay **vẽ sai một cách im lặng**.

**Vì sao phải nâng `PROTOCOL_VERSION`.** `terrainMap` **đã** `.optional()` và client mặc định ô thiếu
thành `plains`. Không nâng version thì: client cũ + server mới → vẽ cả thế giới thành đồng bằng;
client mới + server cũ → vẽ bản đồ authored trong khi server phân xử battle bằng bản đồ modulo. Cả
hai **sai im lặng** — đúng loại lỗi mà version gate (`protocol.ts`, đã có, đã có test) tồn tại để
chặn. Đây cũng là nửa "protocol version" của mục [217]/E.6.

**Acceptance criteria:**
- [X] Snapshot đổi `terrainMap` → **`terrainOverrides`** + thêm `worldMapDigest`; không khoá `terrainMap` nào còn trong payload
- [X] **`PROTOCOL_VERSION` 1 → 2**; client cũ bị khoá command kèm câu tiếng Việt "hãy tải lại trang", **không** vẽ sai im lặng
- [X] `terrainSig(digest, overrides)` thay `JSON.stringify` cả bản đồ — rẻ hơn và vẫn đúng tín hiệu rebuild texture
- [X] `LogisticsPanel.tsx:162,168` — câu "Lập tuyến đến **{hub[0]}**" **sai** khi có bốn thương cảng → nói theo hub đang chọn trong `<select>` đã có, hoặc "một thương cảng" khi chưa chọn
- [X] Client vẽ đúng thế giới authored, kể cả sau `/api/dev/reset`; không re-key `<MapSurface />`, không đổi API `WorldMap`

**Verification:**
- [X] `protocol.test.ts` xanh với version mới, **thêm** một test: v1 bị khoá **theo tên**, không chỉ theo số học `PROTOCOL_VERSION + 1`
- [X] `app.test.ts` mới: snapshot **không** có khoá `terrainMap`, `worldMapDigest` đúng, override đi đúng **một** ô
- [X] `map-geometry.test.ts`: `terrainSig` ổn định theo `(digest, overrides)`; digest đổi/thiếu là đổi signature
- [X] Đo tận tay — **không có route `/api/state`** như plan viết, nên đo `snapshot` của `/api/bootstrap`: **11 789 byte**; cùng snapshot mà nhét lưới 36×36 vào như v1 là **32 806**; phần terrain đi từ **21 061 → 59 byte**
- [X] e2e 9/9 xanh **không sửa assertion** (`map`, `map-command`, `economy`, ba `situation-room`, `hud-gates`) trên cổng 3100/5174
- [X] `npm run build` + `check:bundle` 6/6 ≤ 500 KiB (pixi 465.0 KiB); `typecheck` sạch; shared 19/19, server 152 (137+15 skip), client 151/151

**Hai thứ khác plan, và vì sao:** (1) `GameState.terrainMap` (state persist) **không** đổi tên — đường
JSONB reload chỉ xác minh được dưới `test:postgres`, gate không chạy được ở máy này, nên đổi tên field
persist là rủi ro không có cách kiểm; dây đã đúng tên, `combat.ts` đã ghi rõ nó chỉ giữ override.
(2) Xoá `gameRules.market.name` — một chuỗi tiếng Việt trong object luật, người tiêu thụ duy nhất là
câu prose vừa sửa; `gameRules` không được serve qua HTTP nên không breaking với ai.

**Files:** `apps/server/src/app.ts` ⚠️, `packages/shared/src/index.ts` ⚠️, `apps/client/src/{map,map-geometry}.ts`, `apps/client/src/components/LogisticsPanel.tsx`, các test tương ứng · **Deps:** M-2 · **Scope:** M

### M-5 — Chiếm vùng bằng quân đóng: 300 điểm chết sống lại ✅ `f3e9b1a`

**Luật** (`apps/server/src/territory.ts`, mới, hàm thuần): vùng thuộc về P nếu P có **quân sống**
(`strength > 0`, không `frozen`, `ownerType === "player"`) trong bán kính Manhattan `captureRadius = 1`
quanh **seat** của vùng, và không ai có quân gần seat hơn hoặc bằng; hoà → **vô chủ**. Quân NPC
(raider, mob) **không** tranh vùng — cố ý, để không có vùng nào không thể giữ được.
`tilesControlled[P]` = tổng số ô của các vùng P đang giữ, tính lại **mỗi tick** (ảnh chụp hiện tại,
khác `victories` là số cộng dồn).

**Đổi thang điểm — cần owner thấy (OQ #15).** Thang cũ (`tiles × 5`, max ở 60 ô) nghĩa là **giữ một
tỉnh 81 ô ăn trọn 300 điểm**, tức biến 30% trục quân sự thành một cái công tắc. Đã làm:
`fullScoreTiles = (mapExtent²)/4 = 324`, viết thành **tỷ lệ của bản đồ** nên đổi kích thước thế giới
không âm thầm làm lãnh thổ rẻ đi hay đắt lên.

**Acceptance criteria:**
- [X] Đóng quân cạnh seat → tick sau `tilesControlled` tăng đúng số ô của vùng; rút quân → về 0
- [X] Hai người cùng khoảng cách tới seat → vùng **vô chủ**, không ai được điểm
- [X] Raider đứng trên seat không chiếm được vùng và **không chặn** người chơi
- [X] Người **chưa từng đánh nhau** vẫn có điểm lãnh thổ — entry sinh ở lần đầu **giữ đất**, nhưng vẫn **sinh muộn**: `combat.persist` ghi một upsert cho *mỗi* entry, nên tạo sẵn hàng cho cả 122 người sẽ thêm 122 upsert mỗi lần save cho những người không làm gì. Đo: 122 người / 122 thành → **0 hàng**; hai quân cạnh hai seat → **2 hàng**
- [X] Giữ 1 tỉnh ≈ 75 điểm, **không** phải 300; `militaryScore` vẫn trần 1000 — **đo thật: một tỉnh 79–83 ô cho 73–76 điểm**, bốn tỉnh cho **292–300** tuỳ chọn bốn tỉnh nào. Phát biểu trung thực là *một phần tư bản đồ* cho 300, không phải "đúng bốn tỉnh"
- [X] Không migration mới — `military_throughput.tiles_controlled` **đã có cột**, đã đọc/ghi

**Verification:**
- [X] `territory.test.ts` (mới, thuần, 6 test): một chủ, tranh chấp, hoà, **hai quân cùng chủ không tự hoà với mình**, NPC, quân chết, quân `frozen`, người bị ban, ngoài bán kính
- [X] `packages/shared/src/index.test.ts` — **2 assertion đổi fixture**, giữ nguyên ý: `tilesControlled: 100` → `gameRules.territory.fullScoreTiles` cho ca "tất cả max → 1000" (100 ô max được thang cũ, thang mới thì không), và `5` → `81` cho ca giữa, giờ kỳ vọng 225 = 110 + 75 + 40. Thêm một test quét cả 16 tỉnh, khẳng định mỗi tỉnh trả 70–80 điểm. `store.test.ts` giữ phần wiring: điểm đi theo chỗ quân đứng và không cần trận nào để tồn tại
- [X] `typecheck` sạch; `npm test` shared **20/20**, server **159** (144 pass + 15 skip), client **151/151**; `build` + `check:bundle` **6/6** ≤ 500 KiB
- [X] e2e `production-loop.spec.ts` + `situation-room.spec.ts` — **8/8 xanh** (cổng 3100/5174, config tạm đã xoá), gồm cả `season close` vốn là chỗ flake. Không spec nào assert số điểm quân sự (đã grep), nên thang mới không thể làm đỏ một assertion e2e

**Files:** `apps/server/src/territory.ts` (mới), `territory.test.ts` (mới), `apps/server/src/store.ts` ⚠️, `packages/shared/src/index.ts` ⚠️, `packages/shared/src/index.test.ts`, `docs/GAME-DESIGN.md` · **Deps:** M-2 · **Scope:** M

### M-6 — Vùng hiện ra trên màn hình ✅ `5dd2e87` + `0169655`

Chiếm vùng mà không thấy được thì là điểm số bí ẩn. Phần này dùng **đúng những bề mặt vừa làm xong ở
nhóm UI**, không thêm panel nào.

**Acceptance criteria:**
- [X] Snapshot chở **`regionControl: Record<mã tỉnh, id người giữ>`**, không phải 16 hàng — **lệch có chủ ý so với plan, và lý do là số đo**: hình đầy đủ tốn **1 493 byte mỗi tick** lúc chưa ai giữ gì, tức đúng khuyết điểm M-3 vừa bỏ (dữ liệu authored đứng yên, gửi cho mọi người xem, mỗi giây). Hình đã chọn: **18 byte** rỗng, **189** ở bốn tỉnh, **705** ở trần cả mười sáu tỉnh. Tên, seat và số ô client đã `import` từ `world-map.ts`. Cả hai hình đều thoả "≤2 KB", nhưng chỉ một hình không lặp lại lỗi cũ
- [X] Đổi chủ vùng sinh **đúng một** hàng feed — khoá theo id của chính sự thật (`region:<mã>:<người giữ>`), không theo "đổi so với snapshot trước", nên đứng yên sáu giây vẫn một hàng (e2e assert đúng chỗ đó). Không hàng nào in mã tỉnh hay id
- [X] `region-captured` / `region-lost` có đủ **một** wording + **một** glyph + **một** state; hàng nói **tên tỉnh và số ô** vì số ô là thứ quy ra điểm. Feed chỉ kể tỉnh **của người xem** — trong vương quốc 122 người, người lạ đổi chác vùng sẽ chôn mất hàng người chơi làm được gì đó với; bản đồ vẫn vẽ của tất cả
- [X] Tên tỉnh gate ở **`regionLabelZoom = 1.0`** (`regionLabelsVisible`, thuần, có test); ở sàn zoom 0.4 mười sáu cái tên cách nhau ~20px và đè lên chính quân/thành mà chúng phải ở phía sau. **Marker không bao giờ tắt** — chỉ chữ tắt, nên không tỉnh nào biến mất. Seat vẽ **viền** hình thoi chứ không tô kín: địa hình dưới seat cũng là thông tin
- [X] Tray: chọn ô nào trong tỉnh cũng nói **tỉnh nào, ai giữ**; chưa ai giữ thì nói *"chưa ai giữ"* thay vì im lặng. Ô lỵ sở có nhóm riêng, nêu luật `captureRadius`, và **hỏi trước ô mỏ** — xem ghi chú lỗi dưới
- [X] Cột hoạt động và tray **không đổi** chiều cao/bề rộng; map không remount — ba spec HUD xanh không sửa một assertion nào

**Verification:**
- [X] `activity.test.ts` + `ui-primitives.test.ts` xanh; `map-geometry.test.ts` thêm hai test thuần: `seatSig` (ba màu theo *cờ ai bay*, mọi người lạ là **một** marker) và cái gate zoom là **luật** (`minZoom < regionLabelZoom ≤ maxZoom`, và ở sàn thì tắt)
- [X] `territory.spec.ts` (mới): seat trước khi chiếm → hành quân → **một** hàng `region-captured` kèm tên tỉnh và số ô → đứng yên 6 giây vẫn một hàng → ô bên cạnh nói "bạn đang giữ" → hàng feed nhảy đúng panel Quân đội (sau khi đã rời panel đó). Không toạ độ nào viết cứng: thành từ `/api/bootstrap`, seat từ `regions`, điểm click từ `worldPoint` của chính renderer
- [X] `situation-room` + `activity-feed` + `command-tray` **8/8**, `map` + `map-command` + `hud-gates` **5/5**, xanh **không sửa**; **full suite 29/29 (3.9m)** trên 3100/5174, config tạm đã xoá — lần này **không** spec nào flake, kể cả `production-loop` season close và `phase7c` treaty break
- [X] `typecheck` sạch; shared **20/20**, server **160** (145 pass + 15 skip), client **156 → 157/157**

**Một lỗi thật, do e2e bắt được** (`0169655`): nhóm seat là **code chết ở 12 trong 16 tỉnh** vì
`tileGroup` hỏi `nodeAt` trước `seatAt`, mà **cả mười sáu seat đều là anchor** (12 mỏ + 4 thương
cảng) — nên ô quyết định cả một tỉnh tự giới thiệu là "Điểm khai thác". Bốn tỉnh đọc đúng là bốn tỉnh
có thương cảng làm seat, và đó đúng là bốn tỉnh unit test tình cờ không chạm. Sửa: seat hỏi trước, và
một ô là cả hai thì mang **cả hai** lệnh (mỏ không mất gì — nửa trái vẫn in `Còn 1000/1000`). Ưu tiên
theo cái hiếm hơn: 16 seat so với 36 anchor. Bài học: một test thuần chọn `regions[0]` mà `regions[0]`
tình cờ **không** có mỏ thì nó chứng minh ít hơn nó trông như đang chứng minh.

**Files:** `apps/server/src/app.ts` ⚠️, `packages/shared/src/index.ts` ⚠️, `apps/client/src/{map,map-geometry,activity,tray-groups}.ts`, `apps/client/src/ui/vocabulary.ts`, `e2e/territory.spec.ts` (mới), `docs/GAME-DESIGN.md`, các test tương ứng · **Deps:** M-5 (và M-3 nếu muốn gộp một lần bump protocol) · **Scope:** M

### Checkpoint A — sau M-1 + M-2 + M-3: thế giới mới đã landing ✅ (còn kiểm mắt 5 viewport)
- [X] `mapExtent` là chỗ duy nhất khai kích thước; trần texture 4096 là test đỏ được (4036 ở extent 36)
- [X] Bản đồ 36×36 vẽ tay chạy trên **cả** server và client; terrain trên dây còn **2 byte** (override), không phải 6 323
- [X] `worldMapDigest()` là golden test → đổi thế giới là một diff phải cố ý
- [X] `typecheck` + `npm test` xanh (shared 17, server 150, client 150 tại thời điểm M-2); `build` + `check:bundle` 6/6 ≤ 500 KiB
- [X] `PROTOCOL_VERSION = 2` — xong ở M-3 (`9603f1b`), kèm test v1 bị khoá theo tên
- [X] E2E chạy lại sau khi thế giới mới landing: **28/28** sau M-4, **9/9** lại sau M-3, không sửa assertion nào
- [ ] Kiểm bằng mắt ở 5 viewport (1920/1440/1280/1024/900) — **chưa**, cần người xem `npm run dev:web`

### Checkpoint B — sau M-4: P0.4 đóng ✅ (còn `test:postgres`, không phải tiêu chí của P0.4)
- [X] Sức chứa **đo tận tay 135 ô** (từ 14); `LOADTEST_USERS=120` seed hết, không `KINGDOM_FULL`; quá trần thì **báo lỗi ngay từ đầu**
- [X] Phân bố theo tỉnh: 120 người không dồn một góc (ở 122 thành: max 8 / min 6)
- [X] `docs/ROADMAP.md` P0.4 tick kèm số thật, P0.5 bớt blocker sức chứa (còn `k6`), `:145` còn **một** blocker, ma trận test `:207` đo lại
- [X] `tasks/todo.md` P0.4 tick, OQ #2 đóng, OQ #14–#17 mở
- [X] E2E **28/28** xanh trên thế giới mới (cổng 3100/5174, config tạm đã xoá) — gồm `economy`, `army`, `map-command`, `production-loop`
- [ ] `test:postgres` / `verify:web-alpha` **skipped ở máy này** — và vòng này **có** đổi đường ghi `resource_nodes`/`market_hubs` (+ migration 015) nên rủi ro ở gate đó **không** bằng không

### Checkpoint C — sau M-3 + M-5 + M-6 (lãnh thổ có nghĩa) ✅ (còn kiểm mắt 5 viewport)
- [X] `PROTOCOL_VERSION = 2`, client cũ bị khoá kèm câu tiếng Việt (`9603f1b`)
- [X] `tilesControlled` sống, thang điểm mới có test (`f3e9b1a`); **16 tỉnh giờ là dữ liệu thật** — `resource_nodes.region_id` mang id tỉnh thật từ M-2, và luật vùng đọc chính nó. Hai thứ **vẫn là di tích**: bảng `regions` (không dòng nào INSERT) và cột `map_tiles.region_id` (không dòng nào ghi `map_tiles` — nó chỉ được *đọc* làm override terrain). Xoá chúng là một migration, không phải một phần của M-5
- [X] 2 assertion shared đã đổi fixture, ghi rõ vì sao. Đo lại phát biểu: **một phần tư bản đồ** cho 300 điểm — bốn tỉnh cho 292–300 tuỳ chọn bốn tỉnh nào, một tỉnh cho 73–76
- [X] Vùng thấy được trên map + feed + tray (`5dd2e87`, sửa ở `0169655`); không placeholder nào còn lại. Dây chở **18 byte** lúc chưa ai giữ thay vì 1 493 mỗi tick — số đo, không phải ước lượng
- [X] Đo lại ma trận test ở `docs/ROADMAP.md:207` — **đo trước, sửa sau**: shared **20**, server **160** (145+15 skip), client **157**, e2e **29/29**
- [ ] Kiểm bằng mắt ở 5 viewport (1920/1440/1280/1024/900) — **chưa**, cần người xem `npm run dev:web`: marker seat + tên tỉnh có đè lên quân/thành không, ở 900px cả thế giới có đọc được không

**Không làm vòng này, và vì sao:** terrain ảnh hưởng di chuyển / thu hoạch / tầm nhìn (là luật
gameplay mới, không phải hệ quả của việc có bản đồ thật), fog of war (cần luật tình báo mới, và
`scout` đang là cơ chế "xem" duy nhất), minimap (sàn zoom đã đủ thấy hết thế giới ở mọi band), shard
`kingdom_id` (D.2 — 135 ô trong **một** kingdom đã đủ cho profile load test), `raiders.targetCount` và
capacity/recovery của mỏ cho thế giới gấp ba (OQ #17 — **đo rồi sửa**, không đoán trước), art thật cho
terrain mới (nhóm G, chờ style guide).

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
- [X] **Mới (2026-09-03, CI gate 7) → xong `1d9acc1`:** `map-command.spec.ts:42` assert `Bộ binh · 10` nhưng NPC `mob_migration` ("Đám di cư · 90") đứng đúng ô spec click, nên inspector hiện NPC → đỏ, đỏ **trên cả `main`**, không phải regression của stack. Hai hướng "sửa spec" là đi vòng: nguyên nhân thật là `pickAt()` phá thế hoà bằng `distSq <`, nên khi hai quân **cùng một ô** người thắng là ai tình cờ đứng trước trong `snapshot.armies` — và quân của chính người chơi không chọn được nữa. `pickAt` nhận thêm `ownPlayerId` **bắt buộc**, ưu tiên quân người chơi khi thế hoà tuyệt đối (khoảng cách vẫn trội hơn quyền sở hữu). Spec không đổi một dòng; 2 test tất định ở `map-geometry.test.ts`

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
| Base PR sai → PR trên nuốt cả commit của PR dưới, review vô nghĩa | ~~High~~ | **Đã xử ở PR.1:** set base tường minh khi `gh pr create`, rồi kiểm bằng `gh pr view --json baseRefName` + đếm commit từng PR (4 / 4 / 8, không phải 4 / 8 / 16) |
| Không có quyền push (account `gh` khác owner) | ~~Medium~~ | **Đã xử:** thử một nhánh trước; push thành công nên ba nhánh còn lại đi theo. Nếu bị từ chối thì đã dừng và báo owner, không tự đổi remote |
| CI đỏ vì flake bị hiểu là stack của contributor làm hỏng | Medium | Chứng minh bằng run của `main` (gate 5 `33479184803`, gate 7 `33505482280`) + `git diff --stat` cho thấy PR #1 không chạm server; ghi cả hai vào body PR và roadmap |
| P0.3b làm yếu dedupe id dẫn xuất (`-violate`) qua restart | Medium | Guard cứng `TREATY_NOT_ACTIVE` (`diplomacy.ts:246`) đã chặn; pursuit order tiêu ngay khi resolve; ghi rõ trong commit body + test gọi `breakTreaty` hai lần cùng id |
| P0.2 làm `hasCommand` miss ngoài window bị hiểu là mất dedupe | Medium | Comment tại chỗ + test khẳng định point query / unique index vẫn bắt; ghi con số window vào `docs/API.md` mục protocol |
| S5 mirror phép lerp của client rồi hai bên lệch nhau | Medium | Comment trỏ chéo `logistics.ts` ↔ `apps/client/src/map.ts:322-335`; test biên 3/4 khoá đúng công thức. Gộp về `packages/shared` là follow-up cần owner review |

## Open Questions

1. ~~Phạm vi Phase 7D~~ → **đóng** sau `f6085a4`. Câu hỏi còn lại: owner có coi 7D là đã đóng, và có muốn thêm section 7D vào roadmap (N.1)?
2. ~~**Sức chứa thế giới:** mở rộng map cho 100+ người, hay giữ 20×20 và hạ mục tiêu load test?~~ → **đóng 2026-09-04, chốt qua plan `snuggly-forging-spring.md`**: mở map. Bốn quyết định — phạm vi = sức chứa + bản đồ thật (chưa cho terrain ảnh hưởng di chuyển), kích thước **36×36** (lớn nhất còn giữ được renderer hiện tại: texture 4036px dưới trần 4096; 40 cần 4484 và fail allocation), terrain **vẽ tay cố định**, lãnh thổ **chiếm bằng quân đóng**. Thực thi ở **nhóm M**; sức chứa đo được **14 → 135 ô** nên P0.5/B.3 `[141]` hết blocker map (còn `k6`).
3. Thứ tự nhóm D (scale server) vs nhóm E (đa nền tảng)?
4. Contributor có quyền chạy prod compose / backup / k6 không? Máy này chưa có Docker và chưa có `k6`.
5. ~~Misinformation baseline do owner chốt hay contributor đề xuất trong PR (C.1)?~~ → **contributor đề xuất, ship ở `fb27af7`**, số nằm trong "Phase 5 implementation baseline" của `docs/GAME-DESIGN.md` để owner sửa một chỗ: 120 sắt, 540s, 1800s, accuracy 0.45, hiệu lực 20 phút, méo `1 ± (0.25 + accuracy × 0.5)` hai chiều. Một ràng buộc xin đừng đổi khi cân bằng lại: **hiệu lực < cooldown**, nếu không thì cắm lại được trước khi lời cũ hết hạn và một người chơi bị bịt mắt vĩnh viễn — `espionage.test.ts` giữ luật đó.
6. `verify:web-beta` có vào CI không (N.2), hay cố ý giữ là gate chạy tay vì cần Docker-in-Docker?
7. ~~Có thêm rate-limit cho GET route không?~~ → **đóng trong P0.1**: ba GET có auth dùng chung bucket `read` 60/phút/player. Một vòng reconnect chỉ tốn 3 call nên client bình thường không tới gần trần; đổi số chỉ là sửa một dòng trong `rateBuckets`.
8. ~~**(S-5)** tiền đề không gian của `ambush`~~ → **đóng 2026-09-03, owner chốt**: phải có quân trong bán kính Manhattan **3 ô** quanh vị trí caravan hiện tại, và `ambush` sang bucket **`combat`** (10/phút). Không thêm cost tài nguyên, không thêm cooldown ở vòng này. Bản thực thi là B.1a; vì caravan không có `x`/`y` nên guard phải mirror phép lerp của client (`apps/client/src/map.ts:322-335`).
9. **Mới (S-9):** có thêm guard "production phải khai `TRUST_PROXY`" không? Để `false` sau Caddy thì `register:<ip>` 3/giờ thành hạn mức toàn cầu. Không tự thêm vì guard sẽ chặn boot của deployment phơi server trực tiếp mà tôi không kiểm chứng được. Kèm: S-1 cần owner xác nhận một lần trên stack thật Caddy → Fastify (máy này không có Docker nên chỉ chứng minh được nửa Fastify bằng `app.inject`).
10. **Mới (2026-09-03):** thứ tự merge **6** PR (PR #7 `feat/espionage-misinformation` base `feat/hud-overhaul`). Đề xuất: **#4 trước** (nó sửa gate 5 nên cả stack xanh theo, và base là `main` nên không phải rebase gì), rồi #1 → #2 → #3 → **#5** → **#6** → **#7** theo đúng thứ tự tầng. Owner có muốn squash từng PR hay giữ nguyên commit theo lớp?
11. ~~**Mới (2026-09-03):** flake gate 7 (`map-command.spec.ts` click phải NPC `mob_migration` cùng ô) — chọn ô không có NPC, hay assert theo `data-testid`?~~ → **đóng bằng đường thứ ba, `1d9acc1`**: hai hướng đó chỉ làm spec thôi đỏ mà vẫn để người chơi không chọn được quân mình khi mob đứng cùng ô. Nguyên nhân ở `pickAt()`: thế hoà `distSq` do thứ tự `snapshot.armies` phân xử. Spec **không đổi một dòng**; 2 test tất định ở `map-geometry.test.ts` là bằng chứng. Không cần owner quyết nữa.
12. **Mới (2026-09-04, nhóm M):** bốn câu hỏi của vòng bản đồ — **tên 16 tỉnh** (chữ người chơi đọc, owner sửa `regions` trong `world-map.ts`; không test nào khoá chữ), **`fullScoreTiles = 324` + `captureRadius = 1`** (đổi luật tính điểm, và làm 2 assertion fixture ở shared phải đổi), **thu hoạch có nên cục bộ** (`harvestRange` 12 → 120 ô / 14 → 130 / 18 → 135, tức đánh đổi trực tiếp với sức chứa), **cân bằng cho thế giới gấp ba** (`raiders.targetCount`, capacity/recovery của mỏ, bán kính supply — đo rồi sửa). Danh sách chuẩn là `tasks/todo.md`, ở đó chúng là **#14–#17**; mọi tham chiếu "OQ #14–#17" trong file này trỏ sang đó, vì numbering hai file đã lệch từ #8.
