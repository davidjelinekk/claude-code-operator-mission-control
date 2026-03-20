#!/usr/bin/env node
/**
 * One-shot migration script: legacy databases → cc_operator
 *
 * Clears all migratable cc_operator tables, then bulk-inserts from the legacy database.
 * Run from repo root:
 *   node apps/api/node_modules/.bin/tsx apps/api/scripts/migrate-from-mc.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import postgres from 'postgres'

const MC_URL = 'postgresql://localhost:5432/mission_control'
const OC_URL = 'postgresql://localhost:5432/oc_operator'
const OPENCLAW_JSON = join(homedir(), '.openclaw', 'openclaw.json')

// Build uuid → text-id map from legacy config
function buildAgentMap(): Map<string, string> {
  const config = JSON.parse(readFileSync(OPENCLAW_JSON, 'utf-8'))
  const agentsList: Array<{ id: string; name?: string }> = config.agents?.list ?? []
  const map = new Map<string, string>()
  for (const agent of agentsList) {
    // Pattern: mc-{uuid}
    const m = agent.id.match(/^mc-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)
    if (m) map.set(m[1], agent.id)
  }
  return map
}

function toTextId(uuid: string | null, map: Map<string, string>): string | null {
  if (!uuid) return null
  return map.get(uuid) ?? `mc-${uuid}`
}

function log(table: string, count: number) {
  console.log(`  ✓ ${table}: ${count} rows`)
}

async function run() {
  const agentMap = buildAgentMap()
  console.log('Agent map:')
  for (const [uuid, id] of agentMap) console.log(`  ${uuid} -> ${id}`)

  const mc = postgres(MC_URL, { max: 1 })
  const oc = postgres(OC_URL, { max: 1 })

  try {
    // ---- Clear target tables (FK-safe order) ----
    console.log('\nClearing target tables...')
    await oc`DELETE FROM task_custom_field_values`
    await oc`DELETE FROM task_tags`
    await oc`DELETE FROM task_dependencies`
    await oc`DELETE FROM task_planning_sessions`
    await oc`DELETE FROM activity_events`
    await oc`DELETE FROM approvals`
    await oc`DELETE FROM board_memory`
    await oc`DELETE FROM tasks`
    await oc`DELETE FROM board_task_custom_fields`
    await oc`DELETE FROM task_custom_field_definitions`
    await oc`DELETE FROM tags`
    await oc`DELETE FROM boards`
    await oc`DELETE FROM board_groups`
    console.log('Tables cleared.\n')

    console.log('Migrating...')

    // ---- board_groups ----
    const mcBoardGroups = await mc`
      SELECT id, name, slug, description, created_at, updated_at
      FROM board_groups
    `
    if (mcBoardGroups.length > 0) {
      await oc`INSERT INTO board_groups ${oc(mcBoardGroups, 'id', 'name', 'slug', 'description', 'created_at', 'updated_at')}`
    }
    log('board_groups', mcBoardGroups.length)

    // ---- boards ----
    const mcBoards = await mc`
      SELECT id, name, slug, description, board_group_id, objective, target_date,
             goal_confirmed, require_approval_for_done, require_review_before_done,
             comment_required_for_review, block_status_changes_with_pending_approval,
             only_lead_can_change_status, max_agents, created_at, updated_at
      FROM boards
    `
    const ocBoards = mcBoards.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      description: b.description,
      gateway_agent_id: null as null,
      board_group_id: b.board_group_id,
      objective: b.objective,
      target_date: b.target_date,
      goal_confirmed: b.goal_confirmed,
      require_approval_for_done: b.require_approval_for_done,
      require_review_before_done: b.require_review_before_done,
      comment_required_for_review: b.comment_required_for_review,
      block_status_changes_with_pending_approval: b.block_status_changes_with_pending_approval,
      only_lead_can_change_status: b.only_lead_can_change_status,
      max_agents: b.max_agents,
      created_at: b.created_at,
      updated_at: b.updated_at,
    }))
    if (ocBoards.length > 0) {
      await oc`INSERT INTO boards ${oc(
        ocBoards,
        'id', 'name', 'slug', 'description', 'gateway_agent_id', 'board_group_id',
        'objective', 'target_date', 'goal_confirmed', 'require_approval_for_done',
        'require_review_before_done', 'comment_required_for_review',
        'block_status_changes_with_pending_approval', 'only_lead_can_change_status',
        'max_agents', 'created_at', 'updated_at',
      )}`
    }
    log('boards', ocBoards.length)

    // ---- task_custom_field_definitions ----
    const mcCfDefs = await mc`
      SELECT id, field_key, label, field_type, ui_visibility, description,
             required, default_value, created_at, updated_at
      FROM task_custom_field_definitions
    `
    // Deduplicate by field_key (take first) in case of multi-org data
    const seenFieldKeys = new Set<string>()
    const dedupedCfDefs = mcCfDefs.filter((d) => {
      if (seenFieldKeys.has(d.field_key)) return false
      seenFieldKeys.add(d.field_key)
      return true
    })
    if (dedupedCfDefs.length > 0) {
      await oc`
        INSERT INTO task_custom_field_definitions
          ${oc(dedupedCfDefs, 'id', 'field_key', 'label', 'field_type', 'ui_visibility',
               'description', 'required', 'default_value', 'created_at', 'updated_at')}
        ON CONFLICT (field_key) DO NOTHING
      `
    }
    log('task_custom_field_definitions', dedupedCfDefs.length)

    // ---- board_task_custom_fields ----
    const mcBtcf = await mc`
      SELECT id, board_id, task_custom_field_definition_id
      FROM board_task_custom_fields
    `
    const ocBtcf = mcBtcf.map((r) => ({
      id: r.id,
      board_id: r.board_id,
      definition_id: r.task_custom_field_definition_id,
    }))
    if (ocBtcf.length > 0) {
      await oc`INSERT INTO board_task_custom_fields ${oc(ocBtcf, 'id', 'board_id', 'definition_id')}`
    }
    log('board_task_custom_fields', ocBtcf.length)

    // ---- tags ----
    const mcTags = await mc`
      SELECT id, name, slug, color, description, created_at, updated_at
      FROM tags
    `
    if (mcTags.length > 0) {
      await oc`INSERT INTO tags ${oc(mcTags, 'id', 'name', 'slug', 'color', 'description', 'created_at', 'updated_at')}`
    }
    log('tags', mcTags.length)

    // ---- tasks ----
    const mcTasks = await mc`
      SELECT id, board_id, title, description, status, priority,
             due_at, in_progress_at, assigned_agent_id,
             auto_created, auto_reason, created_at, updated_at
      FROM tasks
    `
    const ocTasks = mcTasks.map((t) => ({
      id: t.id,
      board_id: t.board_id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      due_at: t.due_at,
      in_progress_at: t.in_progress_at,
      assigned_agent_id: toTextId(t.assigned_agent_id, agentMap),
      auto_created: t.auto_created,
      auto_reason: t.auto_reason,
      outcome: null as null,
      completed_at: null as null,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }))
    if (ocTasks.length > 0) {
      await oc`INSERT INTO tasks ${oc(
        ocTasks,
        'id', 'board_id', 'title', 'description', 'status', 'priority',
        'due_at', 'in_progress_at', 'assigned_agent_id',
        'auto_created', 'auto_reason', 'outcome', 'completed_at',
        'created_at', 'updated_at',
      )}`
    }
    log('tasks', ocTasks.length)

    // ---- tag_assignments -> task_tags ----
    const mcTagAssignments = await mc`SELECT task_id, tag_id FROM tag_assignments`
    if (mcTagAssignments.length > 0) {
      await oc`INSERT INTO task_tags ${oc(mcTagAssignments, 'task_id', 'tag_id')}`
    }
    log('task_tags (from tag_assignments)', mcTagAssignments.length)

    // ---- approvals ----
    const mcApprovals = await mc`
      SELECT id, board_id, task_id, agent_id, action_type, payload,
             confidence, rubric_scores, status, created_at, resolved_at
      FROM approvals
    `
    const ocApprovals = mcApprovals.map((a) => ({
      id: a.id,
      board_id: a.board_id,
      task_id: a.task_id,
      agent_id: toTextId(a.agent_id, agentMap) ?? 'unknown',
      action_type: a.action_type,
      payload: a.payload,
      confidence: a.confidence != null ? String(a.confidence) : (null as null),
      rubric_scores: a.rubric_scores,
      status: a.status,
      created_at: a.created_at,
      resolved_at: a.resolved_at,
    }))
    if (ocApprovals.length > 0) {
      await oc`INSERT INTO approvals ${oc(
        ocApprovals,
        'id', 'board_id', 'task_id', 'agent_id', 'action_type', 'payload',
        'confidence', 'rubric_scores', 'status', 'created_at', 'resolved_at',
      )}`
    }
    log('approvals', ocApprovals.length)

    // ---- activity_events ----
    const mcActivity = await mc`
      SELECT id, board_id, task_id, agent_id, event_type, message, created_at
      FROM activity_events
    `
    const ocActivity = mcActivity.map((e) => ({
      id: e.id,
      board_id: e.board_id,
      task_id: e.task_id,
      agent_id: toTextId(e.agent_id, agentMap),
      event_type: e.event_type,
      message: (e.message as string | null) ?? '',
      metadata: {},
      created_at: e.created_at,
    }))
    if (ocActivity.length > 0) {
      await oc`INSERT INTO activity_events ${oc(
        ocActivity,
        'id', 'board_id', 'task_id', 'agent_id', 'event_type', 'message', 'metadata', 'created_at',
      )}`
    }
    log('activity_events', ocActivity.length)

    // ---- board_memory ----
    const mcMemory = await mc`
      SELECT id, board_id, content, tags, is_chat, source, created_at
      FROM board_memory
    `
    const ocMemory = mcMemory.map((m) => ({
      id: m.id,
      board_id: m.board_id,
      content: m.content,
      tags: (m.tags as string[] | null) ?? [],
      is_chat: m.is_chat,
      source: m.source,
      created_at: m.created_at,
    }))
    if (ocMemory.length > 0) {
      await oc`INSERT INTO board_memory ${oc(
        ocMemory,
        'id', 'board_id', 'content', 'tags', 'is_chat', 'source', 'created_at',
      )}`
    }
    log('board_memory', ocMemory.length)

    // ---- task_custom_field_values ----
    const mcCfVals = await mc`
      SELECT id, task_id, task_custom_field_definition_id, value, created_at, updated_at
      FROM task_custom_field_values
    `
    const ocCfVals = mcCfVals.map((v) => ({
      id: v.id,
      task_id: v.task_id,
      definition_id: v.task_custom_field_definition_id,
      value: v.value,
      created_at: v.created_at,
      updated_at: v.updated_at,
    }))
    if (ocCfVals.length > 0) {
      await oc`INSERT INTO task_custom_field_values ${oc(
        ocCfVals,
        'id', 'task_id', 'definition_id', 'value', 'created_at', 'updated_at',
      )}`
    }
    log('task_custom_field_values', ocCfVals.length)

    console.log('\nMigration complete!')
  } catch (err) {
    console.error('\nMigration failed:', err)
    process.exit(1)
  } finally {
    await mc.end()
    await oc.end()
  }
}

run()
