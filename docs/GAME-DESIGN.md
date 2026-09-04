# Game design và nguyên tắc cân bằng

## Ba trục thắng

Điểm mỗi trục được chuẩn hóa `0..1000` từ objective server-side:

```text
overall = military * 0.40 + economy * 0.35 + diplomacy * 0.25
```

- Military: territory, battle objective, defense và bảo vệ logistics.
- Economy: resource throughput, trade route và resource hiếm.
- Diplomacy: treaty objective, reputation, mediation và ảnh hưởng hợp lệ.
- Tie-break: overall → military → economy → diplomacy → player ID tăng dần.

Mỗi season lưu cả ranking tổng và ranking riêng từng trục.

## Season lifecycle

```text
SCHEDULED → ACTIVE → FINALIZING → CLOSED → season mới
```

- MVP mặc định 14 ngày qua `SEASON_DURATION_MS`.
- Khi đến `ends_at`, server ngừng command gameplay, tính lại từ state/event ledger, snapshot ranking và tạo `legacy_records`.
- Legacy chỉ gồm danh hiệu, lịch sử, reputation và cosmetic; không chuyển power combat.
- Finalization phải idempotent và có distributed lock khi chạy nhiều instance.

## Logistics

- Tài nguyên đi qua node, depot, route và caravan; thành không có kho vô hạn tự sinh.
- Caravan có cargo, owner, route, progress, hộ tống và trạng thái ambushed/delivered.
- Army xa tuyến tiếp tế mất supply, morale và strength theo thời gian/khoảng cách.
- Mục tiêu tấn công gồm city, depot, caravan và trade route.

## Bản đồ và lãnh thổ

Thế giới là **36×36 ô**, **vẽ tay**, sống ở `packages/shared/src/world-map.ts` dưới dạng hai lưới
ký tự — một cho terrain, một cho vùng. Trước đó nó là ba phép modulo trong `combat.ts`
(`(x+y)%7`, `(x*y)%11`, `(x+y)%13`), tức là những dải chéo: không vùng, không chỗ nghẽn, không gì
để người chơi nhớ. Bản đồ nằm trong `shared` vì **client và server đọc cùng một dữ liệu**, nên
mặt đất người chơi thấy và mặt đất trận đánh được phân xử trên không thể lệch nhau, và lưới
không phải đi trong mỗi snapshot.

Vì sao đúng 36: terrain được bake vào **một** `RenderTexture` ở `resolution: 2`, nên kích thước
texture là `(56·N + 2)·2` — 36 cho 4036px, còn 60px dưới trần 4096 mà mọi target WebGL bảo đảm;
40 thì vượt. `map-geometry.test.ts` giữ trần đó bằng một assertion, không phải bằng may mắn.

**Địa hình là cố ý, không phải trang trí.** Rừng bao quanh mỏ gỗ, đồi bao quanh mỏ đá và mỏ sắt —
mặt đất nói cho người chơi biết chỗ nào có gì trước khi họ click. Biên vùng chạy bắc-nam là
**sống đồi**, biên chạy đông-tây là **đầm**: `terrainModifiers` đã ưu bên phòng thủ trên đồi và
phạt bên tấn công trong đầm, nên một đường biên là nơi đáng đứng. **Toàn bộ 59 ô đầm đều nằm trên
một đường biên vùng** — đầm có nghĩa vì bạn đang lội qua ranh giới của người khác. Mỗi ô thứ sáu
của biên được để trống làm **đèo** (37 đèo bắc-nam, 35 chỗ cạn đông-tây), nên không vùng nào có
thể bị bịt kín. Bốn thương cảng và hai thành seed đứng trên đất trống.

Tỷ lệ terrain: **plains 61.7% / forest 18.8% / hills 14.9% / swamp 4.6%** — cố ý sát thế giới
modulo cũ (64/16/14/5) để thay bản đồ không âm thầm dịch cân bằng battle. `world-map.test.ts`
giữ các dải này; ra khỏi dải là một **đổi cân bằng** và phải là một quyết định.

