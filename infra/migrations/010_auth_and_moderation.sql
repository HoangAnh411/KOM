-- Production identity, durable sessions and moderation state.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username_normalized TEXT,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  banned_at TIMESTAMPTZ,
  banned_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE players ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE players ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS username_normalized TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_reason TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_normalized_idx ON users (username_normalized) WHERE username_normalized IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS players_user_id_idx ON players (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  access_token_hash TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  rotation_counter INTEGER NOT NULL DEFAULT 0,
  family_id UUID NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_access_hash_idx ON auth_sessions(access_token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_refresh_hash_idx ON auth_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_family_idx ON auth_sessions(family_id);

ALTER TABLE cities ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE armies ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;
ALTER TABLE caravans ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE caravans ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;
ALTER TABLE city_resources ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT false;
