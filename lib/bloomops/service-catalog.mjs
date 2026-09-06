// The workspace service catalogue (A7): the departments a workspace works
// in, and the service types it can sell.
//
// One canonical definition
//
// The four departments and the five initial service types are declared once,
// here, and nowhere else. Two paths put them into a workspace and both read
// this file:
//
//   ensureWorkspaceServiceCatalog(db, workspaceId)
//     Drizzle, for a workspace that already has an id: tests, and any
//     future code path that creates a workspace at runtime.
//
//   catalogStatements({ workspaceSlug })
//     literal idempotent SQL, for lib/bloomops/bootstrap.mjs, whose plan is
//     handed to `wrangler d1 execute --file` against a remote database
//     where no JavaScript of ours is running. The staging deploy runs that
//     bootstrap on every push to main, so an existing workspace picks the
//     catalogue up there without a data migration.
//
// Both are idempotent by slug, and a test proves the two produce identical
// rows. Neither ever updates or removes a row it did not create: a
// workspace that has renamed "Ads" or deactivated "Kajabi" keeps its
// decision, because the defaults are a starting point and not a policy the
// product re-imposes.
//
// This is workspace-scoped configuration, not global data. Departments and
// service types both carry workspace_id, both are unique on (workspace_id,
// slug), and a service type's department is reached through the composite
// (workspace_id, department_id) foreign key, so no workspace can point at
// another workspace's department even with a foreign id in hand.
//
// What this file is not
//
// A7 does not build service-type administration: no catalogue CRUD, no
// pricing, no packages, no template binding. The catalogue exists so that a
// manager choosing what a client bought has a real list to choose from.
import { and, asc, eq } from 'drizzle-orm';
import { schema } from './db.mjs';

// ── the defaults ──────────────────────────────────────────────────────────

// docs/PRODUCT_SPEC.md and docs/phases/A7.md name these four. `position`
// is the order they are offered in, spaced so a later one can land between
// two without renumbering.
export const DEFAULT_DEPARTMENTS = [
  { slug: 'social', name: 'Social', position: 10 },
  { slug: 'ads', name: 'Ads', position: 20 },
  { slug: 'systems', name: 'Systems', position: 30 },
  { slug: 'operations', name: 'Operations', position: 40 },
];

// The five the phase asks for, and no more. PRODUCT_SPEC lists funnels,
// email sequences, automation, course builds, and integrations as further
// examples; those are deliverables inside a Systems engagement rather than
// things a client buys separately today, so seeding them would only make
// the picker longer. Operations deliberately has no default service type:
// it is where internal work lives, not something an agency sells.
export const DEFAULT_SERVICE_TYPES = [
  { slug: 'social-media-management', name: 'Social Media Management', department: 'social' },
  { slug: 'ads', name: 'Ads', department: 'ads' },
  { slug: 'ghl', name: 'GHL', department: 'systems' },
  { slug: 'kajabi', name: 'Kajabi', department: 'systems' },
  { slug: 'content-calendar', name: 'Content Calendar', department: 'social' },
];

// ── seeding through Drizzle ───────────────────────────────────────────────

// Give one workspace the default catalogue, and change nothing that is
// already there.
//
// Two passes, because a service type needs its department's id: the
// departments are reconciled first and read back, then the service types.
// Both compare on slug, which is the stable key; a row whose slug already
// exists is left exactly as found, whatever its name, department, or active
// flag now say.
export async function ensureWorkspaceServiceCatalog(db, workspaceId, { now = new Date() } = {}) {
  if (!workspaceId) throw new Error('ensureWorkspaceServiceCatalog needs a workspace id');
  const iso = now.toISOString();

  const existingDepartments = await db
    .select({ id: schema.departments.id, slug: schema.departments.slug })
    .from(schema.departments)
    .where(eq(schema.departments.workspaceId, workspaceId));
  const departmentIds = new Map(existingDepartments.map((d) => [d.slug, d.id]));
  const newDepartments = DEFAULT_DEPARTMENTS.filter((d) => !departmentIds.has(d.slug));
  if (newDepartments.length > 0) {
    await db.insert(schema.departments).values(
      newDepartments.map((d) => ({ workspaceId, name: d.name, slug: d.slug, position: d.position, active: true, createdAt: iso, updatedAt: iso })),
    );
    const refreshed = await db
      .select({ id: schema.departments.id, slug: schema.departments.slug })
      .from(schema.departments)
      .where(eq(schema.departments.workspaceId, workspaceId));
    for (const row of refreshed) departmentIds.set(row.slug, row.id);
  }

  const existingTypes = await db
    .select({ slug: schema.serviceTypes.slug })
    .from(schema.serviceTypes)
    .where(eq(schema.serviceTypes.workspaceId, workspaceId));
  const typeSlugs = new Set(existingTypes.map((t) => t.slug));
  const newTypes = DEFAULT_SERVICE_TYPES.filter((t) => !typeSlugs.has(t.slug));
  if (newTypes.length > 0) {
    await db.insert(schema.serviceTypes).values(
      newTypes.map((t) => ({
        workspaceId,
        name: t.name,
        slug: t.slug,
        // Always this workspace's own department. A default whose
        // department is somehow missing is stored unattached rather than
        // borrowed from anywhere else.
        departmentId: departmentIds.get(t.department) || null,
        description: null,
        active: true,
        createdAt: iso,
        updatedAt: iso,
      })),
    );
  }

  return { departmentsAdded: newDepartments.length, serviceTypesAdded: newTypes.length };
}