**Mười sáu tỉnh** trên lưới 4×4, mã `A`–`P`, mỗi tỉnh 79–83 ô (trung bình 81). Biên tỉnh lệch đi
một ô để đọc như sống đồi chứ không phải đường kẻ địa chính, nhưng được **ghim về danh nghĩa tại
các điểm giao bốn chiều** — không ghim thì hai đường lệch trượt qua nhau và sinh ra đảo một ô, mà
một tỉnh không liền khối thì không thể giữ bằng cách đóng quân trong đó. Mỗi tỉnh có một **ô lỵ sở
(seat)**: thương cảng của nó nếu có, còn không thì mỏ gần tâm tỉnh nhất — nên giữ một tỉnh nghĩa
là giữ một chỗ vốn đã đáng giữ, và luật có **một ô** để trỏ vào thay vì một vùng để lấy trung bình.

**Ba mươi sáu anchor**: 4 thương cảng (một mỗi góc thế giới, trên quỹ đạo xoay 90° của hub cũ ở
(10,10)) + 32 mỏ, **đúng hai mỏ mỗi tỉnh**. Mười hai gỗ, mười hai đá, **tám sắt** — đối xứng xoay
ngặt buộc phải là bội của bốn, và sắt vẫn là thứ khan hiếm, đúng điều mà tốc độ hồi phục chậm hơn
của nó (3/tick so với 5) đã nói. Một phần tư mỗi loại tài nguyên nằm trong mỗi góc tư, nên không
góc nào là chỗ khởi đầu tốt hơn góc nào; trung tâm — nơi bốn tỉnh gặp nhau — là chỗ tranh chấp.

Sức chứa thành phố là **hệ quả của số anchor**, không phải của việc nới luật: thành phố vẫn cách
nhau ≥3 ô và vẫn phải nằm trong tầm với của một thương cảng hoặc mỏ. Sáu toạ độ là **di sản và
không được di chuyển** — thương cảng (10,10), mỏ (6,8), (15,10), (10,14), thành seed (8,8) và
(13,11) — vì các test logistics và espionage hiện có mô tả khoảng cách giữa chúng.

Đo được **135 ô đặt được thành phố** (2 thành seed + 133), so với **14** của thế giới 20×20 — profile
load test là 120 người, nên trần này có dư. Ba luật quyết định con số đó, và không luật nào là "nới
ra cho đủ":

1. **Cách nhau ≥3 ô, ≤3 ô tới một thương cảng hoặc mỏ.** Tầm với là 3 chứ không phải 2 vì 2 chỉ cho
   111 ô — dưới 120 — và mua phần thiếu bằng anchor thì cần 49 cái, quá mức vẽ tay hợp lý.
2. **Trong tầm thu hoạch phải có mỏ của cả ba loại tài nguyên.** Công trình cần gỗ, đá **và** sắt,
   mỗi tỉnh chỉ có hai mỏ, nên một ô có thể đứng cạnh mỏ đá mà không với tới sắt nào: hết starter
   package là hết đường. Thế giới 20×20 không có vấn đề này vì cả ba mỏ đều trong tầm mọi nơi, nên
   luật này chưa từng phải viết ra.
3. **Đặt thành phố đi vòng theo tỉnh**, tỉnh nào ít thành nhất được chọn trước. Row-major trên bản
   đồ rộng 36 dồn 40 người đầu vào góc tây-bắc — vừa hỏng trải nghiệm vừa làm load test đo một cụm
   thay vì một thế giới. Mười bốn người đầu tiên vào đúng mười bốn tỉnh mà hai thành seed không
   đứng; ở 122 thành, tỉnh đông nhất có 8 và tỉnh ít nhất có 6.

**Tầm thu hoạch là nửa bề rộng bản đồ** (18 ô ở 36×36). Trước đó nó là số `10` viết thẳng trong
`logistics.ts` — đúng nửa bề rộng của thế giới 20×20 mà nó được viết cho, và với ba mỏ ở giữa thế
giới ấy thì nó chưa bao giờ từ chối điều gì. Giữ nguyên 10 trên bản đồ mới sẽ để một phần ba số ô
không với tới sắt nào. Muốn thu hoạch **thành ra cục bộ** — để caravan là câu trả lời cho thứ mình
không đào được — thì hạ hằng số này, và cái giá là sức chứa: 12 cho 120 ô, 14 cho 130, 18 cho 135.
Đó là một **quyết định cân bằng**, không phải một con số kỹ thuật.

