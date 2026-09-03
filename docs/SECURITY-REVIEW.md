# Security review — auth, permissions, input, secrets

Đóng mục `docs/ROADMAP.md` "Security review auth, permissions, input và secrets" (Phase 7A,
trước beta). Review đọc code tại `feat/rate-limit-buckets` trên nền `f6085a4` (Phase 7D) +
`d1212b4` (P0.1 rate-limit bucket).

Ngày: 2026-09-02 · Reviewer: contributor · Baseline: `apps/server/src` (auth, app, store,
diplomacy, combat, espionage, logistics, config, rate-limit), `infra/Caddyfile`,
`infra/docker-compose.prod.yml`, `.env.example`.

## Phạm vi và giới hạn kiểm chứng

Đọc từng dòng: toàn bộ route trong `app.ts` (4 health/metrics, 5 auth, 2 dev, 3 GET có auth,
3 admin, 26 command POST, 1 WS upgrade), `auth.ts`, mọi guard quyền trong tầng domain,
`config.ts`, header ở Caddy, biến môi trường của compose production.

**Không kiểm chứng được ở máy này** (không Docker): chuỗi thật Caddy → Fastify, nên finding
S-1 được chứng minh ở nửa Fastify bằng `app.inject` chứ không phải qua Caddy thật; hành vi
`X-Forwarded-For` của Caddy lấy theo tài liệu (`reverse_proxy` **append** địa chỉ peer vào
header client gửi). Owner nên xác nhận lại S-1 một lần trên stack thật sau khi merge.
Không chạy pentest động, không fuzz, không kiểm tra dependency ngoài `npm audit`
(exit 0, mức `high`).

## Tổng kết

| ID | Mức | Vùng | Trạng thái |
|---|---|---|---|
| S-1 | **High** | auth / rate limit | ✅ đã sửa + test hồi quy |
| S-2 | **High** | permissions / rò rỉ dữ liệu | ✅ đã sửa + test hồi quy |
| S-3 | Medium | availability | ⏳ P0.3 (đã có task) |
| S-4 | Medium | availability | ✅ đã sửa + test (P0.2, 2026-09-03) |
| S-5 | Medium | permissions / abuse | ✅ đã sửa + test (owner chốt luật 2026-09-03) |
| S-6 | Low | secrets / log | ✅ đã sửa (hardening) |
| S-7 | Low | input | 📝 ghi nhận, không sửa |
| S-8 | Low | availability | 📝 ghi nhận, không sửa |
| S-9 | Low | config | ⚠️ **owner quyết** (có thể chặn boot) |
| S-10 | Info | consistency | 📝 ghi nhận |

Không tìm thấy: SQL injection (mọi truy vấn tham số hoá), XSS đường server (không render
HTML), IDOR trên GET (mọi truy vấn khoá theo `playerId` của chính viewer), CSRF trên command
(Bearer token, cookie refresh có `Path=/api/auth` nên không được gửi tới `/api/commands/*`),
secret trong repo.

---

## S-1 (High) — `request.ip` do client tự khai, mọi hạn mức theo IP bị vô hiệu

**Chứng cứ:** `apps/server/src/config.ts:17` khai `TRUST_PROXY` là enum `"true"|"false"` và
`app.ts:49` truyền thẳng `trustProxy: config.trustProxy` cho Fastify.
`infra/docker-compose.prod.yml:48` đặt `TRUST_PROXY: "true"`.

Fastify chuyển giá trị đó cho `proxy-addr`. Boolean `true` nghĩa là *tin cả chuỗi*
`X-Forwarded-For`, và `proxy-addr` khi đó trả về entry **ngoài cùng bên trái**. Caddy
`reverse_proxy` **append** địa chỉ peer vào header client gửi, nên header tới Fastify là
`<client tự khai>, <IP thật>` — và `request.ip` lấy phần client tự khai.

