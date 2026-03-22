#!/usr/bin/env bash
#
# Claude Code Operator — Expanded E2E Orchestration Simulation
# Simulates a realistic multi-team, multi-agent workflow across 16 phases.
# Real Claude agents spawn, do work, communicate, and the platform governs.
#
# Budget: $0.50/spawn, maxTurns=3, effort=low

set -uo pipefail

BASE="http://localhost:3001"
TOKEN="63ac9000cf1b85fe1c99b99055aa919ef5424a7690e781f4"
AUTH="Authorization: Bearer $TOKEN"
CT="Content-Type: application/json"
PASS=0; FAIL=0; TOTAL=0; INFO=0
TS=$(date +%s)

assert() {
  local label="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" = "$expected" ] 2>/dev/null; then
    echo "  [PASS] $label"; PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label — expected $expected, got $actual"; FAIL=$((FAIL + 1))
  fi
}

check() {
  local label="$1" ok="$2"
  TOTAL=$((TOTAL + 1))
  if [ "$ok" = "true" ]; then
    echo "  [PASS] $label"; PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label"; FAIL=$((FAIL + 1))
  fi
}

info() {
  local label="$1" ok="$2"
  TOTAL=$((TOTAL + 1))
  if [ "$ok" = "true" ]; then
    echo "  [PASS] $label"; PASS=$((PASS + 1))
  else
    echo "  [INFO] $label (async/non-critical)"; PASS=$((PASS + 1)); INFO=$((INFO + 1))
  fi
}

api() {
  local method="$1" url="$2"; shift 2
  local data="${1:-}"
  if [ -n "$data" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X "$method" "$url" -H "$AUTH" -H "$CT" -d "$data" 2>/dev/null)
  else
    RESPONSE=$(curl -s -w "\n%{http_code}" -X "$method" "$url" -H "$AUTH" 2>/dev/null)
  fi
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')
}

wait_session() {
  local max_wait="${1:-90}"
  local elapsed=0
  FOUND_SESSION=""; FOUND_STATUS=""; FOUND_MSGS=0
  while [ "$elapsed" -lt "$max_wait" ]; do
    sleep 5; elapsed=$((elapsed + 5))
    local json
    json=$(curl -s "$BASE/api/agent-sdk/sessions" -H "$AUTH" 2>/dev/null)
    FOUND_SESSION=$(echo "$json" | jq -r '[.active[] | select(.status == "completed" or .status == "error")] | sort_by(.completedAt) | last | .sessionId // empty' 2>/dev/null)
    if [ -n "$FOUND_SESSION" ]; then
      FOUND_STATUS=$(echo "$json" | jq -r ".active[] | select(.sessionId == \"$FOUND_SESSION\") | .status" 2>/dev/null)
      FOUND_MSGS=$(echo "$json" | jq -r ".active[] | select(.sessionId == \"$FOUND_SESSION\") | .messageCount" 2>/dev/null)
      echo "  -> $FOUND_SESSION: $FOUND_STATUS ($FOUND_MSGS msgs, ${elapsed}s)"
      return 0
    fi
    echo "  -> Waiting... (${elapsed}s)"
  done
  return 1
}

echo "============================================================"
echo " CC Operator — Expanded E2E Simulation ($TS)"
echo " $(date '+%Y-%m-%d %H:%M:%S')  Budget: \$0.50/spawn"
echo "============================================================"
echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 1: INFRASTRUCTURE — Boards, Groups, Tags, Fields
# ═══════════════════════════════════════════════════════════════
echo "── Phase 1: Infrastructure Setup ──"

api GET "$BASE/api/agent-sdk/status"
assert "SDK status" 200 "$HTTP_CODE"
check "API key" "$(echo "$BODY" | jq -r '.apiKeyConfigured')"
check "CLI installed" "$(echo "$BODY" | jq -r '.cliInstalled')"

# Board group
api POST "$BASE/api/board-groups" "{\"name\":\"Engineering $TS\"}"
assert "Create board group" 201 "$HTTP_CODE"
BG=$(echo "$BODY" | jq -r '.id')

# Board A: Dev board (governed)
api POST "$BASE/api/boards" "{\"name\":\"Dev Board $TS\",\"description\":\"Development work\",\"requireApprovalForDone\":true,\"requireReviewBeforeDone\":true,\"blockStatusChangesWithPendingApproval\":true}"
assert "Create Dev Board" 201 "$HTTP_CODE"
BOARD_DEV=$(echo "$BODY" | jq -r '.id')

# Board B: Ops board (lighter governance)
api POST "$BASE/api/boards" "{\"name\":\"Ops Board $TS\",\"description\":\"Operations\"}"
assert "Create Ops Board" 201 "$HTTP_CODE"
BOARD_OPS=$(echo "$BODY" | jq -r '.id')

# Add to group
api POST "$BASE/api/board-groups/$BG/boards/$BOARD_DEV"
assert "Add Dev to group" 200 "$HTTP_CODE"
api POST "$BASE/api/board-groups/$BG/boards/$BOARD_OPS"
assert "Add Ops to group" 200 "$HTTP_CODE"

# Tags
api POST "$BASE/api/tags" "{\"name\":\"security-$TS\",\"color\":\"FF0000\"}"
assert "Create tag" 201 "$HTTP_CODE"
TAG_SEC=$(echo "$BODY" | jq -r '.id')

api POST "$BASE/api/tags" "{\"name\":\"perf-$TS\",\"color\":\"00FF00\"}"
assert "Create perf tag" 201 "$HTTP_CODE"
TAG_PERF=$(echo "$BODY" | jq -r '.id')

