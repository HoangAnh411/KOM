ALTER TABLE alliances ADD COLUMN IF NOT EXISTS tag TEXT;
ALTER TABLE alliances ADD COLUMN IF NOT EXISTS leader_player_id UUID;
ALTER TABLE alliances ADD COLUMN IF NOT EXISTS notice TEXT;
ALTER TABLE alliances ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE alliances ADD COLUMN IF NOT EXISTS leader_term_started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE alliance_members ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS alliance_votes (
  id UUID PRIMARY KEY, alliance_id UUID NOT NULL, candidate_player_id UUID NOT NULL,
  opened_by_player_id UUID NOT NULL, status TEXT NOT NULL, opened_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alliance_one_open_vote ON alliance_votes(alliance_id) WHERE status = 'open';
CREATE TABLE IF NOT EXISTS alliance_vote_ballots (
  vote_id UUID NOT NULL, player_id UUID NOT NULL, vote BOOLEAN NOT NULL, cast_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (vote_id, player_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_treaty_one_pending_pair ON diplomacy_treaties(
  kingdom_id, LEAST(proposer_id, target_id), GREATEST(proposer_id, target_id), treaty_type
) WHERE status = 'proposed';