Terrain hiện **chỉ** ảnh hưởng hệ số battle. Nó chưa ảnh hưởng di chuyển, thu hoạch hay tầm nhìn;
đó là luật gameplay mới, không phải hệ quả của việc có một bản đồ thật.

Sửa bản đồ là sửa hai string literal. `world-map.test.ts` giữ các bất biến làm việc đó an toàn —
hai lưới vuông, chỉ ký tự hợp lệ, mười sáu tỉnh liền khối có seat bên trong chính nó, hai mỏ mỗi
tỉnh, và một **digest vàng** (`worldMapDigest()`) nên một thay đổi với thế giới là một dòng diff
phải cố ý.

### Chiếm vùng và điểm lãnh thổ

**Một tỉnh thuộc về người có quân sống đứng gần ô lỵ sở nhất, trong bán kính Manhattan
`gameRules.territory.captureRadius` = 1.** Đứng **cạnh** seat, không phải "đâu đó trong tỉnh": một
tỉnh rộng tám mươi ô, và "đâu đó trong nó" biến quyền kiểm soát thành thứ người ta trôi vào chứ
không phải thứ người ta giữ. Hai người cùng khoảng cách → tỉnh **vô chủ**, không ai được điểm: thứ
tự quân trong state là tình cờ của thứ tự chèn, và một tỉnh đang tranh chấp nên đọc ra là đang
tranh chấp thay vì một dòng bảng điểm đổi chủ khi một hàng dịch chỗ. Quân **NPC không tranh vùng** —
cố ý: một raider đậu trên seat sẽ tạo ra một tỉnh không ai giữ được. Quân chết (`strength = 0`),
quân `frozen` và quân của người bị ban cũng không.

Kiểm soát là **ảnh chụp bàn cờ, không phải tổng cộng dồn**: tính lại mỗi tick, nên tỉnh đổi chủ
ngay lúc có người tiến vào, và rút quân đi là mất. Đó là điều ngược với `victories` — thứ chỉ tăng —
và là lý do giữ đất phải **giữ** thật. Luật sống ở `apps/server/src/territory.ts`, thuần, nhận quân
và trả về ô.

**Thang điểm: `tilesControlled` được chia theo một phần tư bản đồ** (`fullScoreTiles` = 1296/4 =
324), không phải 5 điểm một ô. Thang cũ bão hoà ở 60 ô — **ít hơn một tỉnh** — nên giữ một tỉnh ăn
trọn 300 điểm giống như giữ nửa thế giới, biến 30% trục quân sự thành một cái công tắc hai vị trí.
Thang mới: một tỉnh (79–83 ô) cho **73–76 điểm**, bốn tỉnh cho **292–300** tuỳ chọn bốn tỉnh nào,
và trần vẫn là 300. Viết thành *tỷ lệ của bản đồ* nên đổi kích thước thế giới không âm thầm làm
lãnh thổ rẻ đi hay đắt lên.

Trước vòng này, 300 điểm lãnh thổ **không có ai ghi**: hàng `military_throughput` chỉ sinh ra khi
một người đánh nhau lần đầu (`combat.ts`), nên người chưa từng đánh nhau không thể có điểm lãnh thổ,
còn người từng đánh thì mang một `tilesControlled` vĩnh viễn bằng 0. Ba phần mười trục quân sự là
chỗ chết. Giờ hàng được tạo ở lần đầu **giữ đất**, không cần trận nào — nhưng vẫn chỉ khi thật có
đất: `combat.persist` ghi một upsert cho *mỗi* hàng, nên tạo sẵn hàng cho cả 122 người sẽ thêm 122
upsert mỗi lần lưu cho những người không làm gì. Bảng `regions` và cột `map_tiles.region_id` vẫn là
di tích — không dòng nào ghi vào chúng; id tỉnh mà luật đọc nằm ở `resource_nodes.region_id`.

## Faction identity

- Meridian League: thương mại, capacity và throughput.
- Bastion Covenant: phòng thủ, công trình và hồi phục.
- Ravager Clans: cơ động, raid và ambush.
- Veiled Concord: spy, counter-intelligence và diplomacy.

Faction thay đổi decision space, không chỉ cộng vài phần trăm attack.

