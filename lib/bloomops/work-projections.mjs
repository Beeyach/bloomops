// B6 reads canonical facts only. Every child aggregate carries its own live
// permission predicate; a readable Project never makes hidden children count.
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { readTogether } from './read-batch.mjs';
import { timedNavigation } from './navigation-timing.mjs';
import { INTERNAL_ROLES } from './authorization.mjs';
import { projectReadCondition } from './project-access.mjs';
import { milestoneReadCondition } from './milestone-access.mjs';
import { actionReadCondition, dependencyBlockedCondition } from './action-access.mjs';
import { deliverableReadCondition } from './deliverable-access.mjs';
import { fileReadCondition } from './file-access.mjs';
import { actionTimezonesCovered, actionTodayCondition, actionViewCondition, commonActionToday, listActions, openActionCondition, readableActionTimezones } from './actions.mjs';
import { PROJECT_STATUSES } from './project-values.mjs';

export const HOME_ACTION_LIMIT = 4;
export const HOME_PROJECT_LIMIT = 5;
export const HOME_DELIVERABLE_LIMIT = 6;
export const HOME_RECENT_LIMIT = 6;
export const HOME_ACTION_VIEWS = ['overdue', 'today', 'waiting', 'review'];
export const PROJECT_ATTENTION_LABELS = {
  1: 'At risk', 2: 'Blocked', 3: 'Needs attention', 4: 'Project waiting',
  5: 'Overdue Actions', 6: 'Deliverables in Client Review', 7: 'Deliverables in Internal Review',
  8: 'Actions in Review', 9: 'Actions waiting',
};

const p = schema.projects, c = schema.clients, m = schema.milestones, a = schema.actions;
const d = schema.deliverables, f = schema.assets, l = schema.assetLinks, e = schema.activityEvents;
const internal = actor => actor?.status === 'active' && ['workspace', 'assigned'].includes(actor.scope?.kind) && INTERNAL_ROLES.includes(actor.role);
const capped = (value, fallback, maximum = 200) => Math.max(1, Math.min(Number.isSafeInteger(value) ? value : fallback, maximum));
const jsonAggregate = expression => expression.mapWith(value => JSON.parse(value));

// A finite set of validated Client timezones, from independently readable
// Projects. Direct Action assignment cannot widen this Project query.
export function projectTimezones(db, actor, condition) {
  return db.select({ timezone: c.timezone }).from(p)
    .innerJoin(c, and(eq(c.workspaceId, p.workspaceId), eq(c.id, p.clientId)))
    .where(and(projectReadCondition(actor), condition)).groupBy(c.timezone);
}

export async function projectToday(db, actor, now, condition) {
  return actionTodayCondition(now, await projectTimezones(db, actor, condition));
}