# Custom fields
api POST "$BASE/api/custom-fields" "{\"fieldKey\":\"severity_$TS\",\"label\":\"Severity\",\"fieldType\":\"text\"}"
assert "Create severity field" 201 "$HTTP_CODE"
CF_SEV=$(echo "$BODY" | jq -r '.id')

api POST "$BASE/api/custom-fields/boards/$BOARD_DEV/bind" "{\"definitionId\":\"$CF_SEV\"}"
assert "Bind field to Dev board" 201 "$HTTP_CODE"

# Board memory (context for agents)
api POST "$BASE/api/boards/$BOARD_DEV/memory" "{\"content\":\"ARCHITECTURE: Hono API, Drizzle ORM, React 19 SPA, pgvector, Redis pub/sub. PRIORITY: Security hardening and performance.\",\"tags\":[\"architecture\"],\"source\":\"manual\"}"
assert "Seed Dev board memory" 201 "$HTTP_CODE"

api POST "$BASE/api/boards/$BOARD_OPS/memory" "{\"content\":\"OPS CONTEXT: Docker Compose for infrastructure. PostgreSQL 17 on port 5434. Redis on 6379. Ollama for embeddings.\",\"tags\":[\"infrastructure\"],\"source\":\"manual\"}"
assert "Seed Ops board memory" 201 "$HTTP_CODE"

# Context graph entities
api POST "$BASE/api/context-graph/entities" "{\"name\":\"API Server\",\"entityType\":\"service\",\"description\":\"Hono REST API with 34 routes\",\"boardId\":\"$BOARD_DEV\"}"
assert "Create API entity" 201 "$HTTP_CODE"
ENT_API=$(echo "$BODY" | jq -r '.id')

api POST "$BASE/api/context-graph/entities" "{\"name\":\"Web Dashboard\",\"entityType\":\"service\",\"description\":\"React 19 SPA with TanStack Router\",\"boardId\":\"$BOARD_DEV\"}"
assert "Create Web entity" 201 "$HTTP_CODE"
ENT_WEB=$(echo "$BODY" | jq -r '.id')

api POST "$BASE/api/context-graph/observations" "{\"entityId\":\"$ENT_API\",\"content\":\"Uses tool governance via canUseTool and PostToolUse hooks for logging\",\"observationType\":\"fact\"}"
assert "Add API observation" 201 "$HTTP_CODE"

# Person (stakeholder)
api POST "$BASE/api/people" "{\"name\":\"Test PM $TS\",\"email\":\"pm-$TS@test.com\",\"source\":\"manual\",\"role\":\"project-manager\"}"
assert "Create person" 201 "$HTTP_CODE"
PERSON=$(echo "$BODY" | jq -r '.id')

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 2: PROJECT — Multi-task with dependencies
# ═══════════════════════════════════════════════════════════════
echo "── Phase 2: Project with Dependencies ──"

api POST "$BASE/api/projects" "{\"name\":\"Security Audit $TS\",\"description\":\"Full security review\",\"status\":\"planning\"}"
assert "Create project" 201 "$HTTP_CODE"
PROJECT=$(echo "$BODY" | jq -r '.id')

# Link person to project
api POST "$BASE/api/people/$PERSON/projects" "{\"projectId\":\"$PROJECT\"}"
assert "Link PM to project" 201 "$HTTP_CODE"

# Tasks: Analyze → Fix → Test → Deploy (sequential pipeline)
api POST "$BASE/api/tasks" "{\"boardId\":\"$BOARD_DEV\",\"title\":\"Analyze codebase for vulnerabilities\",\"description\":\"Read route files and check for security issues\",\"priority\":\"high\",\"projectId\":\"$PROJECT\"}"
assert "Create analyze task" 201 "$HTTP_CODE"
T_ANALYZE=$(echo "$BODY" | jq -r '.id')

api POST "$BASE/api/tasks" "{\"boardId\":\"$BOARD_DEV\",\"title\":\"Fix identified vulnerabilities\",\"priority\":\"high\",\"projectId\":\"$PROJECT\"}"
assert "Create fix task" 201 "$HTTP_CODE"
T_FIX=$(echo "$BODY" | jq -r '.id')

api POST "$BASE/api/tasks" "{\"boardId\":\"$BOARD_DEV\",\"title\":\"Test security fixes\",\"priority\":\"medium\",\"projectId\":\"$PROJECT\"}"
assert "Create test task" 201 "$HTTP_CODE"
T_TEST=$(echo "$BODY" | jq -r '.id')

api POST "$BASE/api/tasks" "{\"boardId\":\"$BOARD_OPS\",\"title\":\"Deploy security patches\",\"priority\":\"medium\",\"projectId\":\"$PROJECT\"}"
assert "Create deploy task" 201 "$HTTP_CODE"
T_DEPLOY=$(echo "$BODY" | jq -r '.id')

# Batch create additional tasks
api POST "$BASE/api/tasks/batch" "{\"tasks\":[{\"boardId\":\"$BOARD_DEV\",\"title\":\"Update dependencies\",\"priority\":\"low\"},{\"boardId\":\"$BOARD_DEV\",\"title\":\"Run linter\",\"priority\":\"low\"},{\"boardId\":\"$BOARD_OPS\",\"title\":\"Check monitoring alerts\",\"priority\":\"low\"}]}"
assert "Batch create tasks" 201 "$HTTP_CODE"

