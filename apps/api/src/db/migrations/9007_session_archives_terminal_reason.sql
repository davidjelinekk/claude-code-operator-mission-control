-- Session Archives: add terminal_reason and provider tracking (SDK 0.2.91+, multi-provider)
-- Safe to run multiple times: uses IF NOT EXISTS

ALTER TABLE session_archives
  ADD COLUMN IF NOT EXISTS terminal_reason TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT;

CREATE INDEX IF NOT EXISTS idx_session_archives_terminal_reason
  ON session_archives (terminal_reason);