**Tác động:** mọi hạn mức khoá theo IP mất hiệu lực khi attacker đổi một header:
`login:${ip}:${username}` 5/15 phút (`app.ts:131`), `register:${ip}` 3/giờ (`:130`),
`refresh:${ip}` 30/phút (`:132`), `admin:${ip}` 10/phút và 5/phút (`:163`, `:192`). Đây là
lớp chặn credential stuffing duy nhất của password auth — scrypt (`N=131072`) làm chậm từng
lần thử, nhưng thứ dừng cuộc tấn công là lockout 5 lần. Roadmap dòng 138 đã tick
"trustProxy" như một phần security baseline; kiểm soát có mặt nhưng cấu hình sai chiều.

**Đã sửa:** `TRUST_PROXY` giờ là **số hop** (`"false"` = không proxy, `"true"` = 1 hop để
deployment cũ vẫn boot, hoặc số nguyên). `config.trustProxy: false | number`; `app.ts:53-54`
biến số hop thành đúng predicate `proxy-addr` dùng (`hop < trustedHops`) vì kiểu của Fastify
nhận predicate mà không nhận số. Với 1 hop, `request.ip` là entry **bên phải** — phần Caddy
ghi — nên entry client tự khai bị bỏ qua.

**Test hồi quy:** `security.test.ts` "a client-supplied X-Forwarded-For cannot become
request.ip" — gửi `x-forwarded-for: "1.2.3.4, 203.0.113.9"` từ peer `172.18.0.5`, khẳng định
`request.ip === "203.0.113.9"`; và không có header thì `request.ip` là peer.
`config.test.ts` khẳng định `"trustProxy":1` cho `TRUST_PROXY=true`, nhận `"2"`, từ chối
`"0"` và `"yes"`.

## S-2 (High) — snapshot phát nội thất thành phố của mọi người chơi

**Chứng cứ:** `app.ts` `getSnapshot()` trước đây trả
`cities: store.snapshot.cities.map(city => ({ ...city, playerName }))` — **toàn bộ** city,
kèm `resources`, `buildings`, `queues`. Snapshot này đi ra qua `/api/bootstrap` (`:158`),
mọi response command, và mỗi lần `doBroadcast()`.

`espionage.ts:60-62`: mission `scout` trả về **đúng** `{ resources, buildings, armies }`,
làm mờ theo `accuracy`, tốn iron, có cooldown, và có thể bị counter-intel chặn. Toàn bộ chi
phí đó là vô nghĩa khi mọi client đã có bản chính xác không cần scout. `sabotage` cũng
xoay quanh `buildings` mà kẻ tấn công lẽ ra phải trinh sát trước.

Đây là **thiếu sót, không phải thiết kế**: hai collection ngay cạnh trong cùng object đã
được lọc theo viewer — `battleReports` (`viewerId ? filter participant`) và `spyMissions`
(`filter actorPlayerId === viewerId`). `cities` là collection duy nhất bị bỏ sót.

**Tác động:** bất kỳ người chơi mở devtools thấy kho tài nguyên, cấp công trình và hàng đợi
build của mọi người chơi khác — tức biết chính xác ai đang yếu, ai sắp ra quân, và không
phải trả gì cho thông tin đó. Ở một game cạnh tranh theo season có bảng điểm, đây là rò rỉ
dữ liệu người dùng *và* là lỗi luật chơi.

**Đã sửa:** entry của city **không thuộc** viewer giữ phần map hợp pháp hiển thị — `id`,
`playerId`, `playerName`, `x`, `y`, `name`, `frozen` — và mất nội thất (`resources` về 0,
`buildings` `{}`, `queues` `[]`). Zero thay vì bỏ field để `WorldSnapshot` giữ một shape duy
nhất (không sửa `packages/shared`, không sửa client). Đã kiểm: không panel nào của client
đọc nội thất city của người khác — cả 8 chỗ (`CityPanel`, `ArmyPanel`, `LogisticsPanel`,
`AdvancedDrawer`, `StrategicHeader`, `KingdomColumn`, `CommandTray`, `EspionagePanel`) đều
resolve city của chính mình qua `playerId === session.player.id`; `map.ts` và
`map-geometry.ts` không đọc `buildings`/`queues`; `EspionagePanel:25` đọc *report* của
mission chứ không đọc snapshot.