// ── seeding as literal SQL ────────────────────────────────────────────────

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function literal(value) {
  const s = String(value);
  if (CONTROL_CHARACTERS.test(s)) throw new Error('Catalogue values may not contain control characters.');
  return `'${s.replace(/'/g, "''")}'`;
}

// The same catalogue as statements a plain SQL runner can apply, each
// guarded so a second pass inserts nothing. The workspace is named by slug
// because the bootstrap plan may be creating it in the same file.
//
// `ids` supplies the ids for the rows this pass may create, so a caller can
// make the output deterministic; anything not supplied is generated by the
// database's own default.
export function catalogStatements({ workspaceSlug, now = new Date(), ids = {} } = {}) {
  const ws = literal(String(workspaceSlug || ''));
  const iso = literal(now.toISOString());
  const statements = [];

  for (const d of DEFAULT_DEPARTMENTS) {
    const slug = literal(d.slug);
    const id = ids[`department:${d.slug}`];
    statements.push(
      `INSERT INTO departments (${id ? 'id, ' : ''}workspace_id, name, slug, position, active, created_at, updated_at) ` +
        `SELECT ${id ? `${literal(id)}, ` : ''}w.id, ${literal(d.name)}, ${slug}, ${d.position}, 1, ${iso}, ${iso} ` +
        `FROM workspaces w WHERE w.slug = ${ws} ` +
        `AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.workspace_id = w.id AND d.slug = ${slug});`,
    );
  }

  for (const t of DEFAULT_SERVICE_TYPES) {
    const slug = literal(t.slug);
    const department = literal(t.department);
    const id = ids[`service_type:${t.slug}`];
    statements.push(
      `INSERT INTO service_types (${id ? 'id, ' : ''}workspace_id, name, slug, department_id, active, created_at, updated_at) ` +
        `SELECT ${id ? `${literal(id)}, ` : ''}w.id, ${literal(t.name)}, ${slug}, ` +
        `(SELECT d.id FROM departments d WHERE d.workspace_id = w.id AND d.slug = ${department}), 1, ${iso}, ${iso} ` +
        `FROM workspaces w WHERE w.slug = ${ws} ` +
        `AND NOT EXISTS (SELECT 1 FROM service_types s WHERE s.workspace_id = w.id AND s.slug = ${slug});`,
    );
  }

  return statements;
}

// ── reading the catalogue ─────────────────────────────────────────────────

export async function listDepartments(db, workspaceId, { activeOnly = false } = {}) {
  if (!workspaceId) return [];
  const d = schema.departments;
  const where = activeOnly ? and(eq(d.workspaceId, workspaceId), eq(d.active, true)) : eq(d.workspaceId, workspaceId);
  return db
    .select({ id: d.id, name: d.name, slug: d.slug, position: d.position, active: d.active })
    .from(d)
    .where(where)
    .orderBy(asc(d.position), asc(d.name));
}

// What a manager may choose from when adding a service. Only this
// workspace's own types, with their department name already resolved so no
// screen has to join anything. `activeOnly` is what the create form uses: a
// deactivated type stays readable on the engagements that already reference
// it, and is never offered for a new one.
export async function listServiceTypes(db, workspaceId, { activeOnly = false } = {}) {
  if (!workspaceId) return [];
  const t = schema.serviceTypes;
  const where = activeOnly ? and(eq(t.workspaceId, workspaceId), eq(t.active, true)) : eq(t.workspaceId, workspaceId);
  return db
    .select({
      id: t.id,
      name: t.name,
      slug: t.slug,
      active: t.active,
      departmentId: t.departmentId,
      departmentName: schema.departments.name,
      departmentPosition: schema.departments.position,
    })
    .from(t)
    .leftJoin(schema.departments, and(eq(schema.departments.id, t.departmentId), eq(schema.departments.workspaceId, t.workspaceId)))
    .where(where)
    .orderBy(asc(t.name));
}

// One service type of this workspace, or null. A type from another
// workspace is indistinguishable from an id that never existed, because
// the workspace is in the WHERE clause rather than compared afterwards.
export async function findServiceType(db, workspaceId, serviceTypeId) {
  const id = String(serviceTypeId || '').trim();
  if (!workspaceId || !id) return null;
  const types = await listServiceTypes(db, workspaceId);
  return types.find((t) => t.id === id) || null;
}
