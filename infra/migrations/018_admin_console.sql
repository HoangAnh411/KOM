-- PostgreSQL-backed administrators, principal-bound sessions, and attributable audit history.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player';
UPDATE users SET role = 'player' WHERE role IS NULL;
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('player', 'admin'));

ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS principal_type TEXT NOT NULL DEFAULT 'player';
UPDATE auth_sessions SET principal_type = 'player' WHERE principal_type IS NULL;
ALTER TABLE auth_sessions
  ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE auth_sessions
  DROP CONSTRAINT IF EXISTS auth_sessions_principal_check;
ALTER TABLE auth_sessions
  ADD CONSTRAINT auth_sessions_principal_check CHECK (
    (principal_type = 'player' AND player_id IS NOT NULL) OR
    (principal_type = 'admin' AND player_id IS NULL)
  );

ALTER TABLE admin_actions
  ADD COLUMN IF NOT EXISTS target_type TEXT;
ALTER TABLE admin_actions
  ADD COLUMN IF NOT EXISTS target_id UUID;
ALTER TABLE admin_actions
  ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'applied';
ALTER TABLE admin_actions
  ADD COLUMN IF NOT EXISTS auth_method TEXT NOT NULL DEFAULT 'legacy_token';
ALTER TABLE admin_actions
  ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE admin_actions
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE admin_actions
  DROP CONSTRAINT IF EXISTS admin_actions_actor_id_fkey;
-- Pre-console audit rows accepted arbitrary UUID actors. They cannot be attributed to
-- a database principal, so preserve the row but make that legacy attribution explicit
-- before installing the FK.
UPDATE admin_actions a
  SET actor_id = NULL,
      auth_method = 'legacy_token',
      metadata = COALESCE(a.metadata, '{}'::jsonb) || '{"actorClearedByMigration":true}'::jsonb
  WHERE a.actor_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.actor_id);
ALTER TABLE admin_actions
  ADD CONSTRAINT admin_actions_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE admin_actions
  DROP CONSTRAINT IF EXISTS admin_actions_outcome_check;
ALTER TABLE admin_actions
  ADD CONSTRAINT admin_actions_outcome_check
  CHECK (outcome IN ('applied', 'already_applied', 'rejected'));
ALTER TABLE admin_actions
  DROP CONSTRAINT IF EXISTS admin_actions_auth_method_check;
ALTER TABLE admin_actions
  ADD CONSTRAINT admin_actions_auth_method_check
  CHECK (auth_method IN ('admin_session', 'legacy_token', 'bootstrap'));

CREATE INDEX IF NOT EXISTS users_role_status_idx
  ON users(role, status, username_normalized, id);
CREATE INDEX IF NOT EXISTS auth_sessions_principal_active_idx
  ON auth_sessions(principal_type, user_id, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS admin_actions_created_id_idx
  ON admin_actions(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_actions_target_idx
  ON admin_actions(target_type, target_id, created_at DESC);
