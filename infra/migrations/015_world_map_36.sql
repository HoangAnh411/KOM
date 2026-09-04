-- 015: the handcrafted 36x36 world.
--
-- The map itself is not in here. It lives in code (packages/shared/src/world-map.ts) as two
-- grids of characters, because the client and the server have to resolve battles against the
-- same terrain and a shared module is the only way that cannot drift. So this migration is one
-- line of consequence: a kingdom now has four ports, one per quadrant, and 013 declared that a
-- kingdom has exactly one.
--
-- The rows derived from the map -- resource_nodes, market_hubs -- keep their shape. What changed
-- is that their primary keys are now derived from (kingdom_id, tile) instead of randomUUID(), so
-- the server's upsert converges on reseed rather than inserting a fresh copy every boot. Rows
-- whose tile is no longer an anchor are pruned by the server, not here: a database seeded
-- before the new map still holds 3 mines and 1 hub with random ids, and the prune is what
-- clears them on the next save.
--
-- Idempotent: safe on a fresh database, on any 001-014 database, and on re-run.

-- Four ports per kingdom. The old unique index would reject the second one.
DROP INDEX IF EXISTS market_hubs_one_per_kingdom_uq;
CREATE INDEX IF NOT EXISTS market_hubs_kingdom_idx ON market_hubs (kingdom_id);

-- No unique index on (kingdom_id, x, y) to replace it, deliberately. A database seeded before
-- this migration holds a port at (10,10) under a random id; the new derived-id port stands on the
-- same tile. Inserting it under a tile-unique index would abort the save transaction, and that
-- transaction is wrapped in a `console.warn` -- the game would keep running and quietly stop
-- persisting logistics. The server prunes the stale row instead, before it upserts the new one.
