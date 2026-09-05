import { getAccessOrProblem, json } from './bloomops/access.mjs';
import { legacyRole } from './bloomops/membership.mjs';
import { DEFAULT_ENGINE_SETTINGS } from './engine-prompts.mjs';

// Every inherited data route resolves the caller's workspace here and scopes
// all of its queries to it. Since A3 that answer comes from the Better Auth
// session plus the caller's ACTIVE BloomOps workspace membership, resolved
// fresh on each request: no active membership, no workspace, whatever cookie
// the request carries. The workspace string the inherited tables key on is
// the BloomOps workspace slug, and the two-value role the inherited routes
// branch on is derived from the membership role (Owner and Admin are
// "admin", everyone else is "user").
export async function getWorkspace(req, { env = null } = {}) {
  const { access } = await getAccessOrProblem(req, { env });
  if (!access || !access.membership || !access.workspace) return null;
  return {
    workspace: access.workspace.slug,
    role: legacyRole(access.membership.role),
    workspaceId: access.workspace.id,
    membershipId: access.membership.id,
    membershipRole: access.membership.role,
    userId: access.user.id,
    email: access.user.email,
  };
}

export function unauthorized() {
  return json({ error: 'Sign in to continue.' }, 401);
}

export function forbidden() {
  return json({ error: 'Your role cannot make this change.' }, 403);
}

// The Hive: everything a workspace has told the product about itself.
//
// Four copies of this read had grown across the codebase, each with its own
// idea of what happens when the row is missing or the JSON is broken. Since
// every AI prompt is about to start reading its offer and its rules from here,
// they need to be reading the same thing.
export async function loadEngineSettings(db, workspace) {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'engine'`)
    .bind(workspace)
    .first();
  let stored = {};
  if (row?.value) { try { stored = JSON.parse(row.value); } catch {} }
  return { ...DEFAULT_ENGINE_SETTINGS, ...stored };
}