function projectSummariesQuery(db, actor, { status, clientId, projectId, today, condition, execution }) {
  const members = schema.workspaceMemberships, people = schema.user, services = schema.serviceEngagements, types = schema.serviceTypes, departments = schema.departments;
  return db.select({ id: p.id, name: p.name, status: p.status, health: p.health, targetDate: p.targetDate,
    clientName: sql`${c.name}`.as('client_name'), serviceName: sql`${types.name}`.as('service_name'), departmentName: sql`${departments.name}`.as('department_name'),
    ownerName: sql`coalesce(${people.name}, ${people.email})`.as('owner_name'),
    ...(execution ? { currentPhase: jsonAggregate(sql`CASE WHEN ${p.status} IN ('completed','cancelled','archived') THEN NULL ELSE
      (SELECT json_object('name', milestones.name, 'status', milestones.status) FROM milestones
       WHERE ${milestoneReadCondition(actor)} AND milestones.status IN ('in_progress','waiting','upcoming')
       ORDER BY CASE milestones.status WHEN 'in_progress' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END,
         milestones.position, milestones.id LIMIT 1) END`).as('current_phase') } : {}),
    milestones: jsonAggregate(sql`(SELECT json_object('total', count(*), 'finished', coalesce(sum(milestones.status IN ('completed','skipped')),0))
      FROM milestones WHERE ${milestoneReadCondition(actor)})`).as('milestone_summary'),
    actions: jsonAggregate(sql`(SELECT json_object('open', coalesce(sum(${openActionCondition()}),0),
      'waiting', coalesce(sum(${actionViewCondition(actor, 'waiting', today)}),0),
      'review', coalesce(sum(${actionViewCondition(actor, 'review', today)}),0),
      'overdue', coalesce(sum(${actionViewCondition(actor, 'overdue', today)}),0)
      ${execution ? sql`, 'total', count(*), 'done', coalesce(sum(actions.status='done'),0),
        'cancelled', coalesce(sum(actions.status='cancelled'),0),
        'blocked', coalesce(sum(${openActionCondition()} AND ${dependencyBlockedCondition()}),0)` : sql``})
      FROM actions WHERE ${actionReadCondition(actor)})`).as('action_summary'),
    deliverables: jsonAggregate(sql`(SELECT json_object('total', count(*),
      'planned', coalesce(sum(deliverables.status='planned'),0), 'inProgress', coalesce(sum(deliverables.status='in_progress'),0),
      'internalReview', coalesce(sum(deliverables.status='internal_review'),0), 'clientReview', coalesce(sum(deliverables.status='client_review'),0),
      'approved', coalesce(sum(deliverables.status='approved'),0), 'delivered', coalesce(sum(deliverables.status='delivered'),0),
      'cancelled', coalesce(sum(deliverables.status='cancelled'),0))
      FROM deliverables WHERE ${deliverableReadCondition(actor)})`).as('deliverable_summary'),
    readyFiles: sql`(SELECT count(*) FROM assets JOIN asset_links ON asset_links.asset_id=assets.id AND asset_links.workspace_id=assets.workspace_id
      WHERE asset_links.project_id=${p.id} AND asset_links.workspace_id=${p.workspaceId} AND ${fileReadCondition(actor, { ready: true })})`.mapWith(Number).as('ready_files'),
  }).from(p)
    .innerJoin(c, and(eq(c.workspaceId, p.workspaceId), eq(c.id, p.clientId)))
    .leftJoin(services, and(eq(services.workspaceId, p.workspaceId), eq(services.id, p.serviceEngagementId)))
    .leftJoin(types, and(eq(types.workspaceId, p.workspaceId), eq(types.id, services.serviceTypeId)))
    .leftJoin(departments, and(eq(departments.workspaceId, p.workspaceId), eq(departments.id, sql`coalesce(${types.departmentId}, ${p.departmentId})`)))
    .leftJoin(members, and(eq(members.workspaceId, p.workspaceId), eq(members.id, p.ownerMembershipId)))
    .leftJoin(people, eq(people.id, members.userId))
    .where(and(projectReadCondition(actor), PROJECT_STATUSES.includes(status) ? eq(p.status, status) : undefined,
      clientId ? eq(p.clientId, String(clientId)) : undefined, projectId ? eq(p.id, String(projectId)) : undefined, condition));
}

// Priority belongs to this read, never to a stored health/status. Closed
// Projects do not enter attention; their canonical Work rows remain available.
const attentionPriority = q => sql`CASE
  WHEN ${q.status} IN ('completed','cancelled','archived') THEN 0
  WHEN ${q.health}='at_risk' THEN 1 WHEN ${q.status}='blocked' THEN 2
  WHEN ${q.health}='needs_attention' THEN 3 WHEN ${q.status}='waiting' THEN 4
  WHEN json_extract(${q.actions},'$.overdue')>0 THEN 5
  WHEN json_extract(${q.deliverables},'$.clientReview')>0 THEN 6
  WHEN json_extract(${q.deliverables},'$.internalReview')>0 THEN 7
  WHEN json_extract(${q.actions},'$.review')>0 THEN 8
  WHEN json_extract(${q.actions},'$.waiting')>0 THEN 9 ELSE 0 END`;

