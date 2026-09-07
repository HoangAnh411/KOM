# API và realtime protocol

## REST

### Player hub va cosmetic

`GET /api/player-hub` tra catalog phien ban, vi `Huy hieu`, cosmetic da so huu, cosmetic dang trang bi, ho so va cac phan thuong du dieu kien cua chinh player.

- `POST /api/commands/cosmetics/claim` nhan `{ commandId, rewardId }`.
- `POST /api/commands/cosmetics/purchase` mua `{ commandId, itemId }`; gia va so du do server quyet dinh.
- `POST /api/commands/cosmetics/equip` trang bi `{ commandId, slot, itemId }`; gui `itemId: null` de tro ve mac dinh.

Tat ca command tra `CommandResponse` kem hub moi trong `data`, dung cung idempotency va transaction voi canonical `game_state`. Cosmetic khong anh huong tai nguyen, diem chien dau, combat hay do tham.

### Password authentication

`POST /api/auth/register` nhận `{ username, password, factionId, displayName? }`; `POST /api/auth/login` nhận `{ username, password }`. Password mode yêu cầu `AUTH_MODE=password` và PostgreSQL. Access token chỉ sống 15 phút; refresh secret chỉ nằm trong HttpOnly SameSite=Strict cookie và được rotate tại `POST /api/auth/refresh`. `POST /api/auth/logout` revoke session.

`POST /api/admin/player/ban` và `/unban` nhận `{ playerId, reason }`, yêu cầu `Authorization: Bearer <ADMIN_TOKEN>`. Ban trả `ACCOUNT_BANNED` cho account và đánh dấu city/army/caravan là `frozen`; endpoint bị disable khi token rỗng.

### `POST /api/auth/dev`

Request:

```json
{"displayName":"Lan","factionId":"meridian"}
```

Response gồm `token`, `player` và `snapshot`. Đây là auth development; chưa dùng cho production.

### `GET /api/bootstrap`

Header: `Authorization: Bearer <token>`.

Trả về player hiện tại và world snapshot dùng để khởi tạo client. Snapshot bị giới hạn theo người xem — xem `## World snapshot`.

### `GET /api/season-history`

Yêu cầu Bearer player token. Trả public ranking các season đã đóng và chỉ trả legacy/reputation cosmetic của chính người xem.

### `POST /api/admin/season/close`

Yêu cầu `Authorization: Bearer <ADMIN_TOKEN>` và body `{ "reason": "..." }`. Endpoint finalize ngay trong request; trả `ADMIN_DISABLED` khi chưa cấu hình token và ghi `admin_actions` khi thành công.

### `POST /api/commands/build`

Header: `Authorization: Bearer <token>`.

Request:

```json
{"commandId":"unique-command-id","cityId":"city-id","buildingId":"warehouse","queueType":"build","plotX":1,"plotY":3}
```

`plotX` và `plotY` là tọa độ nội thành, cùng bắt đầu từ 0; phải có cả hai hoặc không có cả hai. Khi xây công trình lần đầu, server kiểm tra ô nằm trong kích thước hiện tại và chưa bị chiếm rồi giữ ô ngay lúc lệnh vào queue. Nếu bỏ tọa độ (các nút xây nhanh cũ), server tự lấy ô trống đầu tiên. Nâng cấp dùng lại vị trí công trình đã có. Server còn kiểm tra season, rate-limit, schema, ownership, queue capacity, resource cost và idempotency trước khi chấp nhận.

## Army v2, research và campaign

