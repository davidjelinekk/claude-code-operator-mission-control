-- Enhancement 1: Context Tiering (L0/L1 abstracts)
ALTER TABLE ctx_entities ADD COLUMN IF NOT EXISTS abstract TEXT;
ALTER TABLE ctx_observations ADD COLUMN IF NOT EXISTS abstract TEXT;

-- Enhancement 2: Session Compression & Archival
CREATE TABLE IF NOT EXISTS session_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  agent_id TEXT,
  summary TEXT NOT NULL,
  key_decisions JSONB DEFAULT '[]'::jsonb,
  key_outcomes JSONB DEFAULT '[]'::jsonb,
  error_patterns JSONB DEFAULT '[]'::jsonb,
  token_cost TEXT,
  turn_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_archives_board ON session_archives(board_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_archives_agent ON session_archives(agent_id, created_at DESC);
