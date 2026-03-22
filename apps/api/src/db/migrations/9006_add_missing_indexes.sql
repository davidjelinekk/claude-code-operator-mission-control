-- Add missing indexes identified during code audit
CREATE INDEX IF NOT EXISTS idx_tasks_board_status ON tasks (board_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_board_created ON tasks (board_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks (assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks (due_at);

CREATE INDEX IF NOT EXISTS idx_approvals_board_status ON approvals (board_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_task_status ON approvals (task_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_board_created ON approvals (board_id, created_at);

CREATE INDEX IF NOT EXISTS idx_task_deps_depends_on ON task_dependencies (depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_person_threads_person ON person_threads (person_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_board ON webhooks (board_id);
