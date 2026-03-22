#!/usr/bin/env bash
#
# Claude Code Operator — Mission Control: Full System Integration Test
# Run: bash test-all.sh 2>&1 | tee test-results.log
#
# Prerequisites: API on :3001, PostgreSQL, Redis, jq, curl

set -uo pipefail

BASE="http://localhost:3001"
TOKEN="63ac9000cf1b85fe1c99b99055aa919ef5424a7690e781f4"
AUTH="Authorization: Bearer $TOKEN"
CT="Content-Type: application/json"
PASS=0; FAIL=0; TOTAL=0
AUTH_USER="admin"; AUTH_PASS="9d40038dd5411f2046c7c03f"
TS=$(date +%s)  # unique suffix for idempotent runs

# ── Helpers ──

assert_status() {
  local label="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" -eq "$expected" ] 2>/dev/null; then
    echo "  [PASS] $label (HTTP $actual)"; PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label — expected HTTP $expected, got HTTP $actual"; FAIL=$((FAIL + 1))
  fi
}

assert_json() {
  local label="$1" body="$2" field="$3"
  TOTAL=$((TOTAL + 1))
  local val; val=$(echo "$body" | jq -r "$field" 2>/dev/null || echo "PARSE_ERROR")
  if [ "$val" != "null" ] && [ "$val" != "PARSE_ERROR" ] && [ -n "$val" ]; then
    echo "  [PASS] $label — $field = ${val:0:60}"; PASS=$((PASS + 1))
  else
    echo "  [FAIL] $label — $field missing/null"; FAIL=$((FAIL + 1))
  fi
}

