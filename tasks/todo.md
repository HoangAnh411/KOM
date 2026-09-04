# TODO — mục chưa tick trong `docs/ROADMAP.md` + việc phát sinh từ trạng thái repo

Chi tiết acceptance criteria / verification / files: [`tasks/plan.md`](./plan.md). Thứ tự thực thi đã chốt ở mục "Thứ tự thực thi" của plan: **Bước 0 = Z.1 (xong) → Bước 1 = Z.2–Z.4 (xong) → Bước 2 = P0.1 (tiếp theo)**.

Bối cảnh: tôi là **contributor**. Owner **đã push Phase 7D** (`f6085a4`, 2026-09-02) — xem mục "Phase 7D đã landing" bên dưới. Task chạm `apps/server/src/store.ts`, `apps/server/src/app.ts`, `packages/shared/src/index.ts` vẫn nên hỏi owner trước (đánh dấu ⚠️ hot file).

Gate mỗi PR: `npm run verify:web-alpha` + tick checkbox tương ứng trong `docs/ROADMAP.md`. 7D thêm gate mạnh hơn `npm run verify:web-beta` (có `npm audit --audit-level=high` + `test:prod-smoke`) nhưng **chưa vào CI**. Ở máy này `test:postgres` chỉ skip (không Docker, không `DATABASE_URL`) → báo từng gate riêng, **không** viết "`verify:web-alpha` xanh".

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
- [ ] **Owner xem lại `feat/situation-room` + `docs/truth-pass`, quyết N.1 / N.2 / OQ #2**

## Phase 7D đã landing (`f6085a4`) — cập nhật 2026-09-02

7D là **production/beta hardening**, không phải gameplay. Đã có:

- `verify:web-beta` + `scripts/smoke-prod.mjs` + `e2e/password-auth.spec.ts`: dựng thật stack prod compose (Caddy TLS + PG + Redis + game + outbox), test register → build → reload giữ session, và assert `/health/ready` `/metrics` `/api/dev/*` trả 404 từ ngoài.
- `scripts/drill-web-beta.mjs` + `infra/backup/drill-report.md`: 3 drill tự động (Redis kill, game kill với outbox sống độc lập, backup→drop→restore có sentinel row). Kết quả 2026-09-02: cả 3 pass, RPO 0 ms, RTO 5795 ms.
- Security: Pino `redact` token/cookie; refresh cookie `Path=/api/auth`; origin check chặn cả request **thiếu** Origin; Caddy thêm CSP/HSTS/Referrer-Policy/Permissions-Policy/nosniff/X-Frame-Options; rate limiter **không còn fail-open** — Redis chết thì throw `DEPENDENCY_UNAVAILABLE` → HTTP 503.
- Metrics `http_requests_total`, `http_auth_failures_total`, `kingdom_websocket_auth_failures_total` + alert `KingdomsAuthFailures`.
- Broadcast coalesce (`requestBroadcast()` thay vì fan-out full snapshot mỗi command).

**`docs/ROADMAP.md` không được 7D sửa dòng nào** → roadmap hiện lệch với code. Ba việc phát sinh:

- [ ] **N.1** Roadmap **không có mục Phase 7D nào** (không goal, không checklist, không tiêu chí đóng) dù `verify:web-beta` đã là gate thật → Z.3 đã ghi rõ khoảng trống này và nêu tên hai việc owner quyết, nhưng **không tự viết section** · XS · **owner quyết**
- [ ] **N.2** `verify:web-beta` (`npm audit`, `test:prod-smoke`) và `drill:web-beta` **chưa vào `.github/workflows/ci.yml`** — CI vẫn đúng 9 gate cũ, kết ở `git diff --check` · S
- [X] **N.3** `docs/API.md` drift → **đã sửa ở Z.4** (`b273629`): bỏ "WebSocket command 30/phút" và "read REST 60/phút" (cả hai không tồn tại), login 5/15 phút theo IP+username, thêm 503 `DEPENDENCY_UNAVAILABLE`

## Phase P0 — Prerequisite (chặn mục 141, không có trong roadmap)

