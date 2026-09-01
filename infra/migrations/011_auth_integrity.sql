-- Tighten identity/session integrity after the additive auth migration.
ALTER TABLE players ALTER COLUMN user_id DROP NOT NULL;
UPDATE players p SET user_id = NULL WHERE user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.user_id);
ALTER TABLE players
  DROP CONSTRAINT IF EXISTS players_user_id_fkey;
ALTER TABLE players
  ADD CONSTRAINT players_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'banned'));
ALTER TABLE players
  DROP CONSTRAINT IF EXISTS players_status_check;
ALTER TABLE players
  ADD CONSTRAINT players_status_check CHECK (status IN ('active', 'banned'));

CREATE INDEX IF NOT EXISTS auth_sessions_player_active_idx
  ON auth_sessions(player_id, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS auth_sessions_refresh_expiry_idx
  ON auth_sessions(refresh_expires_at)
  WHERE revoked_at IS NULL;