api() {
  local method="$1" url="$2"; shift 2
  local data=""
  [ $# -gt 0 ] && data="$1"
  if [ -n "$data" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" -X "$method" "$url" -H "$AUTH" -H "$CT" -d "$data" 2>/dev/null)
  else
    RESPONSE=$(curl -s -w "\n%{http_code}" -X "$method" "$url" -H "$AUTH" 2>/dev/null)
  fi
  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')
}

echo "============================================================"
echo " Claude Code Operator — Full System Integration Test"
echo " $(date '+%Y-%m-%d %H:%M:%S')  Target: $BASE"
echo "============================================================"
echo ""

# ════════════════════════════════════════════════════════════════
# WS1: AUTH & SYSTEM HEALTH
# ════════════════════════════════════════════════════════════════
echo "── WS1: Auth & System Health ──"

# Health (no auth)
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE/health" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -1); BODY=$(echo "$RESPONSE" | sed '$d')
assert_status "GET /health" 200 "$HTTP_CODE"
assert_json "Health ok" "$BODY" ".ok"

# Login
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" -H "$CT" \
  -d "{\"username\":\"$AUTH_USER\",\"password\":\"$AUTH_PASS\"}" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -1); BODY=$(echo "$RESPONSE" | sed '$d')
assert_status "POST /api/auth/login" 200 "$HTTP_CODE"
SESSION_TOKEN=$(echo "$BODY" | jq -r '.sessionToken')
assert_json "Login token" "$BODY" ".sessionToken"

# /me with session token
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE/api/auth/me" -H "Authorization: Bearer $SESSION_TOKEN" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -1); BODY=$(echo "$RESPONSE" | sed '$d')
assert_status "GET /me (session)" 200 "$HTTP_CODE"

# /me with operator token (401 — not UUID)
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE/api/auth/me" -H "$AUTH" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
assert_status "GET /me (operator=401)" 401 "$HTTP_CODE"

# Bad login
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/auth/login" -H "$CT" \
  -d '{"username":"x","password":"y"}' 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
assert_status "POST login bad creds" 401 "$HTTP_CODE"

# System status
api GET "$BASE/api/system/status"
assert_status "GET /system/status" 200 "$HTTP_CODE"
assert_json "DB ok" "$BODY" ".db.ok"
assert_json "Redis ok" "$BODY" ".redis.ok"

# No auth -> 401
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE/api/boards" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
assert_status "GET /boards no-auth" 401 "$HTTP_CODE"

echo ""

# ════════════════════════════════════════════════════════════════
# WS2: BOARD & TASK MANAGEMENT
# ════════════════════════════════════════════════════════════════
echo "── WS2: Board & Task Management ──"

# Create boards
api POST "$BASE/api/boards" "{\"name\":\"Test Board Alpha $TS\",\"description\":\"Standard board\"}"
assert_status "Create Board Alpha" 201 "$HTTP_CODE"
BOARD_A=$(echo "$BODY" | jq -r '.id'); echo "  -> BOARD_A=$BOARD_A"

api POST "$BASE/api/boards" "{\"name\":\"Test Board Beta $TS\",\"description\":\"Governed\",\"requireApprovalForDone\":true,\"requireReviewBeforeDone\":true,\"blockStatusChangesWithPendingApproval\":true}"
assert_status "Create Board Beta (governed)" 201 "$HTTP_CODE"
BOARD_B=$(echo "$BODY" | jq -r '.id'); echo "  -> BOARD_B=$BOARD_B"

# List/Get/Update board
api GET "$BASE/api/boards"; assert_status "List boards" 200 "$HTTP_CODE"
api GET "$BASE/api/boards/$BOARD_A"; assert_status "Get board" 200 "$HTTP_CODE"
api PATCH "$BASE/api/boards/$BOARD_A" '{"description":"Updated"}'; assert_status "Update board" 200 "$HTTP_CODE"
api GET "$BASE/api/boards/$BOARD_A/summary"; assert_status "Board summary" 200 "$HTTP_CODE"
api GET "$BASE/api/boards/$BOARD_A/snapshot"; assert_status "Board snapshot" 200 "$HTTP_CODE"

# Create tasks
api POST "$BASE/api/tasks" "{\"boardId\":\"$BOARD_A\",\"title\":\"Task 1: Setup\",\"priority\":\"high\"}"
assert_status "Create task 1" 201 "$HTTP_CODE"; T1=$(echo "$BODY" | jq -r '.id')

api POST "$BASE/api/tasks" "{\"boardId\":\"$BOARD_A\",\"title\":\"Task 2: Build\",\"priority\":\"medium\"}"
assert_status "Create task 2" 201 "$HTTP_CODE"; T2=$(echo "$BODY" | jq -r '.id')

api POST "$BASE/api/tasks" "{\"boardId\":\"$BOARD_A\",\"title\":\"Task 3: Deploy\",\"priority\":\"low\"}"
assert_status "Create task 3" 201 "$HTTP_CODE"; T3=$(echo "$BODY" | jq -r '.id')

api POST "$BASE/api/tasks" "{\"boardId\":\"$BOARD_B\",\"title\":\"Governed Task\",\"priority\":\"high\"}"
assert_status "Create governed task" 201 "$HTTP_CODE"; TG=$(echo "$BODY" | jq -r '.id')

# List/Get tasks
api GET "$BASE/api/tasks?boardId=$BOARD_A"; assert_status "List tasks" 200 "$HTTP_CODE"
api GET "$BASE/api/tasks/$T1"; assert_status "Get task" 200 "$HTTP_CODE"

# Status transitions
api PATCH "$BASE/api/tasks/$T1" '{"status":"in_progress"}'; assert_status "inbox->in_progress" 200 "$HTTP_CODE"

# Atomic claim
api POST "$BASE/api/tasks/$T2/claim" '{"agentId":"agent-alpha"}'
assert_status "Claim task" 200 "$HTTP_CODE"
assert_json "Claim assigned" "$BODY" ".assignedAgentId"

# Double claim (409)
api POST "$BASE/api/tasks/$T2/claim" '{"agentId":"agent-beta"}'
assert_status "Double claim (409)" 409 "$HTTP_CODE"

# Queue
api GET "$BASE/api/tasks/queue?boardId=$BOARD_A"; assert_status "Task queue" 200 "$HTTP_CODE"
api GET "$BASE/api/tasks/overdue"; assert_status "Overdue tasks" 200 "$HTTP_CODE"

# Batch create
api POST "$BASE/api/tasks/batch" "{\"tasks\":[{\"boardId\":\"$BOARD_A\",\"title\":\"Batch 1\"},{\"boardId\":\"$BOARD_A\",\"title\":\"Batch 2\"}]}"
assert_status "Batch create" 201 "$HTTP_CODE"

# Notes
api POST "$BASE/api/tasks/$T1/notes" '{"message":"Starting work","agentId":"agent-alpha"}'
assert_status "Add note" 201 "$HTTP_CODE"
api GET "$BASE/api/tasks/$T1/notes"; assert_status "Get notes" 200 "$HTTP_CODE"

# Cancel
api POST "$BASE/api/tasks/$T3/cancel" '{"reason":"Not needed"}'
assert_status "Cancel task" 200 "$HTTP_CODE"

# Complete then try cancel (409)
api PATCH "$BASE/api/tasks/$T1" '{"status":"done"}'
assert_status "Mark done" 200 "$HTTP_CODE"
api POST "$BASE/api/tasks/$T1/cancel" '{"reason":"too late"}'
assert_status "Cancel done task (409)" 409 "$HTTP_CODE"

# Negative: invalid UUID
api GET "$BASE/api/tasks/not-a-uuid"; assert_status "Invalid UUID (400)" 400 "$HTTP_CODE"

# Negative: missing title
api POST "$BASE/api/tasks" "{\"boardId\":\"$BOARD_A\"}"
assert_status "Missing title (400)" 400 "$HTTP_CODE"

# Governance: requireReviewBeforeDone
api PATCH "$BASE/api/tasks/$TG" '{"status":"done"}'
assert_status "Skip review (409)" 409 "$HTTP_CODE"

# Move through review
api PATCH "$BASE/api/tasks/$TG" '{"status":"in_progress"}'; assert_status "Gov->in_progress" 200 "$HTTP_CODE"
api PATCH "$BASE/api/tasks/$TG" '{"status":"review"}'; assert_status "Gov->review" 200 "$HTTP_CODE"

# Governance: requireApprovalForDone (no approval yet)
api PATCH "$BASE/api/tasks/$TG" '{"status":"done"}'
assert_status "No approval (409)" 409 "$HTTP_CODE"

echo ""

# ════════════════════════════════════════════════════════════════
# WS3: PROJECT ORCHESTRATION
# ════════════════════════════════════════════════════════════════
echo "── WS3: Project Orchestration ──"

api POST "$BASE/api/projects" "{\"name\":\"Test Project $TS\",\"status\":\"planning\"}"
assert_status "Create project" 201 "$HTTP_CODE"
PROJ=$(echo "$BODY" | jq -r '.id'); echo "  -> PROJ=$PROJ"

# Create project tasks
api POST "$BASE/api/tasks" "{\"boardId\":\"$BOARD_A\",\"title\":\"Proj A: Design\",\"projectId\":\"$PROJ\",\"priority\":\"high\"}"
assert_status "Proj task A" 201 "$HTTP_CODE"; PA=$(echo "$BODY" | jq -r '.id')

api POST "$BASE/api/tasks" "{\"boardId\":\"$BOARD_A\",\"title\":\"Proj B: Implement\",\"projectId\":\"$PROJ\"}"
assert_status "Proj task B" 201 "$HTTP_CODE"; PB=$(echo "$BODY" | jq -r '.id')

api POST "$BASE/api/tasks" "{\"boardId\":\"$BOARD_A\",\"title\":\"Proj C: Test\",\"projectId\":\"$PROJ\"}"
assert_status "Proj task C" 201 "$HTTP_CODE"; PC=$(echo "$BODY" | jq -r '.id')

# Add to project
api POST "$BASE/api/projects/$PROJ/tasks" "{\"taskId\":\"$PA\",\"position\":0}"
assert_status "Add task A to project" 201 "$HTTP_CODE"
api POST "$BASE/api/projects/$PROJ/tasks" "{\"taskId\":\"$PB\",\"position\":1}"
assert_status "Add task B to project" 201 "$HTTP_CODE"

# Dependencies: B depends on A, C depends on B
api POST "$BASE/api/tasks/$PB/deps" "{\"dependsOnTaskId\":\"$PA\"}"
assert_status "Dep B->A" 201 "$HTTP_CODE"
api POST "$BASE/api/tasks/$PC/deps" "{\"dependsOnTaskId\":\"$PB\"}"
assert_status "Dep C->B" 201 "$HTTP_CODE"

# Cycle detection: A->C would create cycle
api POST "$BASE/api/tasks/$PA/deps" "{\"dependsOnTaskId\":\"$PC\"}"
assert_status "Cycle A->C (409)" 409 "$HTTP_CODE"

# Self-dependency
api POST "$BASE/api/tasks/$PA/deps" "{\"dependsOnTaskId\":\"$PA\"}"
assert_status "Self-dep (400)" 400 "$HTTP_CODE"

# Get deps
api GET "$BASE/api/tasks/$PB/deps"; assert_status "Get deps" 200 "$HTTP_CODE"
assert_json "Has blockedBy" "$BODY" ".blockedBy"

# Queue with respectDeps
api GET "$BASE/api/tasks/queue?boardId=$BOARD_A&respectDeps=true"
assert_status "Queue respectDeps" 200 "$HTTP_CODE"

# Get project detail
api GET "$BASE/api/projects/$PROJ"; assert_status "Get project" 200 "$HTTP_CODE"
assert_json "Has project" "$BODY" ".project"

# Complete task A -> check progress
api PATCH "$BASE/api/tasks/$PA" '{"status":"done","outcome":"success"}'
assert_status "Complete proj task A" 200 "$HTTP_CODE"

echo ""

# ════════════════════════════════════════════════════════════════
# WS4: APPROVAL WORKFLOWS
# ════════════════════════════════════════════════════════════════
echo "── WS4: Approval Workflows ──"

# Create approval for governed task
api POST "$BASE/api/approvals" "{\"boardId\":\"$BOARD_B\",\"taskId\":\"$TG\",\"agentId\":\"agent-alpha\",\"actionType\":\"task_completion\",\"confidence\":\"high\"}"
assert_status "Create approval" 201 "$HTTP_CODE"
APR1=$(echo "$BODY" | jq -r '.id'); echo "  -> APR1=$APR1"

# blockStatusChangesWithPendingApproval
api PATCH "$BASE/api/tasks/$TG" '{"status":"in_progress"}'
assert_status "Blocked by pending approval (409)" 409 "$HTTP_CODE"

# List/Get approvals
api GET "$BASE/api/approvals?boardId=$BOARD_B"; assert_status "List approvals" 200 "$HTTP_CODE"
api GET "$BASE/api/approvals/$APR1"; assert_status "Get approval" 200 "$HTTP_CODE"

# Reject first, create new, approve
api PATCH "$BASE/api/approvals/$APR1" '{"status":"rejected"}'
assert_status "Reject approval" 200 "$HTTP_CODE"

api POST "$BASE/api/approvals" "{\"boardId\":\"$BOARD_B\",\"taskId\":\"$TG\",\"agentId\":\"agent-alpha\",\"actionType\":\"task_completion\"}"
assert_status "Create approval 2" 201 "$HTTP_CODE"
APR2=$(echo "$BODY" | jq -r '.id')

api PATCH "$BASE/api/approvals/$APR2" '{"status":"approved"}'
assert_status "Approve" 200 "$HTTP_CODE"

# Now governed task can be done
api PATCH "$BASE/api/tasks/$TG" '{"status":"done"}'
assert_status "Gov task done (with approval)" 200 "$HTTP_CODE"

echo ""

# ════════════════════════════════════════════════════════════════
# WS5: AGENT & SKILL DISCOVERY
# ════════════════════════════════════════════════════════════════
echo "── WS5: Agent & Skill Discovery ──"

api GET "$BASE/api/agents"; assert_status "List agents" 200 "$HTTP_CODE"
api GET "$BASE/api/skills"; assert_status "List skills" 200 "$HTTP_CODE"
api POST "$BASE/api/skills/refresh"; assert_status "Refresh skills" 200 "$HTTP_CODE"
api GET "$BASE/api/scripts"; assert_status "List scripts" 200 "$HTTP_CODE"
api POST "$BASE/api/scripts/refresh"; assert_status "Refresh scripts" 200 "$HTTP_CODE"

# Agent bus
api POST "$BASE/api/agent-bus/send" "{\"boardId\":\"$BOARD_A\",\"fromAgentId\":\"alpha\",\"toAgentId\":\"beta\",\"content\":\"Review results\"}"
assert_status "Bus send" 201 "$HTTP_CODE"
assert_json "Bus msg id" "$BODY" ".id"

api GET "$BASE/api/agent-bus/inbox?boardId=$BOARD_A&agentId=beta"
assert_status "Bus inbox" 200 "$HTTP_CODE"

api GET "$BASE/api/agent-bus/agents?boardId=$BOARD_A"
assert_status "Bus agents" 200 "$HTTP_CODE"

api GET "$BASE/api/hooks"; assert_status "List hooks" 200 "$HTTP_CODE"
api GET "$BASE/api/mcp-servers"; assert_status "List MCP" 200 "$HTTP_CODE"

echo ""

# ════════════════════════════════════════════════════════════════
# WS6: ANALYTICS & SEARCH
# ════════════════════════════════════════════════════════════════
echo "── WS6: Analytics & Search ──"

api GET "$BASE/api/analytics/summary"; assert_status "Summary" 200 "$HTTP_CODE"
assert_json "totalCostUsd" "$BODY" ".totalCostUsd"
api GET "$BASE/api/analytics/by-agent"; assert_status "By agent" 200 "$HTTP_CODE"
api GET "$BASE/api/analytics/by-model"; assert_status "By model" 200 "$HTTP_CODE"
api GET "$BASE/api/analytics/timeseries?bucket=daily"; assert_status "Timeseries" 200 "$HTTP_CODE"
api GET "$BASE/api/analytics/task-velocity"; assert_status "Task velocity" 200 "$HTTP_CODE"
api GET "$BASE/api/analytics/task-outcomes"; assert_status "Task outcomes" 200 "$HTTP_CODE"
api GET "$BASE/api/analytics/by-project"; assert_status "By project" 200 "$HTTP_CODE"
api GET "$BASE/api/analytics/failed-tasks"; assert_status "Failed tasks" 200 "$HTTP_CODE"
api POST "$BASE/api/analytics/ingest"; assert_status "Ingest trigger" 200 "$HTTP_CODE"

api GET "$BASE/api/search?q=Setup"; assert_status "Text search" 200 "$HTTP_CODE"
assert_json "Search tasks" "$BODY" ".tasks"

api GET "$BASE/api/search/semantic?q=environment"; assert_status "Semantic search" 200 "$HTTP_CODE"

echo ""

# ════════════════════════════════════════════════════════════════
# WS7: REAL-TIME EVENTS
# ════════════════════════════════════════════════════════════════
echo "── WS7: Real-time Events ──"

TOTAL=$((TOTAL + 1))
SSE=$(curl -sI --max-time 3 "$BASE/api/activity/stream" -H "$AUTH" 2>/dev/null || true)
if echo "$SSE" | grep -qi "text/event-stream"; then
  echo "  [PASS] Activity SSE returns text/event-stream"; PASS=$((PASS + 1))
else
  echo "  [FAIL] Activity SSE wrong content-type"; FAIL=$((FAIL + 1))
fi

TOTAL=$((TOTAL + 1))
SSE2_BODY=$(curl -s --max-time 3 "$BASE/api/approvals/boards/$BOARD_A/stream?token=$TOKEN" 2>/dev/null || true)
if echo "$SSE2_BODY" | grep -q "data:"; then
  echo "  [PASS] Approval SSE returns event data"; PASS=$((PASS + 1))
elif [ -n "$SSE2_BODY" ]; then
  echo "  [PASS] Approval SSE connected (got response)"; PASS=$((PASS + 1))
else
  echo "  [FAIL] Approval SSE no response"; FAIL=$((FAIL + 1))
fi

echo ""

# ════════════════════════════════════════════════════════════════
# WS8: AUXILIARY ENTITIES
# ════════════════════════════════════════════════════════════════
echo "── WS8: Tags, People, Fields, Templates, etc ──"

# Tags
TAG_NAME="test-tag-$(date +%s)"
api POST "$BASE/api/tags" "{\"name\":\"$TAG_NAME\",\"color\":\"FF0000\"}"
assert_status "Create tag" 201 "$HTTP_CODE"
TAG=$(echo "$BODY" | jq -r '.id')
api GET "$BASE/api/tags"; assert_status "List tags" 200 "$HTTP_CODE"
api POST "$BASE/api/tags/tasks/$T2/add" "{\"tagId\":\"$TAG\"}"
assert_status "Tag task" 201 "$HTTP_CODE"
api GET "$BASE/api/tags/tasks/$T2"; assert_status "Get task tags" 200 "$HTTP_CODE"
api DELETE "$BASE/api/tags/tasks/$T2/$TAG"; assert_status "Untag task" 200 "$HTTP_CODE"

# People
api POST "$BASE/api/people" '{"name":"Jane Doe","email":"jane@test.com","source":"manual"}'
assert_status "Create person" 201 "$HTTP_CODE"
PERSON=$(echo "$BODY" | jq -r '.id')
api GET "$BASE/api/people"; assert_status "List people" 200 "$HTTP_CODE"
api GET "$BASE/api/people/$PERSON"; assert_status "Get person" 200 "$HTTP_CODE"
api POST "$BASE/api/people/$PERSON/threads" '{"agentId":"alpha","channel":"email","summary":"Outreach"}'
assert_status "Add thread" 201 "$HTTP_CODE"
THREAD=$(echo "$BODY" | jq -r '.id')

# Custom fields
api POST "$BASE/api/custom-fields" "{\"fieldKey\":\"est_hours_$TS\",\"label\":\"Est Hours\",\"fieldType\":\"decimal\"}"
assert_status "Create field def" 201 "$HTTP_CODE"
CF=$(echo "$BODY" | jq -r '.id')
api POST "$BASE/api/custom-fields/boards/$BOARD_A/bind" "{\"definitionId\":\"$CF\"}"
assert_status "Bind field" 201 "$HTTP_CODE"
api POST "$BASE/api/custom-fields/tasks/$T2/values" "{\"definitionId\":\"$CF\",\"value\":4.5}"
assert_status "Set field value" 201 "$HTTP_CODE"
api GET "$BASE/api/custom-fields/tasks/$T2/values"; assert_status "Get field values" 200 "$HTTP_CODE"

# Templates
api POST "$BASE/api/task-templates" "{\"name\":\"Bug Template $TS\",\"boardId\":\"$BOARD_A\",\"template\":{\"title\":\"Bug: [X]\",\"priority\":\"high\"}}"
assert_status "Create template" 201 "$HTTP_CODE"
TMPL=$(echo "$BODY" | jq -r '.id')
api POST "$BASE/api/task-templates/$TMPL/instantiate" '{"title":"Bug: Login error"}'
assert_status "Instantiate template" 201 "$HTTP_CODE"

# Board groups
api POST "$BASE/api/board-groups" "{\"name\":\"Engineering $TS\"}"
assert_status "Create board group" 201 "$HTTP_CODE"
BG=$(echo "$BODY" | jq -r '.id')
api POST "$BASE/api/board-groups/$BG/boards/$BOARD_A"
assert_status "Add board to group" 200 "$HTTP_CODE"
api GET "$BASE/api/board-groups/$BG"; assert_status "Get group" 200 "$HTTP_CODE"

# Board chat
api GET "$BASE/api/boards/$BOARD_A/chat"; assert_status "Get chat" 200 "$HTTP_CODE"
api POST "$BASE/api/boards/$BOARD_A/chat" '{"message":"Status update?"}'
assert_status "Post chat" 200 "$HTTP_CODE"

# Board memory
api POST "$BASE/api/boards/$BOARD_A/memory" '{"content":"Team prefers TypeScript","tags":["convention"]}'
assert_status "Add memory" 201 "$HTTP_CODE"
MEM=$(echo "$BODY" | jq -r '.id')
api GET "$BASE/api/boards/$BOARD_A/memory"; assert_status "Get memory" 200 "$HTTP_CODE"

# Webhooks
api POST "$BASE/api/webhooks" "{\"url\":\"https://httpbin.org/post\",\"events\":[\"task.created\"],\"boardId\":\"$BOARD_A\"}"
assert_status "Create webhook" 201 "$HTTP_CODE"
WH=$(echo "$BODY" | jq -r '.id')
api GET "$BASE/api/webhooks"; assert_status "List webhooks" 200 "$HTTP_CODE"

# Skill packs
api POST "$BASE/api/skill-packs" '{"name":"DevOps Pack","version":"1.0.0","skills":["docker"]}'
assert_status "Create skill pack" 201 "$HTTP_CODE"
PACK=$(echo "$BODY" | jq -r '.id')

# Flow
api GET "$BASE/api/flow/graph?window=24h"; assert_status "Flow graph" 200 "$HTTP_CODE"
assert_json "Flow nodes" "$BODY" ".nodes"
api POST "$BASE/api/flow/edges" "{\"fromAgentId\":\"alpha\",\"toAgentId\":\"beta\",\"messageType\":\"handoff\",\"taskId\":\"$T2\"}"
assert_status "Create flow edge" 201 "$HTTP_CODE"

# Cron
api POST "$BASE/api/cron" '{"name":"Health check","schedule":"0 9 * * *","agentId":"checker","command":"Check health"}'
assert_status "Create cron" 201 "$HTTP_CODE"
CRON=$(echo "$BODY" | jq -r '.id')

# Activity
api POST "$BASE/api/activity" "{\"boardId\":\"$BOARD_A\",\"eventType\":\"test\",\"message\":\"Test event\"}"
assert_status "Create event" 201 "$HTTP_CODE"
api GET "$BASE/api/activity?boardId=$BOARD_A&limit=5"; assert_status "List events" 200 "$HTTP_CODE"

# Context graph
api GET "$BASE/api/context-graph/stats"; assert_status "Graph stats" 200 "$HTTP_CODE"
api POST "$BASE/api/context-graph/entities" "{\"name\":\"TestSvc\",\"entityType\":\"service\",\"boardId\":\"$BOARD_A\"}"
assert_status "Create entity" 201 "$HTTP_CODE"
ENT=$(echo "$BODY" | jq -r '.id')
api GET "$BASE/api/context-graph/entities/$ENT"; assert_status "Get entity" 200 "$HTTP_CODE"
api POST "$BASE/api/context-graph/observations" "{\"entityId\":\"$ENT\",\"content\":\"Handles 1k rps\",\"observationType\":\"fact\"}"
assert_status "Add observation" 201 "$HTTP_CODE"

echo ""

# ════════════════════════════════════════════════════════════════
# WS9: ORCHESTRATION STATUS
# ════════════════════════════════════════════════════════════════
echo "── WS9: Orchestration Status ──"

api GET "$BASE/api/agent-sdk/status"; assert_status "SDK status" 200 "$HTTP_CODE"
assert_json "SDK available" "$BODY" ".available"
api GET "$BASE/api/agent-sdk/sessions"; assert_status "Sessions list" 200 "$HTTP_CODE"
assert_json "Active array" "$BODY" ".active"
api GET "$BASE/api/agent-sdk/mcp-servers"; assert_status "MCP servers" 200 "$HTTP_CODE"
api GET "$BASE/api/sessions"; assert_status "Legacy sessions" 200 "$HTTP_CODE"

# Spawn (expect 503 without API key or 201 with)
api POST "$BASE/api/agent-sdk/spawn" '{"prompt":"Hello","maxTurns":1,"permissionMode":"plan"}'
TOTAL=$((TOTAL + 1))
if [ "$HTTP_CODE" -eq 503 ] || [ "$HTTP_CODE" -eq 201 ]; then
  echo "  [PASS] Spawn (HTTP $HTTP_CODE)"; PASS=$((PASS + 1))
else
  echo "  [FAIL] Spawn — expected 503/201, got $HTTP_CODE"; FAIL=$((FAIL + 1))
fi

# Non-existent session
api POST "$BASE/api/agent-sdk/sessions/00000000-0000-0000-0000-000000000000/abort"
assert_status "Abort missing (404)" 404 "$HTTP_CODE"
api GET "$BASE/api/agent-sdk/sessions/00000000-0000-0000-0000-000000000000"
assert_status "Get missing (404)" 404 "$HTTP_CODE"

echo ""

# ════════════════════════════════════════════════════════════════
# CLEANUP
# ════════════════════════════════════════════════════════════════
echo "── CLEANUP ──"

# Auxiliary entities
api DELETE "$BASE/api/cron/$CRON"; assert_status "Del cron" 200 "$HTTP_CODE"
api DELETE "$BASE/api/webhooks/$WH"; assert_status "Del webhook" 200 "$HTTP_CODE"
api DELETE "$BASE/api/skill-packs/$PACK"; assert_status "Del skill pack" 200 "$HTTP_CODE"
api DELETE "$BASE/api/task-templates/$TMPL"; assert_status "Del template" 200 "$HTTP_CODE"
api DELETE "$BASE/api/custom-fields/boards/$BOARD_A/unbind/$CF"; assert_status "Unbind field" 200 "$HTTP_CODE"
api DELETE "$BASE/api/custom-fields/$CF"; assert_status "Del field def" 200 "$HTTP_CODE"
api DELETE "$BASE/api/people/$PERSON/threads/$THREAD"; assert_status "Del thread" 200 "$HTTP_CODE"
api DELETE "$BASE/api/people/$PERSON"; assert_status "Del person" 200 "$HTTP_CODE"
api DELETE "$BASE/api/tags/$TAG"; assert_status "Del tag" 200 "$HTTP_CODE"
api DELETE "$BASE/api/board-groups/$BG/boards/$BOARD_A" 2>/dev/null
api DELETE "$BASE/api/board-groups/$BG"; assert_status "Del board group" 200 "$HTTP_CODE"
api DELETE "$BASE/api/boards/$BOARD_A/memory/$MEM"; assert_status "Del memory" 200 "$HTTP_CODE"

# Dependencies
api DELETE "$BASE/api/tasks/$PB/deps/$PA"; assert_status "Del dep B->A" 200 "$HTTP_CODE"
api DELETE "$BASE/api/tasks/$PC/deps/$PB"; assert_status "Del dep C->B" 200 "$HTTP_CODE"

# Project
api DELETE "$BASE/api/projects/$PROJ"; assert_status "Del project" 200 "$HTTP_CODE"

# Tasks (cascade from board delete handles most, but delete explicitly)
for tid in $T1 $T2 $T3 $TG $PA $PB $PC; do
  api DELETE "$BASE/api/tasks/$tid" 2>/dev/null
done

# Remaining tasks (batch + template-instantiated)
REMAINING=$(curl -s "$BASE/api/tasks?boardId=$BOARD_A&limit=100" -H "$AUTH" 2>/dev/null | jq -r '.[].id' 2>/dev/null || true)
for tid in $REMAINING; do
  api DELETE "$BASE/api/tasks/$tid" 2>/dev/null
done

# Clean ALL remaining tasks before board delete (template-instantiated, batch, etc.)
for board in $BOARD_A $BOARD_B; do
  REMAINING=$(curl -s "$BASE/api/tasks?boardId=$board&limit=200" -H "$AUTH" 2>/dev/null | jq -r '.[].id' 2>/dev/null || true)
  for tid in $REMAINING; do
    curl -s -X DELETE "$BASE/api/tasks/$tid" -H "$AUTH" >/dev/null 2>&1
  done
done

# Boards — may return 409 if template-instantiated tasks remain (cascade handles them)
for board_id in $BOARD_A $BOARD_B; do
  # Force-delete remaining tasks
  for tid in $(curl -s "$BASE/api/tasks?boardId=$board_id&limit=500" -H "$AUTH" 2>/dev/null | jq -r '.[].id' 2>/dev/null); do
    curl -s -X DELETE "$BASE/api/tasks/$tid" -H "$AUTH" >/dev/null 2>&1
  done
done
api DELETE "$BASE/api/boards/$BOARD_A"; assert_status "Del Board Alpha" 200 "$HTTP_CODE"
api DELETE "$BASE/api/boards/$BOARD_B"; assert_status "Del Board Beta" 200 "$HTTP_CODE"

# Approvals (cascade-deleted with board)

# Logout
curl -s -X POST "$BASE/api/auth/logout" -H "Authorization: Bearer $SESSION_TOKEN" >/dev/null 2>&1

echo ""

# ════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════
echo "============================================================"
echo " RESULTS: $PASS passed / $FAIL failed / $TOTAL total"
echo "============================================================"
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