- [ ] **P0.1** ← **BƯỚC 2, LÀM TIẾP THEO.** Tách rate-limit bucket theo nhóm command (`write:` / `combat:` / `spy:`), đưa `attack` về bucket combat, cập nhật `docs/API.md` cho khớp trạng thái mới — ⚠️ hot file, **ping owner trước** · S · **7D sửa `rate-limit.ts` nhưng KHÔNG sửa key**: `app.ts:98` vẫn dùng chung `write:${playerId}` cho mọi command. Giờ limiter fail-closed nên 429 sai càng dễ nổ. Giữ nguyên 429/`RATE_LIMITED` để contract test không đổi
- [ ] **P0.2** Bỏ full-table reload `event_ledger` khỏi command path; `hasCommand()` dùng point query trên `event_ledger_command_idx` — ⚠️ hot file · M · 7D không chạm
- [ ] **P0.3** Chặn `processedCommands` phình vô hạn; gộp mọi dedupe về một đường duy nhất — ⚠️ hot file · M · deps P0.2 · 7D không chạm
- [ ] **P0.4** Nâng sức chứa thành phố (map size thành hằng số chia sẻ, scale anchor) — ⚠️ hot file · **chờ owner quyết (OQ #2)** · M–L · 7D chỉ thêm guard `pool.ended` vào `store.ts`, trần ~16 city còn nguyên
- [ ] **P0.5** Sửa harness k6: phân bố tải đều trên user, xử lý 429 đúng nghĩa · S · deps P0.4 · 7D **không sửa file nào trong `e2e/loadtest/`**

### Checkpoint 1 — sau P0.1–P0.5

- [ ] `npm run verify:web-alpha` xanh
- [ ] Có số đo p95 command trước/sau P0.2 + P0.3
- [ ] Seed `LOADTEST_USERS` mục tiêu không throw `KINGDOM_FULL`
- [ ] **Owner review** (nhóm này chạm `store.ts` / `app.ts`)

## Phase A — Đóng Phase 7C

- [ ] **A.1** [204] `docs/ACCEPTANCE-7C.md` + test chặn `prompt(`/`confirm(` tái phát + chạy phiên 30–60 phút · S · **xác nhận owner tự chạy? (OQ #1)**

## Phase B — Pre-beta Phase 7A

- [ ] **B.1** [145] `docs/SECURITY-REVIEW.md` phủ auth / permissions / input / secrets; finding cao có test hồi quy · M · deps P0.1 · **re-baseline theo code sau 7D**: 7D đã tự sửa log redaction, cookie `Path=/api/auth`, origin thiếu-Origin, rate limiter fail-open, che `/metrics` `/health/ready` `/api/dev/*` ở Caddy, security headers → review giờ chỉ còn phần chưa được xử lý (bucket rate-limit dùng chung, **không GET route nào bị rate-limit**, permission matrix, `/api/battles` scope)
- [X] **B.2** [144] → **đóng ở Z.2 + Z.3**: drill đã chạy 2026-09-02 (3/3 pass, RPO 0 ms, RTO 5795 ms), kết quả + cadence + caveat đã vào `docs/OPERATIONS.md`, `[144]` đã tick
- [ ] **B.2b** Drill của 7D dùng `docker compose exec postgres pg_dump` (`scripts/drill-web-beta.mjs:120`), **không chạy `infra/backup/backup.sh` / `restore.sh`** đã commit → hai script đó (custom format, retention 7 daily + 4 weekly, checksum vào `backup.log`, guard `BACKUP_ALLOW_LOCAL`) vẫn chưa được kiểm chứng lần nào. Drill kỳ sau 2026-10-02 nên đi qua đúng hai script · S · cần Docker (OQ #4)
- [ ] **B.3** [141] Chạy load test 15 phút, lưu report, link từ `OPERATIONS.md` · S · deps P0.2–P0.5 · 7D thêm script `npm run test:load:full` nhưng **chưa có report** và blocker seed còn nguyên

### Checkpoint 2 — sau A.1 + B.1 + B.3

- [ ] `[204]`, `[141]`, `[145]` tick được, hoặc blocker ghi rõ (`[144]` đã tick ở Z.2/Z.3)
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
- [ ] **E.3-pre** Kiểm band `compact` (<1024px) trong browser: Situation Room **đã có** band này (`layout.ts` biến hai column thành flyout loại trừ nhau, rào "viewport desktop chưa được hỗ trợ" đã bị xoá khỏi code) nhưng `e2e/situation-room.spec.ts` chỉ đi 1920/1440/1280/1024 → chưa chạy lần nào. **Không copy-paste assertion**: ở compact `map.x === kingdom.w` sai vì column phủ lên map chứ không phải một track · S · deps Z.1 · phần rẻ nhất của E.3
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

- [ ] `militaryScore()` bỏ im lặng `strengthDestroyed` / `strengthLost` / `defeats` — hoặc dùng, hoặc bỏ khỏi call site
- [ ] `buildingCosts` trong `store.ts` trùng `gameRules.buildings` ở `packages/shared` (nguy cơ drift)
- [ ] `infra/migrations/README.md` dừng ở `011`, thiếu `012`–`014`
- [ ] Playwright chạy in-memory (`AUTH_MODE=dev`, không `DATABASE_URL`) → **7D đã bù một phần**: `e2e/password-auth.spec.ts` chạy thật với password auth + PostgreSQL qua prod compose, nhưng chỉ bật khi `E2E_PROD_SMOKE=1` và không nằm trong CI. Suite Chromium mặc định vẫn in-memory

## Open questions cần owner trả lời trước khi bắt đầu

1. ~~Phạm vi Phase 7D~~ → **đã rõ sau `f6085a4`**: 7D là production/beta hardening (prod smoke gate, recovery drill, security headers, fail-closed rate limiter, auth metrics). 7D **không** chạm mục 204, không chạm nhóm P0, không chạm gameplay. Câu hỏi còn lại: owner có coi 7D là đã đóng, và có muốn thêm section 7D vào roadmap (N.1)?
2. Sức chứa thế giới: mở rộng map cho 100+ người, hay giữ 20×20 và hạ mục tiêu load test? (100 chỉ là default trong `loadtest-seed.ts`)
3. Thứ tự nhóm D vs nhóm E?
4. Contributor có quyền chạy prod compose / backup / k6? (7D chứng minh drill chạy được trên máy owner — cần biết máy tôi có Docker đủ để chạy `verify:web-beta` không)
5. Misinformation baseline do owner chốt hay contributor đề xuất trong PR?
6. `verify:web-beta` có nên vào CI không (N.2), hay owner cố ý giữ nó là gate chạy tay vì cần Docker-in-Docker?
7. **Mới:** có thêm rate-limit cho GET route không? Hiện `/api/bootstrap`, `/api/season-history`, `/api/battles` **không có hạn mức nào** — 7 call site `rateLimited(` trong `app.ts` đều là POST. Z.4 chỉ ghi đúng hiện trạng vào `API.md`; việc thêm limit là quyết định của owner, sẽ đưa vào B.1 như một finding.
8. **Mới:** nhánh `feat/situation-room` (redesign, 4 commit) và `docs/truth-pass` (3 commit doc) đang chờ review — merge theo thứ tự nào, và có muốn tôi mở PR hay owner tự lấy?
