# Migration verification

Run migrations in ascending order against a fresh PostgreSQL database and an existing database. Each migration is forward-only; create a database backup before applying it in shared environments.

```powershell
psql "$env:DATABASE_URL" -f infra/migrations/001_initial.sql
psql "$env:DATABASE_URL" -f infra/migrations/002_logistics.sql
```
psql "$env:DATABASE_URL" -f infra/migrations/003_event_ledger.sql
