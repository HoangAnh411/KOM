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

- Spy report có độ chính xác, cost, duration và cooldown.
- Sabotage/misinformation luôn ghi audit event và có counter-intelligence.
- Resource node cạn dần; thiên tai, dịch bệnh và di cư mob tạo biến động vùng.
- Event không được xóa tiến trình vĩnh viễn mà không có recovery path.