- `POST /api/commands/recruit-reserve`: tuyển quân vào dự bị của thành qua **hàng đợi huấn luyện** — cùng giá, giới hạn hàng đợi và thời gian với `/api/commands/train`; không tạo đạo quân và không cấp quân tức thời.
- `POST /api/commands/army/create`: lấy quân dự bị và gán một chỉ huy chưa dùng để lập đạo quân.
- `POST /api/commands/army/reinforce`, `/api/commands/army/transfer`: bổ sung hoặc chuyển đúng số lượng quân khi các đạo quân cùng ở thành và không có lệnh.
- `POST /api/commands/army/return-home`: tạo hành trình về thành; chỉ khi đến nơi mới nạp tiếp tế, đưa thương binh vào dự bị và cho phép chỉnh quân.
- `POST /api/commands/train`, `/api/commands/heal`: dùng hàng đợi doanh trại/quân y riêng. Quân y viện chữa thương bằng lương thực; thiếu tài nguyên thì lệnh bị từ chối, thương binh không mất.
- `POST /api/commands/research`: bắt đầu một trong sáu công nghệ tại Học viện. Nghiên cứu hoàn tất qua server tick và được giữ qua mùa.
- `POST /api/commands/campaign/complete`: hoàn thành nhiệm vụ chiến dịch theo **loại nhiệm vụ**. Mỗi nhiệm vụ có `kind` và một tọa độ mục tiêu `target {x, y}` trên lưới 256 (xem `campaignMissions` trong `@kingdoms/shared`):
  - `combat` (9 nhiệm vụ): cần `armyId` (bỏ trường này trả `ARMY_REQUIRED`), đạo quân phải v2, không đang di chuyển, và đứng trong bán kính Manhattan `gameRules.campaign.arrivalRadius` = 3 ô quanh mục tiêu (`MISSION_TARGET_NOT_REACHED`). NPC spawn **tại mục tiêu**, không phải tại vị trí quân. Thắng mới tính hoàn thành và trả XP cho chỉ huy.
  - `scout`: điều kiện là ô mục tiêu đã nằm trong vùng khám phá của người chơi — cũng là điều kiện mọi kind đều phải qua (`MISSION_TARGET_UNEXPLORED`).
  - `build`: cần công trình theo điều kiện (vd `road_depot` cấp 1) ở một thành bất kỳ của người chơi (`MISSION_CONDITION_UNMET`).
  - `trade`: cần tổng throughput giao thương (wood+stone+iron) đạt mức điều kiện (`MISSION_CONDITION_UNMET`).
  - Ba nhiệm vụ phi chiến đấu trả `rewardResources` vào thành đầu thay vì XP, và **không cần `armyId`**.
- `POST /api/commands/campaign/patrol`: sau khi hoàn thành toàn bộ chiến dịch, chạy tuần tra PvE lặp lại tại chỗ quân đứng; mỗi trận **thắng** nhận thêm thưởng tài nguyên theo chương (`gameRules.campaign.patrolRewards`), chỉ hòa/thua thì không. XP vẫn chỉ theo chiến thắng, không nhận lại thưởng mở khóa.

Lưu ý theo mùa: `campaignProgress` được giữ qua season reset, nhưng throughput giao thương thì bị reset — nhiệm vụ `trade` của một season mới phải giao đủ lại từ đầu.

Đạo quân mới phải có tiền tuyến, một chỉ huy và tổng số lính không vượt sức chứa theo cấp chỉ huy. Snapshot trả rõ thành phần quân, thế trận, buff, thương binh, tiếp tế, dự bị và dữ liệu địch đã trinh sát; không dùng một chỉ số `strength` để cam kết thắng.

Khi đóng mùa, thành, chỉ huy/XP, dự bị, đạo quân đang đi, thương binh, nghiên cứu, khám phá và chiến dịch được giữ lại. Chỉ điểm mùa, mục tiêu mùa, thành tích mùa và các NPC theo mùa được làm mới.

### `GET /health`, `/health/live`, `/health/ready` và `GET /metrics`

- `/health` và `/health/live` dùng cho liveness — luôn `{ ok: true }` khi process còn sống.
- `/health/ready` là readiness thật: trả 503 kèm `reason` khi đang shutdown (`shutting_down`), chưa nạp state (`state_not_loaded`), PostgreSQL hoặc Redis không ping được (`postgres` / `redis`), hoặc tick trễ hơn `tickMs * 3` (`tick_lag`). Nhiều lỗi cùng lúc trả `reason: "unhealthy"` kèm mảng `checks`.
- `/metrics` trả Prometheus-compatible metrics. Ở `AUTH_MODE=password` cần `Authorization: Bearer <METRICS_TOKEN>`; ở dev mode không yêu cầu auth. Trong prod compose, Caddy không public `/metrics`, `/health/ready` và `/api/dev/*` ra ngoài.

## World snapshot

Snapshot đi ra qua ba đường — `GET /api/bootstrap`, response của mỗi command, và message
`SNAPSHOT` trên WebSocket — và **cùng một projection theo người xem** áp cho cả ba. Ba
collection bị khoá theo `playerId` lấy từ token, không theo tham số client gửi:

