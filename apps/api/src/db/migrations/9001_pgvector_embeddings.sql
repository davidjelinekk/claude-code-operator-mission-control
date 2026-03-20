-- Phase 1: pgvector + embeddings table
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings (source_table, source_id);
-- Note: ivfflat index requires data to exist first. Create after initial population:
-- CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
