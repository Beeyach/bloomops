import {and, eq, sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {pageReadCondition} from './page-access.mjs';
import {listActions} from './actions.mjs';
import {ACTION_STATUSES} from './action-values.mjs';
import {REQUEST_ID} from './workspaces.mjs';

export async function getPageWork(db, actor, id, input = {}) {
  if (!actor || !evaluate(actor, {action: 'action.list'}).allowed) return {ok: false, reason: 'not_found'};
  if (typeof id !== 'string' || !REQUEST_ID.test(id) || !input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(k => !['workspaceId', 'status', 'page'].includes(k)) || input.workspaceId !== actor.workspaceId ||
      !['', ...ACTION_STATUSES].includes(input.status || '') ||
      (input.page != null && !/^[1-9][0-9]{0,3}$/.test(String(input.page)))) return {ok: false, reason: 'invalid'};
  actor = {...actor}; input = {...input};
  const p = schema.workspacePages;
  const scope = and(eq(p.id, id), eq(p.workspaceId, actor.workspaceId), pageReadCondition(actor, p.id));
  const [page] = await db.select({id: p.id}).from(p).where(scope).limit(1);
  if (!page) return {ok: false, reason: 'not_found'};
  // Page revocation between the first read and this query cannot return rows.
  // This trusted composition option is never accepted by the Work HTTP API.
  const result = await listActions(db, {...actor}, {view: 'all', status: input.status || '', page: input.page || 1}, {
    limit: 50, scopeCondition: sql`EXISTS(SELECT 1 FROM ${p} WHERE ${scope})`,
  });
  if (!result.ok) return result;
  return {...result, items: result.items.map(({id, title, status, dueDate, assigneeName}) =>
    ({id, title, status, dueDate, assigneeName}))};
}