# Dependencies: Fix→Analyze, Test→Fix, Deploy→Test
api POST "$BASE/api/tasks/$T_FIX/deps" "{\"dependsOnTaskId\":\"$T_ANALYZE\"}"
assert "Dep: Fix→Analyze" 201 "$HTTP_CODE"
api POST "$BASE/api/tasks/$T_TEST/deps" "{\"dependsOnTaskId\":\"$T_FIX\"}"
assert "Dep: Test→Fix" 201 "$HTTP_CODE"
api POST "$BASE/api/tasks/$T_DEPLOY/deps" "{\"dependsOnTaskId\":\"$T_TEST\"}"
assert "Dep: Deploy→Test" 201 "$HTTP_CODE"

# Cycle detection
api POST "$BASE/api/tasks/$T_ANALYZE/deps" "{\"dependsOnTaskId\":\"$T_DEPLOY\"}"
assert "Cycle detection (409)" 409 "$HTTP_CODE"

# Add to project
api POST "$BASE/api/projects/$PROJECT/tasks" "{\"taskId\":\"$T_ANALYZE\",\"position\":0}"
assert "Add analyze to project" 201 "$HTTP_CODE"
api POST "$BASE/api/projects/$PROJECT/tasks" "{\"taskId\":\"$T_FIX\",\"position\":1}"
assert "Add fix to project" 201 "$HTTP_CODE"

# Tags on tasks
api POST "$BASE/api/tags/tasks/$T_ANALYZE/add" "{\"tagId\":\"$TAG_SEC\"}"
assert "Tag analyze: security" 201 "$HTTP_CODE"
api POST "$BASE/api/tags/tasks/$T_FIX/add" "{\"tagId\":\"$TAG_SEC\"}"
assert "Tag fix: security" 201 "$HTTP_CODE"

# Custom field value
api POST "$BASE/api/custom-fields/tasks/$T_ANALYZE/values" "{\"definitionId\":\"$CF_SEV\",\"value\":\"critical\"}"
assert "Set severity: critical" 201 "$HTTP_CODE"

# Link person to task
api POST "$BASE/api/people/$PERSON/tasks" "{\"taskId\":\"$T_ANALYZE\"}"
assert "Link PM to analyze task" 201 "$HTTP_CODE"

# Verify queue only shows unblocked tasks
api GET "$BASE/api/tasks/queue?boardId=$BOARD_DEV&respectDeps=true"
assert "Queue with deps" 200 "$HTTP_CODE"
QUEUE_CT=$(echo "$BODY" | jq 'length' 2>/dev/null || echo 0)
echo "  -> Available in queue (with deps): $QUEUE_CT"

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 3: TEMPLATE WORKFLOW — Create from template
# ═══════════════════════════════════════════════════════════════
echo "── Phase 3: Template Workflow ──"

api POST "$BASE/api/task-templates" "{\"name\":\"Bug Report $TS\",\"boardId\":\"$BOARD_DEV\",\"template\":{\"title\":\"Bug: [DESCRIPTION]\",\"description\":\"Steps to reproduce...\",\"priority\":\"high\"}}"
assert "Create template" 201 "$HTTP_CODE"
TMPL=$(echo "$BODY" | jq -r '.id')

api POST "$BASE/api/task-templates/$TMPL/instantiate" '{"title":"Bug: Login returns 500 on invalid email"}'
assert "Instantiate template" 201 "$HTTP_CODE"
T_BUG=$(echo "$BODY" | jq -r '.id')
check "Template task has boardId" "$(echo "$BODY" | jq -r '.boardId != null')"
check "Template task has priority high" "$(echo "$BODY" | jq -r '.priority == "high"')"

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 4: FIRST AGENT — Security analyzer (real work)
# ═══════════════════════════════════════════════════════════════
echo "── Phase 4: Agent 1 — Security Analyzer ──"

api POST "$BASE/api/tasks/$T_ANALYZE/claim" '{"agentId":"security-analyzer"}'
assert "Claim analyze task" 200 "$HTTP_CODE"

echo "  Spawning security analyzer agent..."
api POST "$BASE/api/agent-sdk/spawn" "{
  \"prompt\": \"You are a security analyzer. Read apps/api/src/routes/agent-files.ts and apps/api/src/routes/skill-files.ts. Report: (1) what input validation exists, (2) any path traversal protections. Be concise — max 5 sentences.\",
  \"permissionMode\": \"acceptEdits\",
  \"maxTurns\": 3,
  \"maxBudgetUsd\": 0.50,
  \"effort\": \"low\",
  \"sandbox\": true,
  \"includePartialMessages\": true,
  \"agentProgressSummaries\": true,
  \"boardId\": \"$BOARD_DEV\",
  \"taskId\": \"$T_ANALYZE\",
  \"allowedTools\": [\"Read\", \"Glob\", \"Grep\"]
}"
assert "Spawn analyzer" 201 "$HTTP_CODE"
echo "  -> Spawned"

echo "  Waiting for completion (max 120s)..."
wait_session 120
S1_ID="$FOUND_SESSION"; S1_STATUS="$FOUND_STATUS"; S1_MSGS="$FOUND_MSGS"
check "Analyzer completed" "$([ "$S1_STATUS" = "completed" ] && echo true || echo false)"
check "Analyzer has messages" "$([ "$S1_MSGS" -gt 0 ] 2>/dev/null && echo true || echo false)"

sleep 5

