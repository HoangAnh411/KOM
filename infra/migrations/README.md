# Migration verification

Run migrations in ascending order against a fresh PostgreSQL database and an existing database. Each migration is forward-only; create a database backup before applying it in shared environments.

```powershell
psql "$env:DATABASE_URL" -f infra/migrations/001_initial.sql
psql "$env:DATABASE_URL" -f infra/migrations/002_logistics.sql
psql "$env:DATABASE_URL" -f infra/migrations/003_event_ledger.sql
psql "$env:DATABASE_URL" -f infra/migrations/004_combat.sql
psql "$env:DATABASE_URL" -f infra/migrations/005_alliance_diplomacy.sql
psql "$env:DATABASE_URL" -f infra/migrations/006_espionage_events.sql
psql "$env:DATABASE_URL" -f infra/migrations/007_npc_armies.sql
psql "$env:DATABASE_URL" -f infra/migrations/008_season_production.sql
psql "$env:DATABASE_URL" -f infra/migrations/009_alliance_governance.sql
psql "$env:DATABASE_URL" -f infra/migrations/010_auth_and_moderation.sql
psql "$env:DATABASE_URL" -f infra/migrations/011_auth_integrity.sql
```

Migration 007 giữ `player_id` làm owner chuẩn cho player army và cho phép `NULL` duy nhất khi `owner_type = 'npc'`. Migration 008 thêm season lock/index/archive metadata. Migration 009 thêm vote/ballot, leader term và unique pending treaty guard. Migration 011 bổ sung foreign key identity, status constraints và active-session indexes.