## Anti-pay-to-win

- Baseline queue: `2 build + 1 research` cho mọi người.
- Speed-up chỉ đến từ gameplay và có giới hạn hoạt động.
- Không bán tướng, quân, tech, resource chiến đấu, score hoặc quyền alliance.
- Bán cosmetic, title, effect, skin và utility UI không làm tăng power.
- PvP cân bằng bằng command cap, terrain, counter, timing, supply, morale và matchmaking.
- Alliance dùng contribution diminishing returns, voting, term limit và audit log.

## Tình báo và world events
### Phase 5 implementation baseline

- Spy mission gồm `scout`, `sabotage`, `steal`, `misinformation`; cost mặc định lần lượt 50, 150, 100, 120 iron, có duration và cooldown server-side.
- Accuracy = `baseAccuracy × 1.2` cho Veiled Concord, giới hạn tối đa 1. Veiled giảm 20% cost và 15% cooldown.
- Counter-intel kéo dài 30 phút; interception chance là 30%, hoặc 52% với Veiled Concord.
- Scout chỉ trả report cho actor; resource estimate có noise theo accuracy. Steal bị giới hạn tối đa 100 wood, stone và iron cho mỗi mission.
- `misinformation` do A cắm lên B: cost 120 iron, duration 540s, cooldown 1800s, `baseAccuracy` 0.45. Khi thành công, mọi `scout` của B nhắm vào A trong 20 phút đọc tài nguyên, building level và strength bị bóp méo bởi **cùng một** hệ số `1 ± (0.25 + accuracy × 0.5)` — độ lớn theo accuracy của mission cắm, dấu deterministic theo `hash(mission.id)` nên phe phòng thủ không luôn hiện ra mạnh hơn thật. Toạ độ quân không bị bóp méo vì bản đồ đã cho thấy chúng.
- Hiệu lực tin giả (20 phút) luôn ngắn hơn cooldown của nó (30 phút): tối thiểu 10 phút mỗi chu kỳ không ai bị bịt mắt, và `espionage.test.ts` giữ khoảng cách đó.
- Mỗi mission resolve ghi một audit row `spy.<missionType>.<status>`; một scout bị bóp méo ghi thêm `spy.misinformation.consumed` kèm hệ số, vì `spy_launch.accepted` chỉ chứng minh mission được *đặt*, không nói kết quả.
- World events hiện hỗ trợ drought (harvest ×0.5), plague (mất strength/morale theo tick), earthquake (giảm một building level), và gold rush (harvest ×2); event tự hết hạn.
- World event spawn mặc định có xác suất `1/600` mỗi tick, không chồng event đang hoạt động.

- Spy report có độ chính xác, cost, duration và cooldown.
- Sabotage/misinformation luôn ghi audit event và có counter-intelligence.
- Resource node cạn dần; thiên tai, dịch bệnh và di cư mob tạo biến động vùng.
- Event không được xóa tiến trình vĩnh viễn mà không có recovery path.


## Phase 2A logistics rules

- Mỗi city mới nhận starter package một lần: 500 wood, 500 stone, 500 iron; không có passive income.
- Resource node có capacity và recovery rate server-side; harvest làm giảm remaining, tick chỉ phục hồi tối đa đến capacity.
- Harvest cần depot trong thành và mỏ nằm trong `gameRules.logistics.harvestRange` — nửa bề rộng bản đồ, xem "Bản đồ và lãnh thổ".
- Logistics dùng bảng PostgreSQL quan hệ: resource_nodes, depots, trade_routes, caravans.
- Caravan bị giới hạn bởi depot capacity và chỉ cộng throughput khi delivery hoàn tất.
- Phase 2B ambush resolution phải ghi seed vào event record để audit/replay.


### Supply và ambush

- Mỗi tick army mất 1 supply, bắt đầu từ 100; dưới 25 supply thì mất 1 strength mỗi tick.
- Caravan không hộ tống có 65% ambush success; có escort thì còn 25%.
- Ambush thành công làm mất 60% cargo nếu không escort, 25% nếu có escort; seed deterministic phải nằm trong event record.
- Economy score = min(1000, floor((wood + stone + 2 * iron) / 2)) từ throughput delivery hoàn tất.