// Server-only composition: condition can narrow the canonical read, never
// replace its authorization. Ordinary Home/Work callers keep their defaults.
export async function listProjectSummaries(db, actor, { status = 'all', clientId = null, projectId = null, attentionOnly = false, attentionFirst = false, condition, page = 1, limit = 200, now = new Date(), today: suppliedToday, execution = false } = {}) {
  if (!internal(actor)) return { items: [], hasMore: false };
  const cap = capped(limit, 200);
  const today = suppliedToday == null ? await projectToday(db, actor, now, condition)
    : typeof suppliedToday?.then === 'function' ? await suppliedToday : suppliedToday;
  const offset = (capped(page, 1, 10000) - 1) * cap;
  const q = db.$with('readable_project_summaries').as(projectSummariesQuery(db, actor, { status, clientId, projectId, today, condition, execution }));
  const priority = attentionPriority(q);
  const rows = await db.with(q).select({ id: q.id, name: q.name, status: q.status, health: q.health, targetDate: q.targetDate,
    clientName: q.clientName, serviceName: q.serviceName, departmentName: q.departmentName, ownerName: q.ownerName,
    ...(execution ? { currentPhase: q.currentPhase } : {}),
    milestones: q.milestones, actions: q.actions, deliverables: q.deliverables, readyFiles: q.readyFiles, attentionPriority: priority }).from(q)
    .where(attentionOnly ? sql`${priority}>0` : undefined)
    .orderBy(...(attentionOnly ? [asc(priority)] : attentionFirst ? [asc(sql`CASE WHEN ${priority}=0 THEN 10 ELSE ${priority} END`)] : []), sql`${q.targetDate} IS NULL`, asc(q.targetDate), asc(q.name), asc(q.id)).limit(cap + 1).offset(offset);
  return { items: rows.slice(0, cap).map(({ milestones, attentionPriority: rank, ...row }) => ({ ...row,
    milestones: milestones.total ? { ...milestones, percentage: Math.round(milestones.finished / milestones.total * 100) } : null,
    attentionReason: PROJECT_ATTENTION_LABELS[rank] || null,
  })), hasMore: rows.length > cap };
}

// Review/approved outputs, plus dated work through fourteen Client calendar
// days ahead (including missed targets). This is not Action overdue semantics.
export async function homeDeliverables(db, actor, { now = new Date(), condition, today: suppliedToday } = {}) {
  if (!internal(actor)) return { items: [], hasMore: false };
  const today = suppliedToday == null ? await projectToday(db, actor, now, condition)
    : typeof suppliedToday?.then === 'function' ? await suppliedToday : suppliedToday;
  const rows = await db.select({ id: d.id, title: d.title, status: d.status, targetDate: d.targetDate,
    projectId: p.id, projectName: p.name, clientName: c.name }).from(d)
    .innerJoin(p, and(eq(p.workspaceId, d.workspaceId), eq(p.id, d.projectId)))
    .innerJoin(c, and(eq(c.workspaceId, p.workspaceId), eq(c.id, p.clientId)))
    .where(and(deliverableReadCondition(actor), condition, sql`${d.status} NOT IN ('delivered','cancelled')`,
      sql`(${d.status} IN ('client_review','approved','internal_review') OR ${d.targetDate}<=date(${today}, '+14 days'))`))
    .orderBy(sql`CASE ${d.status} WHEN 'client_review' THEN 0 WHEN 'approved' THEN 1 WHEN 'internal_review' THEN 2 ELSE 3 END`,
      sql`${d.targetDate} IS NULL`, asc(d.targetDate), asc(d.id)).limit(HOME_DELIVERABLE_LIMIT + 1);
  return { items: rows.slice(0, HOME_DELIVERABLE_LIMIT), hasMore: rows.length > HOME_DELIVERABLE_LIMIT };
}

