// Which shell a request gets, and whether it gets one at all.
//
// BloomOps has two shells: the internal application (Owner, Admin, Project
// Manager, Team Member) and the client portal (Client). They are separate
// route trees with separate layouts; nothing here hides parts of one shell
// to make the other. A page asks resolveShellAccess for the area it lives
// in and follows the decision: redirect, not found, or render with the
// access and the loaded actor.
//
// Everything is decided from the same A4 primitives every route uses
// (lib/bloomops/access.mjs, lib/bloomops/authorization.mjs), fresh on
// every request: a suspended or removed membership gets no shell on its
// very next request whatever its identity cookie says, a Client never
// gets the internal shell, and an internal person never gets the portal.
import { getAccessOrProblem, getActor } from './access.mjs';
import { INTERNAL_ROLES, evaluate } from './authorization.mjs';

export const AREAS = ['internal', 'portal', 'legacy'];

export const SIGN_IN_PATH = '/sign-in';
export const INTERNAL_HOME = '/';
export const PORTAL_HOME = '/portal';

// The shell a membership belongs to: 'internal', 'portal', or null when
// there is no active membership.
export function shellFor(access) {
  const role = access?.membership?.role;
  if (!role || !access.workspace) return null;
  if (role === 'client') return 'portal';
  if (INTERNAL_ROLES.includes(role)) return 'internal';
  return null;
}

// The pure decision, given what the request resolved to. `configured`
// false means the deployment cannot authenticate anybody; everything then
// goes to the sign-in screen, which explains.
export function routeDecision({ access, configured = true, actor = null }, area) {
  if (!AREAS.includes(area)) return { kind: 'not_found' };
  if (!configured) return { kind: 'redirect', to: SIGN_IN_PATH };
  if (!access) return { kind: 'redirect', to: SIGN_IN_PATH };
  const shell = shellFor(access);
  if (!shell) return { kind: 'redirect', to: access.selectedWorkspaceId ? '/workspaces' : SIGN_IN_PATH };
  if (area === 'portal') {
    return shell === 'portal' ? { kind: 'ok', shell } : { kind: 'redirect', to: INTERNAL_HOME };
  }
  if (shell !== 'internal') return { kind: 'redirect', to: PORTAL_HOME };
  if (area === 'legacy') {
    if (access.workspace.purpose === 'prospecting') return { kind: 'not_found' };
    // The inherited prospecting application is transitional and off the
    // navigation. Workspace administrators may still open it by address;
    // for everyone else it does not exist.
    if (!actor || !evaluate(actor, { action: 'legacy.prospecting' }).allowed) return { kind: 'not_found' };
  }
  return { kind: 'ok', shell };
}

// Resolve a request (a Request, Headers, or Next's headers()) for one area.
// Returns the decision with `access` and `actor` attached when rendering
// may proceed. The actor is loaded once here so pages can ask the engine
// further questions without another round trip.
export async function resolveShellAccess(source, { area, env = null } = {}) {
  const { access, configured } = await getAccessOrProblem(source, { env });
  const actor = access && access.membership ? await getActor(access) : null;
  const decision = routeDecision({ access, configured, actor }, area);
  return { ...decision, access: decision.kind === 'ok' ? access : null, actor: decision.kind === 'ok' ? actor : null };
}

// ── what a page shows, by the engine ──────────────────────────────────

// Team: the member directory and invitation management for people who
// hold members.manage; a calm limited view for everyone else. The limited
// view never loads the directory.
export function teamViewFor(actor) {
  return actor && evaluate(actor, { action: 'members.manage' }).allowed ? 'manage' : 'limited';
}

// Finance: a preview of the area for people who hold finance.view; a
// plain "not open to you" for everyone else, with nothing about the area
// beyond its name.
export function financeViewFor(actor) {
  return actor && evaluate(actor, { action: 'finance.view' }).allowed ? 'preview' : 'limited';
}

// One plain sentence per role, for Settings and the limited Team view.
// The policy itself lives in lib/bloomops/authorization.mjs; these only
// describe it.
export const ROLE_DESCRIPTIONS = {
  owner: 'Full access to everything in this workspace, including members, settings, and finance.',
  admin: 'Broad operational access, including members and settings. Finance access is granted separately.',
  project_manager: 'Delivery visibility and coordination across every client. No member administration or finance unless granted.',
  team_member: 'Access to the clients and services you are assigned to, and nothing outside them.',
  client: 'Your own work with the agency, in the client portal.',
};