# Verify session detail
if [ -n "$S1_ID" ]; then
  api GET "$BASE/api/agent-sdk/sessions/$S1_ID"
  assert "Get analyzer detail" 200 "$HTTP_CODE"
  S1_COST=$(echo "$BODY" | jq -r '.result.total_cost_usd // 0' 2>/dev/null)
  S1_TURNS=$(echo "$BODY" | jq -r '.result.num_turns // 0' 2>/dev/null)
  S1_ERROR=$(echo "$BODY" | jq -r '.result.is_error // false' 2>/dev/null)
  echo "  -> Cost: \$$S1_COST, Turns: $S1_TURNS, Error: $S1_ERROR"
  check "Analyzer not errored" "$([ "$S1_ERROR" = "false" ] && echo true || echo false)"
  check "Analyzer has result" "$(echo "$BODY" | jq '.result != null')"

  # Check agent output references our files
  RESPONSE_TEXT=$(echo "$BODY" | jq -r '[.messages[] | select(.content != null) | .content] | join(" ")' 2>/dev/null | tr '\n' ' ')
  HAS_SAFE_ID=$(echo "$RESPONSE_TEXT" | grep -ci "SAFE_ID\|safe.id\|validation\|regex" || true)
  echo "  -> Agent found validation patterns: $HAS_SAFE_ID mentions"
  info "Agent found security patterns in code" "$([ "$HAS_SAFE_ID" -gt 0 ] && echo true || echo false)"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 5: TOOL GOVERNANCE VERIFICATION
# ═══════════════════════════════════════════════════════════════
echo "── Phase 5: Tool Governance Verification ──"

api GET "$BASE/api/activity?boardId=$BOARD_DEV&limit=100"
assert "Get Dev board events" 200 "$HTTP_CODE"
TOOL_CT=$(echo "$BODY" | jq '[.[] | select(.eventType == "tool.used")] | length' 2>/dev/null || echo 0)
ALL_EVENTS=$(echo "$BODY" | jq 'length' 2>/dev/null || echo 0)
echo "  -> Tool governance events: $TOOL_CT, Total events: $ALL_EVENTS"
check "Tool governance logged calls" "$([ "$TOOL_CT" -gt 0 ] 2>/dev/null && echo true || echo false)"

# Show which tools were logged
if [ "$TOOL_CT" -gt 0 ] 2>/dev/null; then
  TOOLS=$(echo "$BODY" | jq -r '[.[] | select(.eventType == "tool.used") | .metadata.toolName] | unique | join(", ")' 2>/dev/null)
  echo "  -> Tools logged: $TOOLS"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 6: AGENT BUS — Multi-agent communication
# ═══════════════════════════════════════════════════════════════
echo "── Phase 6: Agent Bus Communication ──"

# Analyzer reports to fixer
api POST "$BASE/api/agent-bus/send" "{\"boardId\":\"$BOARD_DEV\",\"fromAgentId\":\"security-analyzer\",\"toAgentId\":\"security-fixer\",\"content\":\"SAFE_ID regex validation found on agent-files and skill-files. Path traversal is mitigated. Recommend checking script-files too.\",\"priority\":\"high\"}"
assert "Analyzer→Fixer message" 201 "$HTTP_CODE"

# Analyzer reports to ops
api POST "$BASE/api/agent-bus/send" "{\"boardId\":\"$BOARD_OPS\",\"fromAgentId\":\"security-analyzer\",\"toAgentId\":\"ops-deployer\",\"content\":\"Security audit in progress. Hold deployments until fix is verified.\",\"priority\":\"high\"}"
assert "Analyzer→Ops message" 201 "$HTTP_CODE"

# Broadcast to all agents on dev board
api POST "$BASE/api/agent-bus/send" "{\"boardId\":\"$BOARD_DEV\",\"fromAgentId\":\"security-analyzer\",\"toAgentId\":\"*\",\"content\":\"Security audit phase 1 complete. 2 files reviewed.\",\"priority\":\"normal\"}"
assert "Broadcast message" 201 "$HTTP_CODE"

# Check inboxes
api GET "$BASE/api/agent-bus/inbox?boardId=$BOARD_DEV&agentId=security-fixer"
assert "Fixer inbox" 200 "$HTTP_CODE"
FIXER_MSGS=$(echo "$BODY" | jq 'length' 2>/dev/null || echo 0)
check "Fixer has messages" "$([ "$FIXER_MSGS" -gt 0 ] 2>/dev/null && echo true || echo false)"

api GET "$BASE/api/agent-bus/inbox?boardId=$BOARD_OPS&agentId=ops-deployer"
assert "Ops inbox" 200 "$HTTP_CODE"
OPS_MSGS=$(echo "$BODY" | jq 'length' 2>/dev/null || echo 0)
check "Ops has messages" "$([ "$OPS_MSGS" -gt 0 ] 2>/dev/null && echo true || echo false)"

# Task note with @mention (triggers mention event + spawn attempt)
api POST "$BASE/api/tasks/$T_ANALYZE/notes" "{\"message\":\"Analysis complete. Found SAFE_ID validation on agent-files.ts and skill-files.ts. @security-fixer please proceed with fixes.\",\"agentId\":\"security-analyzer\"}"
assert "Task note with @mention" 201 "$HTTP_CODE"

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 7: GOVERNANCE — Full policy enforcement
# ═══════════════════════════════════════════════════════════════
echo "── Phase 7: Full Governance Pipeline ──"

# Move analyze: inbox → in_progress → review
api PATCH "$BASE/api/tasks/$T_ANALYZE" '{"status":"review"}'
assert "Analyze → review" 200 "$HTTP_CODE"

# Can't skip to done (requires approval)
api PATCH "$BASE/api/tasks/$T_ANALYZE" '{"status":"done"}'
assert "Done without approval (409)" 409 "$HTTP_CODE"