**Test hồi quy:** `app.test.ts` "a snapshot hides other players' city interiors but keeps the
map readable" — hai người chơi, khẳng định viewer thấy đúng kho của mình, thấy 0/`{}`/`[]` ở
city người kia, `store.snapshot` vẫn giữ số thật (đây là projection, không phải xoá dữ liệu),
và `id`/`x`/`y`/`playerName`/`frozen` của city người kia vẫn còn để map và danh sách mục tiêu
không trắng.

## S-3 (Medium) — `processedCommands` phình vô hạn

`processedCommands` là một array trong `game_state` JSONB, được push mỗi command và không bao
giờ cắt. Một client hợp lệ gửi `commandId` mới mỗi lần, nên trong bucket `write` 20/phút một
người chơi thêm ~28 800 phần tử/ngày; mọi command sau đó chạy `includes()` tuyến tính trên
nó, và cả array được `structuredClone` trong mỗi transaction (`store.ts:118`, `:122`).

Đây là DoS chi phí thấp (tăng bộ nhớ + độ trễ, một hàng JSONB phình) hơn là lỗ hổng bảo mật
theo nghĩa hẹp. **Không sửa ở đây**: đã có task **P0.3** ("chặn `processedCommands` phình vô
hạn; gộp mọi dedupe về một đường duy nhất") và nó chạm `store.ts` sâu.

## S-4 (Medium) — reload toàn bảng `event_ledger` trên command path

Cùng họ với S-3: `hasCommand()` nạp lại toàn bộ ledger thay vì point query trên
`event_ledger_command_idx`, nên mỗi command trả tiền cho toàn bộ lịch sử season.

**Đã sửa (P0.2, 2026-09-03).** Ba thay đổi, không đổi bảo đảm dedupe:

- Command path và moderation path gọi `Store.load({ skipLedger: true })` (`store.ts:99`,
  `:122`), nên trong transaction không còn truy vấn ledger nào ngoài point query
  `SELECT 1 FROM event_ledger WHERE command_id=$1`.
- Boot path đọc **một cột, có trần**: `SELECT command_id … WHERE command_id IS NOT NULL ORDER BY
  created_at DESC LIMIT $1` (`event-ledger.ts:53`), trần là `IDEMPOTENCY_WINDOW` (mặc định
  20 000). `payload` JSONB — chỗ chứa battle report, phần nặng nhất của bảng — không còn được
  đọc về; `history` cũng bị trim theo cùng window.
- `load()` thôi xoá `this.events`: đó là event đã append chưa persist, và xoá chúng ở đây là
  mất dữ liệu im lặng chờ caller đầu tiên nằm ngoài slot `runExclusive`.

`hasCommand()` từ "nguồn sự thật" thành **cache dương trong window**: miss chỉ có nghĩa "hỏi
Postgres", và point query + unique partial index `event_ledger_command_idx` (migration 003) vẫn
từ chối id cũ hơn window hoặc do process khác ghi. Ở in-memory mode (không pool) Set vẫn đầy đủ
theo process. Test `event-ledger.test.ts` (4 test) khẳng định query chỉ có `command_id` + `LIMIT`,
không có `payload`, và event pending sống sót qua `load()` — chạy trên gate unit, **không cần
Docker**. Số p95 trên PostgreSQL chưa đo ở máy contributor (không chạy được `test:postgres`).

## S-5 (Medium) — `ambush` không có tiền đề không gian nào

**Chứng cứ (trạng thái lúc review, trước bản sửa bên dưới):** `logistics.ts:166-186`. `ambush`
kiểm: người chơi active, caravan tồn tại và
đang `moving`, không phải caravan của chính mình (`INVALID_ATTACKER`, `:171`), và phá treaty
nếu có. Nó **không** đòi người chơi có quân, không đòi quân ở gần caravan, không tốn tài
nguyên, không có cooldown, và `ambush` không nằm trong `commandBuckets` nên chạy ở bucket
`write` 20/phút.

Đối chiếu `combat.ts:192-216`: `attack` đòi **sở hữu** army, và chỉ resolve khi hai army
**cùng ô**; khác ô thì thành pursuit order và quân phải thật sự di chuyển tới. Nghĩa là
combat có tiền đề không gian, `ambush` là ngoại lệ.

**Tác động:** một người chơi có thể xoá 60% hàng của **mọi** caravan đang chạy trên map
(25% nếu có hộ tống), 20 lần/phút, từ bất kỳ đâu, miễn phí. Đó là công cụ griefing hoàn
chỉnh và nó vô hiệu hoá toàn bộ hệ thống hộ tống/escort.

**Đã sửa (owner chốt 2026-09-03):** tiền đề là luật chơi nên review không tự đặt; owner chọn
**bán kính Manhattan 3 ô + bucket `combat`**.

- `logistics.ts:192` — guard mới, đặt **sau** `INVALID_ATTACKER` và **trước** `claim()`: phải có
  ít nhất một army `ownerPlayerId === attackerPlayerId`, không `frozen`, `strength > 0`, cách ô
  hiện tại của caravan ≤ 3 (Manhattan, viết inline đúng idiom `HARVEST_OUT_OF_RANGE` ở `:111`).
  Sai → `AMBUSH_OUT_OF_RANGE` → 400. Vì guard chạy trước `claim()`, lệnh bị từ chối **không**
  tiêu `commandId`: người chơi gửi lại đúng lệnh đó sau khi quân hành quân tới.
- `logistics.ts:42` — `caravanTile()`: caravan không có `x`/`y`, vị trí là lerp
  `source → destination` theo `progress`. Helper này là bản mirror của `apps/client/src/map.ts:326-332`
  nên server kiểm đúng ô người chơi nhìn thấy. Không resolve được hai đầu route → fail closed
  (client cũng ẩn caravan đó).
- `logistics.ts:16` — `ambushRange = 3` đứng một chỗ, có comment giải thích vì sao là 3.
- `app.ts:125` — `ambush: "combat"`: 10/phút, dùng chung counter với `attack`, thay vì 20/phút ở
  bucket `write`. Một cuộc cướp caravan không còn rẻ gấp đôi trận đánh mà nó thay thế.
- Test: `logistics.test.ts` (out-of-range, biên 3 vs 4, ô theo `progress`, army `frozen`/`strength 0`,
  `caravanTile` mirror + fail closed, và `commandId` không bị tiêu), `app.test.ts` (ambush tiêu bucket
  `combat`, không làm 429 lệnh write). Không đổi mã lỗi cũ, schema hay `PROTOCOL_VERSION`.

## S-6 (Low) — `redact` của logger không có `password`

`app.ts:49` redact `authorization`, `cookie`, `set-cookie`, `token`, `refreshToken`,
`accessToken` (7D thêm) nhưng không có `password`. Hiện Fastify không log body nên chưa rò
rỉ; nó là mìn hẹn giờ cho lần đầu ai đó log `request.body` ở `/api/auth/register` hoặc
`/api/auth/login`. **Đã sửa:** thêm `password`, `passwordHash`, `req.body.password` vào danh
sách redact — thuần bổ sung, không đổi hành vi.

## S-7 (Low) — `/api/admin/player/{ban,unban}` không validate bằng Zod

`app.ts:163` đọc `request.body?.playerId as string` và `reason` bằng tay: `playerId` chỉ được
*cast*, `reason` chỉ có sàn `length >= 3` mà không có trần. Không có injection (SQL tham số
hoá, `findPlayer` là scan in-memory, `playerId` sai → 404), nhưng một `reason` 64 KB (đúng
`bodyLimit`) sẽ được persist vào audit trail mỗi lần ban. Mọi command khác trong file đều đi
qua Zod schema của `packages/shared`. Đề xuất: schema Zod cho hai route này, `reason` tối đa
500 ký tự, `playerId` là UUID. **Không sửa** vì nó chạm `app.ts` ở vùng admin và không có
schema shared tương ứng — gộp vào PR admin kế tiếp.

## S-8 (Low) — không có trần số WebSocket connection

`app.ts:193-194`: mỗi socket chưa auth giữ một timer 5 s + interval ping 30 s, và không có
giới hạn số connection theo IP hay tổng. `maxPayload: 8192` chặn frame lớn, và sau `AUTH`
mọi frame bị drop không parse (`if (authenticated) return`), nên không có đường bơm việc.
Còn lại là cạn socket, giảm nhẹ được ở tầng OS/proxy. Đề xuất: trần `clients.size` và
giới hạn connection/IP; con số cần owner chốt theo mục tiêu 100 người chơi đồng thời.

## S-9 (Low) — `TRUST_PROXY` không bị bắt buộc ở production

Khối production của `config.ts:28-44` bắt buộc `AUTH_MODE=password`, `DATABASE_URL`,
`REDIS_URL`, token ≥ 32 ký tự, `CLIENT_ORIGIN` HTTPS — nhưng không nói gì về `TRUST_PROXY`.
Đặt sai chiều còn lại (để `false` sau Caddy) thì **mọi** người chơi mang IP của Caddy, nên
`register:${ip}` 3/giờ trở thành hạn mức toàn cầu: ba lần đăng ký là đóng cửa đăng ký cả
thế giới trong một giờ. Compose production hiện đặt đúng (`TRUST_PROXY: "true"`), nên đây là
rủi ro cấu hình chứ không phải lỗi đang có.

**Không tự sửa:** thêm guard "production phải khai số hop" sẽ chặn boot của một deployment
phơi server trực tiếp mà tôi không kiểm chứng được. Owner quyết có muốn guard đó không.

## S-10 (Info) — `ADMIN_DISABLED` trả hai status khác nhau

`moderate()` trả **404** khi thiếu `ADMIN_TOKEN` (`app.ts:163`), `/api/admin/season/close`
trả **503** cho cùng điều kiện (`:192`). Không phải lỗ hổng; 404 là lựa chọn tốt hơn (không
tiết lộ route tồn tại) nên nếu thống nhất thì nên thống nhất về 404.

---

## Kiểm soát đã xác nhận (đọc code, không phải giả định)

**Auth (`auth.ts`)** — scrypt `N=131072, r=8, p=1`, `verifyPassword` từ chối `N` ngoài
`[1024, 131072]`; token lưu dưới dạng sha256 digest, không lưu bản rõ; so sánh bằng
`timingSafeEqual`; `dummyPasswordHash()` giữ thời gian phản hồi hằng định cho username không
tồn tại; refresh rotation dùng `SELECT … FOR UPDATE` và **thu hồi cả `family_id`** khi phát
hiện tái sử dụng/hết hạn/bị ban; `authenticateAccess` đòi `u.status='active' AND
p.status='active'`; access TTL 15 phút, refresh 30 ngày; username `^[a-z0-9_]{3,32}$`,
password 12–128 ký tự.

**Cookie / origin** — refresh cookie `HttpOnly`, `SameSite=Strict`, `Path=/api/auth`,
`Secure` khi production (`app.ts:50`). `/api/auth/refresh` và `/logout` đòi Origin **khớp
tuyệt đối** và chặn cả request **thiếu** Origin (`:132`, `:133`); hook `onRequest` áp cùng
luật cho mọi `POST /api/auth/*` (`:106`). WS upgrade từ chối Origin lạ ở password mode
(`:193`). Vì cookie giới hạn `Path=/api/auth`, `/api/commands/*` không nhận cookie nào →
không có bề mặt CSRF cho command.

**Permission matrix** — mọi command đi qua đúng một guard, và guard nằm ở tầng domain (không
ở route), nên không route nào bỏ sót được:

| Hành động | Ai được phép | Guard |
|---|---|---|
| `build` | chủ city | `store.ts:134` `CITY_ACCESS_DENIED` |
| `recruit` | chủ city | `combat.ts:113` |
| `move-army`, `cancel-army-order`, `formation` | chủ army | `combat.ts:150`, `:164`, `:222` |
| `merge-army` | chủ **cả hai** army | `combat.ts:174` |
| `attack` | chủ army tấn công, không tự đánh mình, cùng ô mới resolve | `combat.ts:197`, `:200`, `:206` |
| `harvest` | chủ city | `logistics.ts:108` |
| `routes` | chủ city nguồn **và** city đích | `logistics.ts:130`, `:131` |
| `caravans` | chủ route | `logistics.ts:145` |
| `escort` | chủ caravan **và** chủ army | `logistics.ts:158`, `:159` |
| `ambush` | không phải caravan của mình, **và** có army còn sống trong 3 ô của caravan | `logistics.ts:186`, `:192` |
| `spy/launch` | không tự nhắm mình, có city, hết cooldown, đủ iron | `espionage.ts:52` |
| `spy/counter-intel` | có city | `espionage.ts:53` |
| `alliance/create`, `join` | chưa thuộc alliance nào; join thêm trần 10 thành viên | `diplomacy.ts:42`, `:63`, `:67` |
| `alliance/leave`, `contribute` | thành viên; contribute thêm chủ city | `diplomacy.ts:79`, `:155`, `:158` |
| `alliance/member` | **leader**, và không tác động được lên leader | `diplomacy.ts:104`, `:106` |
| `alliance/notice`, `vote/open` | officer trở lên | `diplomacy.ts:116`, `:125` |
| `alliance/vote/cast` | thành viên, chưa vote | `diplomacy.ts:137`, `:138` |
| `treaty/propose` | không tự đề nghị mình, không trùng pending | `diplomacy.ts:189`, `:196` |
| `treaty/respond` | **chỉ target** | `diplomacy.ts:220` `UNAUTHORIZED` |
| `treaty/break` | **chỉ một trong hai bên** | `diplomacy.ts:247` |
| `/api/admin/*` | `ADMIN_TOKEN` so sánh hằng thời gian | `app.ts:161`, `:162` |

Thêm hai lớp chạy trước mọi guard trên: `command()` từ chối token không hợp lệ (401) và
player `banned` (403) trước khi gọi action (`app.ts:108`); tầng domain gọi lại
`assertActivePlayer` / `assertActiveTarget` nên một entity bị đóng băng cũng không thành mục
tiêu (`ACCOUNT_BANNED` / `TARGET_FROZEN`).

**Scope của GET** — cả ba GET có auth đều khoá theo `playerId` lấy từ token, không từ query:
`/api/bootstrap` và `/api/season-history` (`:158`, `:159`), `/api/battles` với
`WHERE (attacker_id=$1 OR defender_id=$1)` ở cả nhánh PostgreSQL và nhánh in-memory
(`:160`). Cursor keyset được validate chặt trước khi dùng — base64url → JSON, `createdAt`
phải round-trip đúng ISO, `id` phải khớp regex UUID, sai thì `INVALID_CURSOR` 400 — và vì
điều kiện chủ sở hữu luôn nằm trong câu truy vấn, cursor giả mạo chỉ dịch cửa sổ trong dữ
liệu của chính người gọi, không mở được của người khác. `limit` chỉ nhận `^[1-9]\d*$`, kẹp
về 50.

**Input** — 26 command POST đều `schema.parse(request.body)` với Zod schema của
`packages/shared`; `ZodError` thành `INVALID_PAYLOAD` 400 (`app.ts:108`). `bodyLimit`
64 KB, `requestTimeout` 15 s. Mọi truy vấn SQL tham số hoá (đã đọc `store.ts`, `auth.ts`).
Lỗi không khớp `^[A-Z0-9_]+$` bị log và trả `INTERNAL_ERROR` 500, nên message nội bộ không
lọt ra response.

**Rate limit** — sau P0.1 (`d1212b4`): bucket `write` 20 / `combat` 10 / `spy` 5 / `read` 60
mỗi phút mỗi player, khai báo tập trung ở `app.ts:102-105`, không còn tham số limit ở call
site nên một limit không thể lệch khỏi counter nó tiêu. Limiter **fail-closed**: Redis chết
ở production thì trả 503 `DEPENDENCY_UNAVAILABLE` chứ không cho qua (`rate-limit.ts:22`,
`:30`; `app.ts:98`).

**Secrets** — không có secret trong repo (`.env.example` để trống `ADMIN_TOKEN` /
`METRICS_TOKEN`; compose đọc từ `.env.prod` không commit). Production từ chối boot nếu
`ADMIN_TOKEN` hoặc `METRICS_TOKEN` < 32 ký tự (`config.ts:33-34`). `/metrics` đòi token so
sánh hằng thời gian ở password mode (`app.ts:120-125`). Pino redact: xem S-6.

**Config production** — `config.ts:28-44` từ chối boot production khi `AUTH_MODE≠password`,
thiếu `DATABASE_URL`/`REDIS_URL`, token ngắn, hoặc `CLIENT_ORIGIN` không phải origin HTTPS
trần. Nghĩa là các seam dev-mode dưới đây **không thể** tồn tại trong một deployment
`NODE_ENV=production`.

**Biên mạng (Caddy)** — `infra/Caddyfile:4-9` trả 404 cho `/health/ready`, `/metrics`,
`/api/dev/*` từ ngoài; `:27-34` thêm CSP, HSTS `preload`, Referrer-Policy,
Permissions-Policy, nosniff, X-Frame-Options. Server tự set một bộ header trùng mục đích ở
`onSend` (`app.ts:107`) nên response API vẫn có header khi không qua Caddy.
`e2e/password-auth.spec.ts` (gate `E2E_PROD_SMOKE=1`) assert ba path nội bộ trả 404 từ
ngoài — **chưa từng quan sát xanh ở máy này**, cần Docker.

## Rủi ro chấp nhận (dev mode)

`/api/dev/reset` xoá cả thế giới và **không cần auth**; `/api/dev/battle-target` chỉ cần
token người chơi; `/metrics` mở; WS upgrade và `POST /api/auth/*` không kiểm Origin. Cả bốn
chỉ tồn tại khi `AUTH_MODE=dev`, và ba lớp đứng chắn: `config.ts:30` không cho dev mode ở
production, Caddy 404 `/api/dev/*` và `/metrics`, và `NODE_ENV=production` được đặt trong
compose (`infra/docker-compose.prod.yml:42`, `:73`). Chấp nhận: đây là test seam của e2e
suite in-memory.

Còn một cạnh cần biết: `NODE_ENV` default là `"development"` (`config.ts:4`), nên toàn bộ
khối guard production chỉ chạy khi biến đó được đặt đúng. Compose đặt đúng; một deployment
tay quên nó sẽ mất cả khối. Xem S-9.

## Việc còn treo cho owner

1. **S-9** — có thêm guard "production phải khai `TRUST_PROXY`" không?
2. **S-1** — xác nhận lại một lần trên stack thật (Caddy → Fastify) sau khi merge, vì máy
   contributor không có Docker.
3. **S-7** — schema Zod cho hai route admin, gộp vào PR admin kế tiếp.
4. **S-8** — con số trần WebSocket connection.
5. `npm audit --audit-level=high` exit 0 tại thời điểm review; nó là gate 10 của CI nên
   không cần theo dõi tay.