- `battleReports`: chỉ trận mà người xem là attacker hoặc defender.
- `spyMissions`: chỉ mission do chính người xem khởi chạy.
- `world`: descriptor của asset world đang chạy; hiện là `meridian-256-v2`, extent 256, chunk size 16 và URL manifest semantic.
- `exploration`: bitmask base64 64×64 cùng `revision`; vùng đã mở không đóng lại trong season.
- `cities`: city của người khác chưa scout bị che cả danh tính (`name = Thành chưa xác định`, `playerName = Không rõ`, không có faction) lẫn nội thất. Sau scout thành công, `visibility = scouted` và `intel` là ảnh chụp tại `observedAt`, không phải dữ liệu live.
- `armies`: quân của chính người xem luôn có; quân khác chỉ đi trên dây khi tọa độ nằm trong vùng đã khám phá.

Nội thất city đúng là thứ mission `scout` của `spy/launch` bán: nó tốn iron, có cooldown, làm
mờ kết quả theo `accuracy` và có thể bị counter-intel chặn. Nên client **không được** đọc
`resources`/`buildings`/`buildingPlots`/`queues` của city người khác như dữ liệu — số 0 ở đó nghĩa là "chưa
biết", không phải "trống". Muốn biết thì scout, và đọc kết quả từ report của mission.

Thay đổi này là snapshot **protocol v4**. Client cũ bị version gate chặn thay vì diễn giải nhầm fog hoặc coi số liệu scout cũ là dữ liệu trực tiếp.

## WebSocket

Kết nối: `ws://localhost:3000/ws`, sau đó gửi `{ "type": "AUTH", "token": "<access-token>" }` trong tối đa 5 giây. Token trên query string không được chấp nhận.

Server gửi message `SNAPSHOT` chứa kingdom, season, cities, caravans, armies, heroes, scores, alliance, treaty, spy mission của người xem, world event và faction catalog. Nội dung đã qua projection theo người xem như `GET /api/bootstrap` — xem `## World snapshot`.

Gameplay command đi qua REST; WebSocket dùng cho snapshot và battle report realtime sau khi xác thực. Sau khi `AUTH` thành công, server **bỏ qua mọi message client gửi tiếp** (socket vẫn mở) — không có đường command nào qua WS.

Nhịp push: broadcast là change-driven và được coalesce vào vòng tick (`tickMs`, mặc định 1000 ms) — `requestBroadcast()` chỉ bật cờ, chính tick mới gửi snapshot. Hệ quả: (a) một REST command tới được các client trong vòng ≤ ~1 tick (đo trên dev in-memory: 0,2–1,0 s), (b) thế giới không thay đổi thì không có push nào, vì tài nguyên chỉ đổi qua harvest/caravan/queue chứ không trickle thụ động.

Lỗi có dạng `ERROR` với code ổn định như `RATE_LIMITED`, `QUEUE_LIMIT_REACHED`, `CITY_ACCESS_DENIED`, `INSUFFICIENT_RESOURCES`. REST command còn có thể trả 503 `DEPENDENCY_UNAVAILABLE` khi dependency bắt buộc (Redis) không dùng được ở production.

## Quy tắc protocol

- Mọi write command phải có `commandId` duy nhất.
- Gửi lại đúng một `commandId` đã được chấp nhận không bao giờ áp dụng hiệu ứng hai lần: server trả lại kết quả `already_processed` thay vì thực thi lại. An toàn để client retry sau timeout mạng — nhưng phải retry với **cùng** id, id mới là một command mới.
- Nguồn sự thật của idempotency là partial unique index `event_ledger_command_idx` cộng point query `SELECT 1 FROM event_ledger WHERE command_id=$1` chạy **trong** transaction của command. Process còn giữ một cache dương gồm `IDEMPOTENCY_WINDOW` command id gần nhất (mặc định 20 000) để trả lời nhanh mà không cần round trip; id rơi ra ngoài window chỉ tốn thêm một truy vấn, không mất bảo đảm. Ở in-memory mode (không có PostgreSQL) cache chính là bảo đảm, và nó chỉ tồn tại theo process.
- Client không gửi authoritative cost, score, battle result hoặc server timestamp.
- Event ledger, outbox và state của mỗi REST command được commit trong cùng transaction khi PostgreSQL được bật.
- Thay đổi breaking phải tăng protocol version và cập nhật shared package cùng API docs.

## Rate-limit mặc định

Mỗi hạn mức là một bucket theo `key` trong `apps/server/src/app.ts`; vượt hạn mức trả HTTP 429 với code `RATE_LIMITED`.

Nguyên tắc: **một bucket = một hạn mức**. Nhóm command được khai báo ở bảng `commandBuckets` trong `app.ts`, không truyền ở từng route, nên hạn mức không thể lệch với counter mà nó tiêu.