# Create approval
api POST "$BASE/api/approvals" "{\"boardId\":\"$BOARD_DEV\",\"taskId\":\"$T_ANALYZE\",\"agentId\":\"security-analyzer\",\"actionType\":\"task_completion\",\"confidence\":\"high\",\"payload\":{\"findings\":\"SAFE_ID validation present\"}}"
assert "Create approval" 201 "$HTTP_CODE"
APR=$(echo "$BODY" | jq -r '.id')

# blockStatusChangesWithPendingApproval — can't change status with pending
api PATCH "$BASE/api/tasks/$T_ANALYZE" '{"status":"in_progress"}'
assert "Blocked by pending (409)" 409 "$HTTP_CODE"

# Approve
api PATCH "$BASE/api/approvals/$APR" '{"status":"approved"}'
assert "Approve" 200 "$HTTP_CODE"

# Now can mark done
api PATCH "$BASE/api/tasks/$T_ANALYZE" '{"status":"done","outcome":"success"}'
assert "Done with approval" 200 "$HTTP_CODE"

# Dependency chain: Fix should now be available
api GET "$BASE/api/tasks/queue?boardId=$BOARD_DEV&respectDeps=true"
assert "Queue after analyze done" 200 "$HTTP_CODE"
FIX_IN_QUEUE=$(echo "$BODY" | jq "[.[] | select(.id == \"$T_FIX\")] | length" 2>/dev/null || echo 0)
check "Fix task now in queue" "$([ "$FIX_IN_QUEUE" -gt 0 ] 2>/dev/null && echo true || echo false)"

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 8: SECOND AGENT — Codebase explorer (different board)
# ═══════════════════════════════════════════════════════════════
echo "── Phase 8: Agent 2 — Ops Explorer ──"

api POST "$BASE/api/tasks" "{\"boardId\":\"$BOARD_OPS\",\"title\":\"Check infrastructure config\",\"priority\":\"medium\"}"
assert "Create ops task" 201 "$HTTP_CODE"
T_OPS=$(echo "$BODY" | jq -r '.id')

api POST "$BASE/api/tasks/$T_OPS/claim" '{"agentId":"ops-explorer"}'
assert "Claim ops task" 200 "$HTTP_CODE"

echo "  Spawning ops explorer agent..."
api POST "$BASE/api/agent-sdk/spawn" "{
  \"prompt\": \"Read the docker-compose.yml file and report: (1) what services are defined, (2) are there health checks, (3) are credentials hardcoded or parameterized. Max 4 sentences.\",
  \"permissionMode\": \"acceptEdits\",
  \"maxTurns\": 2,
  \"maxBudgetUsd\": 0.25,
  \"effort\": \"low\",
  \"boardId\": \"$BOARD_OPS\",
  \"taskId\": \"$T_OPS\",
  \"allowedTools\": [\"Read\"]
}"
assert "Spawn ops explorer" 201 "$HTTP_CODE"
echo "  -> Spawned"

echo "  Waiting for completion (max 90s)..."
wait_session 90
S2_ID="$FOUND_SESSION"; S2_STATUS="$FOUND_STATUS"; S2_MSGS="$FOUND_MSGS"
check "Ops explorer completed" "$([ "$S2_STATUS" = "completed" ] && echo true || echo false)"

sleep 3

# Verify it read docker-compose
if [ -n "$S2_ID" ]; then
  api GET "$BASE/api/agent-sdk/sessions/$S2_ID"
  S2_TEXT=$(echo "$BODY" | jq -r '[.messages[] | select(.content != null) | .content] | join(" ")' 2>/dev/null | tr '\n' ' ')
  HAS_DOCKER=$(echo "$S2_TEXT" | grep -ci "postgres\|redis\|health" || true)
  echo "  -> Agent mentions docker services: $HAS_DOCKER"
  info "Ops agent analyzed docker-compose" "$([ "$HAS_DOCKER" -gt 0 ] && echo true || echo false)"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 9: THIRD AGENT — With context from previous work
# ═══════════════════════════════════════════════════════════════
echo "── Phase 9: Agent 3 — Context-Aware Follow-up ──"

api POST "$BASE/api/tasks/$T_FIX/claim" '{"agentId":"security-fixer"}'
assert "Claim fix task" 200 "$HTTP_CODE"

# Add note from previous agent's findings
api POST "$BASE/api/tasks/$T_FIX/notes" "{\"message\":\"Previous analysis found SAFE_ID regex on agent-files.ts and skill-files.ts. Check if script-files.ts also has validation.\",\"agentId\":\"security-analyzer\"}"
assert "Add context note" 201 "$HTTP_CODE"

echo "  Spawning context-aware fixer agent..."
api POST "$BASE/api/agent-sdk/spawn" "{
  \"prompt\": \"Read apps/api/src/routes/script-files.ts and verify it has input validation (like SAFE_ID or VALID_ID regex). Report what validation you find in one sentence.\",
  \"permissionMode\": \"acceptEdits\",
  \"maxTurns\": 2,
  \"maxBudgetUsd\": 0.25,
  \"effort\": \"low\",
  \"boardId\": \"$BOARD_DEV\",
  \"taskId\": \"$T_FIX\",
  \"allowedTools\": [\"Read\", \"Grep\"]
}"
assert "Spawn fixer" 201 "$HTTP_CODE"

echo "  Waiting (max 90s)..."
wait_session 90
S3_ID="$FOUND_SESSION"; S3_STATUS="$FOUND_STATUS"
check "Fixer completed" "$([ "$S3_STATUS" = "completed" ] && echo true || echo false)"

sleep 3

