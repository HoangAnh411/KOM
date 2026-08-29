# Database và persistence

## Nguồn sự thật

PostgreSQL giữ dữ liệu bền vững. Redis chỉ giữ dữ liệu runtime có thể tái tạo như rate-limit, presence, pub/sub và job coordination.

Migration MVP nằm tại `infra/migrations/001_initial.sql`.

## Nhóm bảng

- Core: `users`, `players`, `kingdoms`, `seasons`, `factions`, `regions`, `map_tiles`.
- City/economy: `cities`, `buildings`, `city_buildings`, `city_resources`, `build_queues`, `tech_progress`.
- Logistics: `resource_nodes`, `region_resource_state`, `depots`, `trade_routes`, `caravans`, `army_supply`.
- Combat: `armies`, `battle_reports`, `military_scores`.
- Social/diplomacy: `alliances`, `alliance_members`, `diplomacy_treaties`, `diplomacy_scores`, `player_reputation`.
- Intelligence/world: `espionage_actions`, `counter_intel_defenses`, `world_events`.
- History/operations: `economy_scores`, `season_snapshots`, `season_rankings`, `legacy_records`, `analytics_events`, `admin_actions`, `outbox_events`.

## Ownership và consistency

- Player chỉ được command trên city/army/caravan thuộc player hoặc alliance permission hợp lệ.
- Queue completion, resource deduction và score event phải nằm trong cùng transaction khi chuyển sang repository production.
- `outbox_events` dùng để publish event sau khi DB commit thành công.
- `season_rankings`, `season_snapshots` và `legacy_records` là immutable sau finalization.
- Tất cả bảng runtime cần `kingdom_id` hoặc có thể truy ngược đến kingdom để shard.

## Season reset

Khi `ends_at` tới hạn:

1. Khóa gameplay commands.
2. Recalculate score từ authoritative state/event ledger.
3. Ghi rankings và snapshot.
4. Tạo legacy records.
5. Đóng season cũ và tạo season mới theo template version.
6. Reset resource, army, city progression và territory; giữ account, cosmetic và legacy.

## Migration policy

- Không sửa migration đã chạy ở môi trường dùng chung.
- Mỗi thay đổi schema dùng migration tăng dần.
- Migration cần backward-compatible với một lần deploy app.
- Mọi migration phải có rollback note và test trên PostgreSQL thật.