- Write command REST: 20/phút/player — key `write:<playerId>`. Gồm build, harvest, route, caravan, escort, toàn bộ alliance/treaty và `onboarding/ack`.
- Combat: 10/phút/player — key `combat:<playerId>`. Gồm `recruit`, `move-army`, `attack`, `cancel-army-order`, `formation`, `merge-army`, `ambush`.
- Espionage: 5/phút/player — key `spy:<playerId>`. Gồm `spy/launch` và `spy/counter-intel`.
- Read REST (`/api/bootstrap`, `/api/season-history`, `/api/battles`): 60/phút/player — key `read:<playerId>`, dùng chung cho cả ba route. Một vòng reconnect (bootstrap + battle history + archive) tiêu 3 lần nên client bình thường không tới gần hạn mức.
- Register: 3/giờ/IP — `register:<ip>`.
- Login ở `AUTH_MODE=password`: 5 lần mỗi 15 phút, khoá theo IP **và** username — `login:<ip>:<username>`.
- Login dev (`POST /api/auth/dev`): 30/phút/IP — `login:<ip>`.
- Refresh: 30/phút/IP — `refresh:<ip>`.
- Admin: moderation 10/phút/IP, season close 5/phút/IP — `admin:<ip>`.
- WebSocket: không có hạn mức command, vì WS không nhận command (xem mục WebSocket).

Ở production limiter **fail-closed**: khi Redis không dùng được, request trả 503 `DEPENDENCY_UNAVAILABLE` chứ không cho qua. Điều này áp dụng cho cả route đọc và route auth/admin, không chỉ command.


### Logistics commands

- `POST /api/commands/harvest` thu hoạch tối đa 50 resource từ node trong phạm vi và cần depot.
- `POST /api/commands/routes` tạo route giữa hai city cùng player; distance và travel time do server tính.
- `POST /api/commands/caravans` trừ cargo tại source, giới hạn bởi depot capacity, rồi delivery tại destination.
- `POST /api/commands/escort` gắn army của player vào caravan đang di chuyển.
- `POST /api/commands/ambush` resolve deterministic; seed được lưu trong caravan và event ledger. Người tấn công phải có ít nhất một army còn sống (`strength > 0`, không `frozen`) trong bán kính Manhattan **3 ô** quanh **ô hiện tại của caravan** — ô này là lerp `source → destination` theo `progress`, đúng ô client vẽ (`apps/client/src/map.ts:326-332`). Không đủ điều kiện → 400 `AMBUSH_OUT_OF_RANGE`, và `commandId` **chưa** bị tiêu nên gửi lại được sau khi quân tới.

### Alliance và treaty commands

- `POST /api/commands/alliance/create` tạo alliance và gán người tạo làm leader.
- `POST /api/commands/alliance/join` và `POST /api/commands/alliance/leave` quản lý membership.
- `POST /api/commands/alliance/contribute` đóng góp tài nguyên với diminishing returns.
- `POST /api/commands/alliance/member` cho leader promote, demote hoặc kick; không thể kick leader.
- `POST /api/commands/alliance/notice` cho leader/officer cập nhật notice.
- `POST /api/commands/alliance/vote/open` mở vote đổi leader trong 24 giờ.
- `POST /api/commands/alliance/vote/cast` cho mỗi member bỏ một phiếu; cần số phiếu yes lớn hơn 50% tổng membership.
- `POST /api/commands/treaty/propose` tạo đề nghị treaty.
- `POST /api/commands/treaty/respond` chấp nhận hoặc từ chối đề nghị.
- `POST /api/commands/treaty/break` phá treaty đang active và áp dụng phạt reputation.

### Espionage commands

- `POST /api/commands/spy/launch` khởi chạy scout, sabotage hoặc steal mission.
- `POST /api/commands/spy/counter-intel` bật phản gián có cost và cooldown server-side.
- Snapshot chỉ trả spy mission do player đang xem khởi chạy.

### World events và NPC

- `mob_migration` tạo 2–3 army có `ownerType: "npc"`, không có `ownerPlayerId` và gắn `sourceWorldEventId`.
- NPC hành động mỗi 10 giây, tìm player army trong Manhattan radius 3, tiến một tile và giao chiến khi cùng tile.
- NPC battle dùng cùng deterministic combat resolver; ledger lưu event id, seed, input và battle report để audit/replay.