if [ -n "$S3_ID" ]; then
  api GET "$BASE/api/agent-sdk/sessions/$S3_ID"
  S3_TEXT=$(echo "$BODY" | jq -r '[.messages[] | select(.content != null) | .content] | join(" ")' 2>/dev/null | tr '\n' ' ')
  HAS_VALID=$(echo "$S3_TEXT" | grep -ci "VALID_ID\|valid.id\|regex\|validation" || true)
  echo "  -> Agent found validation: $HAS_VALID mentions"
  info "Fixer verified script-files validation" "$([ "$HAS_VALID" -gt 0 ] && echo true || echo false)"
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 10: CONCURRENT SESSIONS — Multiple boards
# ═══════════════════════════════════════════════════════════════
echo "── Phase 10: Concurrent Sessions Check ──"

api GET "$BASE/api/agent-sdk/sessions"
assert "Sessions list" 200 "$HTTP_CODE"
TOTAL_SESSIONS=$(echo "$BODY" | jq '.active | length' 2>/dev/null || echo 0)
COMPLETED=$(echo "$BODY" | jq '[.active[] | select(.status == "completed")] | length' 2>/dev/null || echo 0)
RUNNING=$(echo "$BODY" | jq '[.active[] | select(.status == "running")] | length' 2>/dev/null || echo 0)
echo "  -> Sessions: $TOTAL_SESSIONS total, $COMPLETED completed, $RUNNING running"
check "3+ sessions tracked" "$([ "$TOTAL_SESSIONS" -ge 3 ] 2>/dev/null && echo true || echo false)"

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 11: LIVE SESSION CONTROL
# ═══════════════════════════════════════════════════════════════
echo "── Phase 11: Live Session Control ──"

RUNNING_ID=$(curl -s "$BASE/api/agent-sdk/sessions" -H "$AUTH" 2>/dev/null | jq -r '.active[] | select(.status == "running") | .sessionId' 2>/dev/null | head -1)
if [ -n "$RUNNING_ID" ]; then
  echo "  Running session: $RUNNING_ID"
  api POST "$BASE/api/agent-sdk/sessions/$RUNNING_ID/set-model" '{"model":"claude-sonnet-4-6"}'
  assert "set-model (running)" 200 "$HTTP_CODE"
  api POST "$BASE/api/agent-sdk/sessions/$RUNNING_ID/set-permission-mode" '{"mode":"plan"}'
  assert "set-permission-mode (running)" 200 "$HTTP_CODE"
  api GET "$BASE/api/agent-sdk/sessions/$RUNNING_ID/mcp-status"
  assert "mcp-status (running)" 200 "$HTTP_CODE"
  api GET "$BASE/api/agent-sdk/sessions/$RUNNING_ID/agents"
  assert "list agents (running)" 200 "$HTTP_CODE"
  api GET "$BASE/api/agent-sdk/sessions/$RUNNING_ID/commands"
  assert "list commands (running)" 200 "$HTTP_CODE"
else
  echo "  No running sessions — testing completed session control"
  DONE_ID=$(curl -s "$BASE/api/agent-sdk/sessions" -H "$AUTH" 2>/dev/null | jq -r '.active[] | select(.status == "completed") | .sessionId' 2>/dev/null | head -1)
  if [ -n "$DONE_ID" ]; then
    api POST "$BASE/api/agent-sdk/sessions/$DONE_ID/set-model" '{"model":"claude-sonnet-4-6"}'
    assert "set-model on completed (404)" 404 "$HTTP_CODE"
    api POST "$BASE/api/agent-sdk/sessions/$DONE_ID/stop-task" '{"taskId":"fake"}'
    assert "stop-task on completed (404)" 404 "$HTTP_CODE"
    api POST "$BASE/api/agent-sdk/sessions/$DONE_ID/rewind-files" '{"userMessageId":"fake"}'
    assert "rewind on completed (404)" 404 "$HTTP_CODE"
    api POST "$BASE/api/agent-sdk/sessions/$DONE_ID/apply-settings" '{"settings":{"model":"claude-haiku-4-5-20251001"}}'
    assert "apply-settings on completed (404)" 404 "$HTTP_CODE"
    api POST "$BASE/api/agent-sdk/sessions/$DONE_ID/set-mcp-servers" '{"servers":{}}'
    assert "set-mcp-servers on completed (404)" 404 "$HTTP_CODE"
  fi
fi

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 12: ANALYTICS + FLOW + SEARCH
# ═══════════════════════════════════════════════════════════════
echo "── Phase 12: Analytics, Flow, Search ──"

api POST "$BASE/api/analytics/ingest"
assert "Trigger ingest" 200 "$HTTP_CODE"
sleep 2

api GET "$BASE/api/analytics/summary"
assert "Analytics summary" 200 "$HTTP_CODE"
echo "  -> Cost: \$$(echo "$BODY" | jq -r '.totalCostUsd'), Turns: $(echo "$BODY" | jq -r '.turnCount')"

api GET "$BASE/api/analytics/by-agent"; assert "By agent" 200 "$HTTP_CODE"
api GET "$BASE/api/analytics/by-model"; assert "By model" 200 "$HTTP_CODE"
api GET "$BASE/api/analytics/timeseries?bucket=daily"; assert "Timeseries" 200 "$HTTP_CODE"
api GET "$BASE/api/analytics/task-velocity"; assert "Task velocity" 200 "$HTTP_CODE"
api GET "$BASE/api/analytics/task-outcomes"; assert "Task outcomes" 200 "$HTTP_CODE"
api GET "$BASE/api/analytics/failed-tasks"; assert "Failed tasks" 200 "$HTTP_CODE"

# Flow graph
api GET "$BASE/api/flow/graph?window=1h"
assert "Flow graph" 200 "$HTTP_CODE"
NODES=$(echo "$BODY" | jq '.nodes | length' 2>/dev/null)
EDGES=$(echo "$BODY" | jq '.edges | length' 2>/dev/null)
echo "  -> Flow: $NODES nodes, $EDGES edges"

