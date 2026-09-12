// Shared bounded specialist reads over Work Core. No specialist state or grants.
import { and, asc, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { readTogether } from './read-batch.mjs';
import { timedNavigation } from './navigation-timing.mjs';
import { INTERNAL_ROLES } from './authorization.mjs';
import { projectReadCondition } from './project-access.mjs';
import { PROJECT_STATUSES } from './project-values.mjs';
import { actionTimezonesCovered, actionTodayCondition, commonActionToday } from './actions.mjs';
import { homeDeliverables, listProjectSummaries, projectTimezones, projectToday } from './work-projections.mjs';

export const DEPARTMENT_WORK_PAGE_SIZE = 50;
export const DEPARTMENT_WORK_FACET_LIMIT = 200;
const p = schema.projects, c = schema.clients, s = schema.serviceEngagements, t = schema.serviceTypes;

// The stable department slug identifies canonical catalog truth. Names,
// Project department metadata, and ownership/department membership do not.
export function departmentProjectCondition(department) {
  if (!['systems', 'ads'].includes(department)) return sql`0`;
  return sql`EXISTS (SELECT 1 FROM service_engagements se
    JOIN service_types st ON st.id=se.service_type_id AND st.workspace_id=se.workspace_id
    JOIN departments dept ON dept.id=st.department_id AND dept.workspace_id=st.workspace_id
    WHERE se.id=${p.serviceEngagementId} AND se.workspace_id=${p.workspaceId}
      AND se.client_id=${p.clientId} AND dept.slug=${department})`;
}

export function normalizeDepartmentWorkFilters(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['clientId', 'serviceEngagementId', 'status', 'page'].includes(key))
    || Object.values(input).some(value => typeof value !== 'string')) return { ok: false };
  const { clientId = '', serviceEngagementId = '', status = 'active', page = '1' } = input;
  if (![clientId, serviceEngagementId].every(id => id.length <= 200 && !/[\x00-\x20\x7f]/.test(id))
    || !['active', 'all', ...PROJECT_STATUSES].includes(status)
    || !/^[1-9]\d{0,4}$/.test(page) || Number(page) > 10000) return { ok: false };
  return { ok: true, filters: { clientId, serviceEngagementId, status, page: Number(page) } };
}

// Facets come only from readable eligible Projects, including closed work.
// A narrow Project assignment provides display context, never Client/Service
// management authority. Selected readable values beyond the cap stay usable.
async function facet(department, db, actor, kind, { clientId, serviceEngagementId }) {
  const id = kind === 'clients' ? c.id : s.id;
  const fields = kind === 'clients' ? { id, name: c.name } : { id, name: t.name, clientName: c.name };
  const selected = kind === 'clients' ? clientId : serviceEngagementId;
  const scope = and(projectReadCondition(actor), departmentProjectCondition(department),
    kind === 'services' && clientId ? eq(p.clientId, clientId) : undefined);
  const query = extra => db.selectDistinct(fields).from(p)
    .innerJoin(c, and(eq(c.id, p.clientId), eq(c.workspaceId, p.workspaceId)))
    .innerJoin(s, and(eq(s.id, p.serviceEngagementId), eq(s.workspaceId, p.workspaceId)))
    .innerJoin(t, and(eq(t.id, s.serviceTypeId), eq(t.workspaceId, s.workspaceId)))
    .where(and(scope, extra)).orderBy(asc(c.name), ...(kind === 'services' ? [asc(t.name)] : []), asc(id));
  const rows = await query().limit(DEPARTMENT_WORK_FACET_LIMIT + 1);
  const items = rows.slice(0, DEPARTMENT_WORK_FACET_LIMIT);
  if (selected && !items.some(row => row.id === selected)) {
    const [row] = await query(eq(id, selected)).limit(1);
    if (!row) return null;
    items.push(row);
  }
  return { items, hasMore: rows.length > DEPARTMENT_WORK_FACET_LIMIT };
}

export function departmentWorkProjection(department, db, actor, input = {}, options = {}) {
  if (!['systems', 'ads'].includes(department)) return Promise.resolve({ ok: false });
  return timedNavigation(department, () => readTogether(db, db => readDepartmentWorkProjection(department, db, actor, input, options)));
}
async function readDepartmentWorkProjection(department, db, actor, input, { now = new Date() } = {}) {
  const normalized = normalizeDepartmentWorkFilters(input);
  if (!normalized.ok) return normalized;
  const { filters } = normalized;
  if (actor?.status !== 'active' || !['workspace', 'assigned'].includes(actor.scope?.kind) || !INTERNAL_ROLES.includes(actor.role)) {
    return { ok: false };
  }
  const condition = and(departmentProjectCondition(department), filters.clientId ? eq(p.clientId, filters.clientId) : undefined,
    filters.serviceEngagementId ? eq(p.serviceEngagementId, filters.serviceEngagementId) : undefined,
    filters.status === 'active' ? sql`${p.status} NOT IN ('completed','cancelled','archived')`
      : filters.status === 'all' ? undefined : eq(p.status, filters.status));
  const readData = today => Promise.all([
    listProjectSummaries(db, actor, { condition, attentionFirst: true, execution: true, page: filters.page, limit: DEPARTMENT_WORK_PAGE_SIZE, now, today }),
    homeDeliverables(db, actor, { condition, now, today }),
  ]);
  // An ordinary unfiltered visit has no selected ID to validate. Its own live
  // predicates authorize every data read, so options need not gate it. Keep
  // the selected-ID validation path (including out-of-cap choices) unchanged.
  const unfiltered = !filters.clientId && !filters.serviceEngagementId;
  const common = unfiltered ? commonActionToday(now) : null;
  const [[clients, services], projectZones, initialData] = await Promise.all([
    Promise.all([facet(department, db, actor, 'clients', filters), facet(department, db, actor, 'services', filters)]),
    unfiltered ? projectTimezones(db, actor, condition) : null,
    unfiltered ? readData(common.today) : null,
  ]);
  if (!clients || !services) return { ok: false };
  let data = initialData;
  if (unfiltered && !actionTimezonesCovered(projectZones, common.timezones)) {
    data = await readData(actionTodayCondition(now, projectZones));
  }
  const [projects, deliverables] = data || await readData(projectToday(db, actor, now, condition));
  return { ok: true, filters, projects, deliverables, options: { clients, services } };
}
