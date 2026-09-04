# Migration verification

Áp dụng migration bằng runner, **không** chạy `psql -f` từng file: runner ghi
`schema_migrations` (id + sha256), mỗi file trong một transaction, có advisory lock
để hai process không chạy chồng nhau. Một database được nạp bằng `psql -f` sẽ có
schema đúng nhưng `schema_migrations` rỗng, và `db:migrate:check` báo toàn bộ là
pending — lúc đó phải chạy `db:migrate:baseline` để dọn.

```powershell
$env:DATABASE_URL = "postgres://kingdoms:kingdoms@localhost:5432/kingdoms"
npm run db:migrate         # apply mọi file chưa chạy, theo thứ tự tăng dần
npm run db:migrate:check   # exit non-zero nếu checksum lệch hoặc còn pending
```

Chi tiết runner, baseline và `test:postgres`: [`docs/OPERATIONS.md`](../../docs/OPERATIONS.md).
Migration là forward-only; backup trước khi áp dụng ở môi trường dùng chung.

## Manifest

Danh sách để đối chiếu khi review, không phải script để chạy tay.

| File | Nội dung |
|---|---|
| `001_initial.sql` | Toàn bộ schema gốc (33 bảng): `game_state`, kingdom/season/faction, city + build queue + resource, army, `battle_reports`, alliance, treaty, espionage, score, season archive, `analytics_events`, `outbox_events` |
| `002_logistics.sql` | `army_supply`, `depots`, `economy_throughput`, `logistics_commands`; mở rộng `trade_routes`/`caravans`/`resource_nodes` (toạ độ, kingdom) |
| `003_event_ledger.sql` | `event_ledger` (append-only) + `caravan_cargo` |
| `004_combat.sql` | `military_throughput`; terrain cho `map_tiles`, mở rộng `armies`/`battle_reports` |
| `005_alliance_diplomacy.sql` | `diplomacy_throughput`; mở rộng `alliances` (tag, leader), `alliance_members`, `diplomacy_treaties` |
| `006_espionage_events.sql` | `counter_intel_active`, `spy_cooldowns`; mở rộng `espionage_actions`, `world_events` |
| `007_npc_armies.sql` | `player_id` là owner chuẩn của player army; chỉ cho `NULL` khi `owner_type = 'npc'` |
| `008_season_production.sql` | season lock, index, archive metadata |
| `009_alliance_governance.sql` | vote/ballot, leader term, unique pending treaty guard |
| `010_auth_and_moderation.sql` | `users`, `auth_sessions`; cột moderation (freeze) trên player/city/army/caravan |
| `011_auth_integrity.sql` | foreign key identity, status constraint, active-session index; dọn `players.user_id` mồ côi |
| `012_outbox_worker.sql` | outbox retry/claim/dead-letter + partial index cho pending và DLQ |
| `013_web_playable_alpha.sql` | market hub (một/kingdom), NPC raider, attack pursuit, supply zone, onboarding persisted, city placement |
| `014_web_closed_alpha.sql` | partial index `battle_reports (attacker_id\|defender_id, created_at DESC, id DESC)` cho keyset pagination của `/api/battles` |
| `015_world_map_36.sql` | bốn thương cảng mỗi kingdom: bỏ unique index `market_hubs (kingdom_id)` của `013`, thay bằng index thường. Bản đồ 36×36 nằm ở code (`packages/shared/src/world-map.ts`), không có bảng nào cho nó |

`012`–`015` viết idempotent (`IF NOT EXISTS`), an toàn cả trên database mới và
database đã có `001`–`011`; điều đó **không** miễn cho việc chạy qua runner.
