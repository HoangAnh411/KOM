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

## Identity quản trị và audit

Migration `016_admin_console.sql` tách identity khỏi gameplay:

- `users.role` chỉ nhận `player | admin`; dữ liệu cũ được backfill thành `player`.
- `auth_sessions.principal_type` chỉ nhận `player | admin`. Player session bắt buộc có `player_id`; admin session bắt buộc `player_id IS NULL`, nên không cần tạo player giả.
- `admin_actions.actor_id` tham chiếu `users`; nullable chỉ để giữ lịch sử từ legacy token. Mỗi row còn có `target_type`, `target_id`, `outcome`, `auth_method`, `request_id` và metadata JSON do server kiểm soát.
- Player/session query và keyset audit `(created_at,id)` có index riêng. Migration additive và tương thích dữ liệu cũ; baseline validation từ chối schema tự dựng thiếu column, constraint, index hoặc nullability bắt buộc.

Moderation và forced season finalization ghi state, revoke session, event/persistence và audit trong cùng PostgreSQL transaction. `outcome='already_applied'` ghi lại retry idempotent mà không áp hiệu ứng lần hai; legacy automation có `actor_id=NULL` và `auth_method='legacy_token'`.

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
