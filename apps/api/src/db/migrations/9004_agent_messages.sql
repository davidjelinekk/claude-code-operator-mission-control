-- Agent Message Bus: inter-agent communication during sessions
CREATE TABLE agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  from_agent_id TEXT NOT NULL,
  to_agent_id TEXT NOT NULL,   -- '*' for broadcast
  content TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_messages_inbox
  ON agent_messages(board_id, to_agent_id, created_at);
CREATE INDEX idx_agent_messages_from
  ON agent_messages(board_id, from_agent_id, created_at);