// Only successful deliveries/uploads in the past fourteen elapsed days.
// Current titles are selected from current readable records, never from raw
// activity metadata. No R2 binding, uploader identity or storage authority is
// needed to compose this read.
export async function recentOutputs(db, actor, { now = new Date() } = {}) {
  if (!internal(actor)) return { items: [], hasMore: false };
  const recent = and(eq(e.workspaceId, actor.workspaceId), sql`${e.occurredAt}>=${new Date(now.getTime() - 14 * 86400000).toISOString()}`, sql`${e.occurredAt}<=${now.toISOString()}`);
  const fields = { eventId: e.id, occurredAt: e.occurredAt, projectId: p.id, projectName: p.name, clientName: c.name };
  const [deliveries, files] = await Promise.all([
    db.select({ ...fields, id: d.id, title: d.title }).from(e)
      .innerJoin(d, and(eq(d.workspaceId, e.workspaceId), eq(d.id, e.subjectId)))
      .innerJoin(p, and(eq(p.workspaceId, d.workspaceId), eq(p.id, d.projectId)))
      .innerJoin(c, and(eq(c.workspaceId, p.workspaceId), eq(c.id, p.clientId)))
      .where(and(recent, eq(e.subjectType, 'deliverable'), eq(e.eventType, 'DELIVERABLE_STATUS_CHANGED'),
        sql`json_extract(${e.metadataJson},'$.to')='delivered'`, eq(d.status, 'delivered'), deliverableReadCondition(actor)))
      .orderBy(desc(e.occurredAt), desc(e.id)).limit(HOME_RECENT_LIMIT + 1),
    db.select({ ...fields, id: f.id, title: f.filename }).from(e)
      .innerJoin(f, and(eq(f.workspaceId, e.workspaceId), eq(f.id, e.subjectId)))
      .innerJoin(l, and(eq(l.workspaceId, f.workspaceId), eq(l.assetId, f.id)))
      .innerJoin(p, and(eq(p.workspaceId, l.workspaceId), eq(p.id, l.projectId)))
      .innerJoin(c, and(eq(c.workspaceId, p.workspaceId), eq(c.id, p.clientId)))
      .where(and(recent, eq(e.subjectType, 'file'), eq(e.eventType, 'FILE_UPLOADED'), fileReadCondition(actor, { ready: true })))
      .orderBy(desc(e.occurredAt), desc(e.id)).limit(HOME_RECENT_LIMIT + 1),
  ]);
  const rows = [...deliveries.map(row => ({ ...row, kind: 'delivered' })), ...files.map(row => ({ ...row, kind: 'file' }))]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.eventId.localeCompare(a.eventId));
  return { items: rows.slice(0, HOME_RECENT_LIMIT), hasMore: rows.length > HOME_RECENT_LIMIT };
}

export function homeProjection(db, actor, options = {}) {
  return timedNavigation('home', () => readTogether(db, db => readHomeProjection(db, actor, options)));
}
async function readHomeProjection(db, actor, { now = new Date() } = {}) {
  if (!internal(actor)) return { actions: Object.fromEntries(HOME_ACTION_VIEWS.map(view => [view, { items: [], hasMore: false }])),
    projects: { items: [], hasMore: false }, deliverables: { items: [], hasMore: false }, recent: { items: [], hasMore: false } };
  // Keep the two independently authorized scopes fresh. A runtime-owned map
  // lets both scope reads and every projection enter one D1 batch. If stored
  // legacy timezone data is outside Intl's canonical list, discard only the
  // affected provisional results and repeat them with the exact scoped map.
  const common = commonActionToday(now, { directLookup: true });
  const actionZonesRead = readableActionTimezones(db, actor);
  const projectZonesRead = projectTimezones(db, actor);
  const [actionZones, projectZones, initialActionSections, initialProjects, initialDeliverables, recent] = await Promise.all([
    actionZonesRead, projectZonesRead,
    Promise.all(HOME_ACTION_VIEWS.map(async view => {
      const result = await listActions(db, actor, { view }, { now, limit: HOME_ACTION_LIMIT, today: common.today });
      return [view, { items: result.items || [], hasMore: Boolean(result.hasMore) }];
    })),
    listProjectSummaries(db, actor, { attentionOnly: true, limit: HOME_PROJECT_LIMIT, now, today: common.today }),
    homeDeliverables(db, actor, { now, today: common.today }), recentOutputs(db, actor, { now }),
  ]);
  let actionFallback = null;
  if (!actionTimezonesCovered(actionZones, common.timezones)) {
    const exactToday = actionTodayCondition(now, actionZones);
    actionFallback = Promise.all(['overdue', 'today'].map(async view => {
      const result = await listActions(db, actor, { view }, { now, limit: HOME_ACTION_LIMIT, today: exactToday });
      return [view, { items: result.items || [], hasMore: Boolean(result.hasMore) }];
    }));
  }
  const projectFallback = !actionTimezonesCovered(projectZones, common.timezones) ? (() => {
    const exactToday = actionTodayCondition(now, projectZones);
    return Promise.all([
      listProjectSummaries(db, actor, { attentionOnly: true, limit: HOME_PROJECT_LIMIT, now, today: exactToday }),
      homeDeliverables(db, actor, { now, today: exactToday }),
    ]);
  })() : null;
  const [replacements, replacementProjects] = await Promise.all([actionFallback, projectFallback]);
  const actionSections = replacements
    ? [...initialActionSections.filter(([view]) => !['overdue', 'today'].includes(view)), ...replacements]
    : initialActionSections;
  const [projects, deliverables] = replacementProjects || [initialProjects, initialDeliverables];
  return { actions: Object.fromEntries(actionSections), projects, deliverables, recent };
}