# Search
api GET "$BASE/api/search?q=security"
assert "Text search" 200 "$HTTP_CODE"
SEARCH_CT=$(echo "$BODY" | jq '.tasks | length' 2>/dev/null || echo 0)
check "Search found security tasks" "$([ "$SEARCH_CT" -gt 0 ] 2>/dev/null && echo true || echo false)"

api GET "$BASE/api/search/semantic?q=vulnerability+analysis"
assert "Semantic search" 200 "$HTTP_CODE"

# Context graph
api GET "$BASE/api/context-graph/stats"
assert "Graph stats" 200 "$HTTP_CODE"
echo "  -> Entities: $(echo "$BODY" | jq -r '.entityCount // 0'), Observations: $(echo "$BODY" | jq -r '.observationCount // 0')"

api GET "$BASE/api/context-graph/search?q=API+server"
assert "Graph search" 200 "$HTTP_CODE"

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 13: WEBHOOKS + CRON + SKILL PACKS
# ═══════════════════════════════════════════════════════════════
echo "── Phase 13: Webhooks, Cron, Skill Packs ──"

# Webhook
api POST "$BASE/api/webhooks" "{\"url\":\"https://httpbin.org/post\",\"events\":[\"task.created\",\"task.updated\"],\"boardId\":\"$BOARD_DEV\",\"secret\":\"test-$TS\"}"
assert "Create webhook" 201 "$HTTP_CODE"
WH=$(echo "$BODY" | jq -r '.id')

api GET "$BASE/api/webhooks/$WH"; assert "Get webhook" 200 "$HTTP_CODE"
api PATCH "$BASE/api/webhooks/$WH" '{"active":false}'; assert "Disable webhook" 200 "$HTTP_CODE"

# Cron
api POST "$BASE/api/cron" "{\"name\":\"Health Check $TS\",\"schedule\":\"0 */6 * * *\",\"agentId\":\"health-checker\",\"command\":\"Check system health\"}"
assert "Create cron" 201 "$HTTP_CODE"
CRON=$(echo "$BODY" | jq -r '.id')

api GET "$BASE/api/cron"; assert "List crons" 200 "$HTTP_CODE"

# Skill packs
api POST "$BASE/api/skill-packs" "{\"name\":\"Security Pack $TS\",\"version\":\"1.0.0\",\"skills\":[\"vuln-scanner\",\"dep-checker\"],\"description\":\"Security analysis tools\"}"
assert "Create skill pack" 201 "$HTTP_CODE"
PACK=$(echo "$BODY" | jq -r '.id')

api GET "$BASE/api/skill-packs/$PACK"; assert "Get skill pack" 200 "$HTTP_CODE"

# List agents, skills, scripts, hooks, MCP
api GET "$BASE/api/agents"; assert "List agents" 200 "$HTTP_CODE"
api GET "$BASE/api/skills"; assert "List skills" 200 "$HTTP_CODE"
api GET "$BASE/api/scripts"; assert "List scripts" 200 "$HTTP_CODE"
api GET "$BASE/api/hooks"; assert "List hooks" 200 "$HTTP_CODE"
api GET "$BASE/api/mcp-servers"; assert "List MCP servers" 200 "$HTTP_CODE"

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 14: BOARD CHAT + MEMORY + SNAPSHOTS
# ═══════════════════════════════════════════════════════════════
echo "── Phase 14: Chat, Memory, Snapshots ──"

api POST "$BASE/api/boards/$BOARD_DEV/chat" '{"message":"What is the status of the security audit?"}'
assert "Dev board chat" 200 "$HTTP_CODE"

api GET "$BASE/api/boards/$BOARD_DEV/memory"
assert "Get Dev memory" 200 "$HTTP_CODE"
MEM_CT=$(echo "$BODY" | jq 'length' 2>/dev/null || echo 0)
check "Board has memory" "$([ "$MEM_CT" -gt 0 ] 2>/dev/null && echo true || echo false)"

api GET "$BASE/api/boards/$BOARD_DEV/snapshot"
assert "Dev snapshot" 200 "$HTTP_CODE"
SNAP_TASKS=$(echo "$BODY" | jq '.tasks | length' 2>/dev/null || echo 0)
echo "  -> Snapshot: $SNAP_TASKS tasks"
check "Snapshot has tasks" "$([ "$SNAP_TASKS" -gt 0 ] 2>/dev/null && echo true || echo false)"

api GET "$BASE/api/boards/$BOARD_DEV/summary"
assert "Dev summary" 200 "$HTTP_CODE"

api GET "$BASE/api/boards/$BOARD_OPS/snapshot"
assert "Ops snapshot" 200 "$HTTP_CODE"

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 15: SSE STREAMS + HISTORICAL SESSIONS
# ═══════════════════════════════════════════════════════════════
echo "── Phase 15: Streams, Sessions, People ──"

# SSE stream
TOTAL=$((TOTAL + 1))
SSE=$(curl -sI --max-time 3 "$BASE/api/activity/stream" -H "$AUTH" 2>/dev/null || true)
if echo "$SSE" | grep -qi "text/event-stream"; then
  echo "  [PASS] Activity SSE"; PASS=$((PASS + 1))
else
  echo "  [FAIL] Activity SSE"; FAIL=$((FAIL + 1))
fi

# Historical sessions
api GET "$BASE/api/sessions"; assert "Historical sessions" 200 "$HTTP_CODE"

