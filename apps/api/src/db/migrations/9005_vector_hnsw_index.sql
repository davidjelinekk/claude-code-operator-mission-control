-- Create HNSW index for fast cosine similarity search on embeddings
-- Replaces the previously commented-out ivfflat index with a superior HNSW index
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
