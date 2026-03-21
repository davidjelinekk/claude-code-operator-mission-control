import { HttpClient } from './http.js'
import type { CCOperatorConfig } from './types.js'
import { BoardsResource } from './resources/boards.js'
import { TasksResource } from './resources/tasks.js'
import { SessionsResource } from './resources/sessions.js'
import { AgentsResource } from './resources/agents.js'
import { SkillsResource } from './resources/skills.js'
import { ScriptsResource } from './resources/scripts.js'
import { ContextGraphResource } from './resources/context-graph.js'
import { AgentBusResource } from './resources/agent-bus.js'
import { SearchResource } from './resources/search.js'
import { AnalyticsResource } from './resources/analytics.js'
import { SystemResource } from './resources/system.js'
import { ProjectsResource } from './resources/projects.js'
import { ApprovalsResource } from './resources/approvals.js'
import { WebhooksResource } from './resources/webhooks.js'
import { FlowResource } from './resources/flow.js'
import { TagsResource } from './resources/tags.js'
import { ActivityResource } from './resources/activity.js'
import { CronResource } from './resources/cron.js'
import { PeopleResource } from './resources/people.js'

export class CCOperator {
  private http: HttpClient

  readonly boards: BoardsResource
  readonly tasks: TasksResource
  readonly sessions: SessionsResource
  readonly agents: AgentsResource
  readonly skills: SkillsResource
  readonly scripts: ScriptsResource
  readonly contextGraph: ContextGraphResource
  readonly agentBus: AgentBusResource
  readonly search: SearchResource
  readonly analytics: AnalyticsResource
  readonly system: SystemResource
  readonly projects: ProjectsResource
  readonly approvals: ApprovalsResource
  readonly webhooks: WebhooksResource
  readonly flow: FlowResource
  readonly tags: TagsResource
  readonly activity: ActivityResource
  readonly cron: CronResource
  readonly people: PeopleResource

  constructor(config: CCOperatorConfig) {
    this.http = new HttpClient(config)
    this.boards = new BoardsResource(this.http)
    this.tasks = new TasksResource(this.http)
    this.sessions = new SessionsResource(this.http)
    this.agents = new AgentsResource(this.http)
    this.skills = new SkillsResource(this.http)
    this.scripts = new ScriptsResource(this.http)
    this.contextGraph = new ContextGraphResource(this.http)
    this.agentBus = new AgentBusResource(this.http)
    this.search = new SearchResource(this.http)
    this.analytics = new AnalyticsResource(this.http)
    this.system = new SystemResource(this.http)
    this.projects = new ProjectsResource(this.http)
    this.approvals = new ApprovalsResource(this.http)
    this.webhooks = new WebhooksResource(this.http)
    this.flow = new FlowResource(this.http)
    this.tags = new TagsResource(this.http)
    this.activity = new ActivityResource(this.http)
    this.cron = new CronResource(this.http)
    this.people = new PeopleResource(this.http)
  }
}