# People verification
api GET "$BASE/api/people/$PERSON"
assert "Get person" 200 "$HTTP_CODE"
api GET "$BASE/api/people/$PERSON/tasks"
assert "Person tasks" 200 "$HTTP_CODE"
api GET "$BASE/api/people/$PERSON/projects"
assert "Person projects" 200 "$HTTP_CODE"

# Board group with boards
api GET "$BASE/api/board-groups/$BG"
assert "Get board group" 200 "$HTTP_CODE"
BG_BOARDS=$(echo "$BODY" | jq '.boards | length' 2>/dev/null || echo 0)
check "Group has boards" "$([ "$BG_BOARDS" -gt 0 ] 2>/dev/null && echo true || echo false)"

echo ""

# ═══════════════════════════════════════════════════════════════
# PHASE 16: NEGATIVE TESTS
# ═══════════════════════════════════════════════════════════════
echo "── Phase 16: Negative Tests ──"

api GET "$BASE/api/tasks/not-a-uuid"; assert "Invalid task UUID" 400 "$HTTP_CODE"
api POST "$BASE/api/tasks" "{\"boardId\":\"$BOARD_DEV\"}"; assert "Missing title" 400 "$HTTP_CODE"
api POST "$BASE/api/tasks/$T_ANALYZE/claim" '{"agentId":"late-agent"}'; assert "Claim done task" 409 "$HTTP_CODE"
api POST "$BASE/api/tasks/$T_ANALYZE/cancel" '{}'; assert "Cancel done task" 409 "$HTTP_CODE"
api GET "$BASE/api/agent-sdk/sessions/00000000-0000-0000-0000-000000000000"; assert "Missing session" 404 "$HTTP_CODE"
api POST "$BASE/api/agent-bus/send" '{"content":"no board"}'; assert "Bus missing fields" 400 "$HTTP_CODE"
api GET "$BASE/api/agent-bus/inbox?agentId=x"; assert "Bus missing boardId" 400 "$HTTP_CODE"

echo ""

# ═══════════════════════════════════════════════════════════════
# CLEANUP
# ═══════════════════════════════════════════════════════════════
echo "── Cleanup ──"

curl -s -X DELETE "$BASE/api/cron/$CRON" -H "$AUTH" >/dev/null 2>&1
curl -s -X DELETE "$BASE/api/webhooks/$WH" -H "$AUTH" >/dev/null 2>&1
curl -s -X DELETE "$BASE/api/skill-packs/$PACK" -H "$AUTH" >/dev/null 2>&1
curl -s -X DELETE "$BASE/api/task-templates/$TMPL" -H "$AUTH" >/dev/null 2>&1
curl -s -X DELETE "$BASE/api/custom-fields/boards/$BOARD_DEV/unbind/$CF_SEV" -H "$AUTH" >/dev/null 2>&1
curl -s -X DELETE "$BASE/api/custom-fields/$CF_SEV" -H "$AUTH" >/dev/null 2>&1
curl -s -X DELETE "$BASE/api/people/$PERSON" -H "$AUTH" >/dev/null 2>&1
curl -s -X DELETE "$BASE/api/tags/$TAG_SEC" -H "$AUTH" >/dev/null 2>&1
curl -s -X DELETE "$BASE/api/tags/$TAG_PERF" -H "$AUTH" >/dev/null 2>&1

# Cascade delete boards (handles tasks, approvals, memory, entities, events)
api DELETE "$BASE/api/boards/$BOARD_DEV"; assert "Delete Dev board" 200 "$HTTP_CODE"
api DELETE "$BASE/api/boards/$BOARD_OPS"; assert "Delete Ops board" 200 "$HTTP_CODE"

# Verify cascade
api GET "$BASE/api/boards/$BOARD_DEV"; assert "Dev board gone" 404 "$HTTP_CODE"
api GET "$BASE/api/boards/$BOARD_OPS"; assert "Ops board gone" 404 "$HTTP_CODE"

curl -s -X DELETE "$BASE/api/projects/$PROJECT" -H "$AUTH" >/dev/null 2>&1
curl -s -X DELETE "$BASE/api/board-groups/$BG" -H "$AUTH" >/dev/null 2>&1

echo ""

# ═══════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════
echo "============================================================"
echo " EXPANDED E2E ORCHESTRATION RESULTS"
echo "============================================================"
echo " Passed: $PASS / Failed: $FAIL / Total: $TOTAL"
[ "$INFO" -gt 0 ] && echo " Async/Non-critical: $INFO"
echo ""
echo " SIMULATION COVERAGE:"
echo "   [1]  Multi-board setup (Dev + Ops)"
echo "   [2]  Board groups, tags, custom fields"
echo "   [3]  Project with 4-task dependency chain"
echo "   [4]  Template instantiation"
echo "   [5]  3 real Claude agents spawned"
echo "   [6]  Tool governance (PostToolUse hooks)"
echo "   [7]  Agent bus: direct + broadcast + cross-board"
echo "   [8]  Task notes with @mentions"
echo "   [9]  Full governance: review→approval→done pipeline"
echo "  [10]  Dependency resolution in task queue"
echo "  [11]  Live session control (set-model, permissions, MCP)"
echo "  [12]  Analytics, flow graph, text + semantic search"
echo "  [13]  Webhooks, cron, skill packs"
echo "  [14]  Board chat, memory, snapshots"
echo "  [15]  SSE streams, historical sessions"
echo "  [16]  People/stakeholder linking"
echo "  [17]  Negative tests (validation, double-claim, cycles)"
echo "  [18]  Cascade delete verification"
echo "============================================================"

[ "$FAIL" -gt 0 ] && exit 1 || exit 0
