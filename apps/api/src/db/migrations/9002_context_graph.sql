-- Phase 2: Context Graph tables

CREATE TABLE IF NOT EXISTS ctx_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  description TEXT,
  properties JSONB,
  board_id UUID REFERENCES boards(id) ON DELETE SET NULL,
  confidence REAL DEFAULT 1.0,
  source_type TEXT NOT NULL DEFAULT 'extraction',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctx_entities_type_board ON ctx_entities (entity_type, board_id);
CREATE INDEX IF NOT EXISTS idx_ctx_entities_name ON ctx_entities (name, entity_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ctx_entities_name_type_board
  ON ctx_entities (name, entity_type, COALESCE(board_id, '00000000-0000-0000-0000-000000000000'));

CREATE TABLE IF NOT EXISTS ctx_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id UUID NOT NULL REFERENCES ctx_entities(id) ON DELETE CASCADE,
  to_entity_id UUID NOT NULL REFERENCES ctx_entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  properties JSONB,
  source_event_id UUID REFERENCES activity_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_entity_id, to_entity_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_ctx_relations_from ON ctx_relations (from_entity_id, relation_type);
CREATE INDEX IF NOT EXISTS idx_ctx_relations_to ON ctx_relations (to_entity_id, relation_type);

CREATE TABLE IF NOT EXISTS ctx_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES ctx_entities(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  observation_type TEXT DEFAULT 'fact',
  source TEXT DEFAULT 'session',
  source_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctx_observations_entity ON ctx_observations (entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ctx_extraction_watermarks (
  event_type TEXT PRIMARY KEY,
  last_event_at TIMESTAMPTZ,
  last_processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
