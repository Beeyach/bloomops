// Request-local internal read model. No stored totals, cache or mutations.
import { and, asc, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate, loadInternalClientResource } from './authorization.mjs';
import { freshOnboardingActor, SATISFIED } from './onboarding-runtime.mjs';
import { onboardingView } from './onboarding-views.mjs';
import { clientServiceSummary } from './services.mjs';
import { listProjects } from './projects.mjs';
import { listActions, openActionCondition } from './actions.mjs';
import { actionCalendarDay } from './action-values.mjs';
import { projectReadCondition } from './project-access.mjs';
import { milestoneReadCondition } from './milestone-access.mjs';
import { deliverableReadCondition } from './deliverable-access.mjs';
import { actionReadCondition, dependencyBlockedCondition } from './action-access.mjs';
import { readTogether } from './read-batch.mjs';

const p = schema.projects, m = schema.milestones, a = schema.actions, d = schema.deliverables;
const openProject = () => sql`${p.status} NOT IN ('completed','cancelled','archived')`;
const path = value => encodeURIComponent(value);

// Each type is filtered BEFORE LIMIT, independent of the visible project page.
// At most eight candidates cross the database boundary (upcoming and overdue).
async function deadlineCandidates(db, actor, clientId, today, overdue) {
  const range = date => overdue ? sql`${date}<${today}` : sql`${date}>=${today}`;
  const parent = and(eq(p.clientId, clientId), openProject());
  const projectJoin = table => and(eq(table.workspaceId, p.workspaceId), eq(table.projectId, p.id));
  const types = [
    ['project', p, p.name, p.targetDate, and(projectReadCondition(actor), parent)],
    ['milestone', m, m.name, m.targetDate, and(milestoneReadCondition(actor), parent, sql`${m.status} NOT IN ('completed','skipped')`)],
    ['action', a, a.title, a.dueDate, and(actionReadCondition(actor), parent, openActionCondition(), overdue ? sql`NOT ${dependencyBlockedCondition()}` : undefined)],
    ['deliverable', d, d.title, d.targetDate, and(deliverableReadCondition(actor), parent, sql`${d.status} NOT IN ('delivered','cancelled')`)],
  ];
  return (await Promise.all(types.map(async ([kind, table, title, date, condition]) => {
    let query = db.select({ id: table.id, title, date, projectId: p.id,
      blocked: kind === 'action' ? dependencyBlockedCondition() : sql`0` }).from(table);
    if (table !== p) query = query.innerJoin(p, projectJoin(table));
    const [row] = await query.where(and(condition, range(date))).orderBy(asc(date), asc(table.id)).limit(1);
    if (!row) return null;
    const projectHref = `/work/projects/${path(row.projectId)}`;
    return { id: row.id, title: row.title, date: row.date, kind, blocked: Boolean(row.blocked),
      href: kind === 'action' ? `/work/actions/${path(row.id)}` : kind === 'project' ? projectHref : `${projectHref}#${kind}-${path(row.id)}` };
  }))).filter(Boolean).sort((x, y) => x.date.localeCompare(y.date) || x.kind.localeCompare(y.kind) || x.id.localeCompare(y.id));
}

export function summarizeRequests(view) {
  if (!view) return { state: 'unavailable', items: [], hasMore: false, progress: null };
  const open = view.items.filter(item => !SATISFIED.includes(item.status));
  return { state: view.state, progress: view.progress, hasMore: open.length > 5,
    items: open.slice(0, 5).map(item => ({ id: item.id, title: item.title, required: item.required,
      status: item.status, audience: item.submittedAt && item.verificationRequired ? 'review' : item.responsibleParty === 'client' ? 'client' : 'team' })) };
}

export async function clientOverview(db, suppliedActor, clientId, { now = new Date() } = {}) {
  // Match the route's client gate, refreshed for every invocation. A project or
  // task assignment alone does not open the client's administrative record.
  const actor = await freshOnboardingActor(db, suppliedActor);
  if (!actor || actor.role === 'client') return null;
  const resource = await loadInternalClientResource(db, actor.workspaceId, clientId);
  if (!resource || !evaluate(actor, { action: 'client.view', resource }).allowed) return null;
  const [client] = await db.select({ timezone: schema.clients.timezone }).from(schema.clients)
    .where(and(eq(schema.clients.workspaceId, actor.workspaceId), eq(schema.clients.id, clientId))).limit(1);
  if (!client) return null;
  const today = actionCalendarDay(now, client.timezone);
  return readTogether(db, async reads => {
    const [services, projects, actions, upcoming, overdue, requests] = await Promise.all([
      clientServiceSummary(reads, actor, clientId),
      listProjects(reads, actor, { clientId, openOnly: true, limit: 5 }),
      listActions(reads, actor, { clientId, view: 'all' }, { now, limit: 5, scopeCondition: and(openActionCondition(), openProject()) }),
      deadlineCandidates(reads, actor, clientId, today, false),
      deadlineCandidates(reads, actor, clientId, today, true),
      onboardingView(reads, actor, clientId),
    ]);
    if (!actions.ok) throw new Error('Client work could not be loaded');
    return { today, timezone: client.timezone || 'UTC', services,
      projects: { items: projects.items.map(row => ({ id: row.id, title: row.name, status: row.status,
        href: `/work/projects/${path(row.id)}` })), hasMore: projects.hasMore },
      actions: { items: actions.items.map(row => ({ id: row.id, title: row.title, status: row.status,
        href: `/work/actions/${path(row.id)}`, overdue: row.overdue, blocked: row.dependencyBlocked })), hasMore: actions.hasMore },
      nextDeadline: upcoming[0] || null, overdue: overdue[0] || null, requests: summarizeRequests(requests) };
  });
}
