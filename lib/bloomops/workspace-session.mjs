// Attach the current membership selection to Better Auth's own signed-cookie
// session lookup. Better Auth still owns verification, expiry and refresh.
// The additional result never enters its user/session DTOs. It is usable only
// by the awaited getAccess invocation that requested it, after BA succeeds.
import { AsyncLocalStorage } from 'node:async_hooks';
import { getTableColumns, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { workspaceAccessQuery } from './membership.mjs';

const reads = new AsyncLocalStorage();
const fields = { membership: getTableColumns(schema.workspaceMemberships), workspace: getTableColumns(schema.workspaces) };
const jsonRecord = columns => sql`json_object(${sql.join(Object.entries(columns).flatMap(([key, column]) => [sql.raw(`'${key}'`), column]), sql`, `)})`;
const selection = { access: sql`json_object('membership', ${jsonRecord(fields.membership)}, 'workspace', ${jsonRecord(fields.workspace)})` };

function decode(value) {
  if (value == null) return null;
  const raw = JSON.parse(value);
  return Object.fromEntries(Object.entries(fields).map(([kind, columns]) => [kind,
    Object.fromEntries(Object.entries(columns).map(([key, column]) => {
      if (!Object.hasOwn(raw[kind] || {}, key)) throw new Error('Incomplete workspace session result');
      const value = raw[kind][key];
      return [key, value === null ? null : column.mapFromDriverValue(value)];
    })),
  ]));
}

// A facade, never a patch to a shared database or Drizzle query object. The
// supported Drizzle relational findFirst/extras API preserves BA's original
// session where/columns/user join and all other reads and writes unchanged.
export function workspaceSessionDatabase(db) {
  const session = db.query.session;
  const query = Object.create(db.query);
  query.session = new Proxy(session, { get(target, key) {
    if (key !== 'findFirst') { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
    return async options => {
      const scope = reads.getStore();
      if (!scope || scope.binding !== db.$client || options?.with?.user !== true || options.extras) return target.findFirst(options);
      const result = await target.findFirst({ ...options, extras: session => ({
        boWorkspace: sql`(${workspaceAccessQuery(db, session.userId, { selection, workspaceId: scope.workspaceId,
          condition: sql`${session.expiresAt} >= ${Date.now()}` })})`.as('bo_workspace'),
      }) });
      if (!result) return result;
      const { boWorkspace, ...identity } = result;
      scope.capture = { sessionId: identity.id, userId: identity.userId, resolved: decode(boWorkspace) };
      return identity;
    };
  } });
  const facade = Object.create(db);
  Object.defineProperty(facade, 'query', { value: query });
  return facade;
}

export function readWorkspaceIdentity(db, work, { workspaceId = null } = {}) {
  return reads.run({ binding: db.$client, capture: null, workspaceId }, async () => {
    const identity = await work();
    const captured = reads.getStore().capture;
    // An unsupported adapter query shape keeps the ordinary membership read.
    // Database/decoding failures propagate; they are never retried here.
    const matched = identity && captured && identity.session.id === captured.sessionId && identity.user.id === captured.userId;
    return { identity, resolved: matched ? captured.resolved : undefined };
  });
}
