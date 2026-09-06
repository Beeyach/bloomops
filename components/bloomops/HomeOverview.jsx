import Link from 'next/link';
import { INTERNAL_NAV, navGroups } from '@/lib/bloomops/navigation.mjs';
import { plural } from '@/lib/bloomops/format.mjs';
import { Icon } from './Icons';

// Home, as two quiet lists. The first is real state read through the
// person's own scope (lib/bloomops/overview.mjs): what exists in the
// workspace right now, with an honest zero where nothing does. The second
// is the map of BloomOps: every area, what it is for, and whether it is
// live. No metrics, no charts, no sample activity.

function clientsLine(overview, scopeKind) {
  if (overview.clients > 0) return plural(overview.clients, 'client');
  return scopeKind === 'assigned' ? 'None assigned to you yet' : 'None yet';
}

function servicesLine(overview, scopeKind) {
  if (overview.engagements > 0) return `${plural(overview.engagements, 'service engagement')} in delivery`;
  return scopeKind === 'assigned' ? 'None assigned to you yet' : 'None yet';
}

function onboardingLine(overview) {
  return overview.onboardingOpen > 0 ? `${plural(overview.onboardingOpen, 'client')} with onboarding still open` : 'Nothing open';
}

function teamLine(team) {
  const people = plural(team.active, 'active member');
  return team.pendingInvitations > 0 ? `${people}, ${plural(team.pendingInvitations, 'open invitation')}` : people;
}

export function StateRows({ overview, scopeKind = 'workspace', LinkComponent = Link }) {
  const rows = [
    ['clients', 'Clients', clientsLine(overview, scopeKind)],
    ['onboarding', 'Onboarding', onboardingLine(overview)],
    ['work', 'Services', servicesLine(overview, scopeKind)],
  ];
  if (overview.team) rows.push(['team', 'Team', teamLine(overview.team)]);
  return (
    <ul className="bo-rows" aria-label="Workspace state">
      {rows.map(([key, title, line]) => {
        const item = INTERNAL_NAV.find((i) => i.key === key);
        return (
          <li key={key}>
            <LinkComponent href={item.href} className="bo-row">
              <Icon name={key} className="bo-nav-icon" />
              <span className="bo-row-text">
                <span className="bo-row-title">{title}</span>
                <span className="bo-row-meta bo-num" style={{ display: 'block' }}>
                  {line}
                </span>
              </span>
              <span className="bo-row-end">
                <Icon name="chevron-right" size={18} className="bo-soft" />
              </span>
            </LinkComponent>
          </li>
        );
      })}
    </ul>
  );
}

export function AreaMap({ LinkComponent = Link }) {
  const groups = navGroups(INTERNAL_NAV).filter((g) => g.key !== 'home');
  return (
    <ul className="bo-areas">
      {groups.flatMap((group) =>
        group.items.map((item) => (
          <li key={item.key} className="bo-row bo-row-wrap" style={{ alignItems: 'flex-start' }}>
            <span className="bo-row-text">
              <LinkComponent href={item.href} className="bo-row-title bo-link" style={{ textDecoration: 'none' }}>
                {item.label}
              </LinkComponent>
              <span className="bo-row-meta" style={{ display: 'block' }}>
                {item.purpose}
              </span>
            </span>
            <span className="bo-row-end">
              <span className="bo-availability">{item.availability === 'now' ? 'Available now' : 'Not available yet'}</span>
            </span>
          </li>
        )),
      )}
    </ul>
  );
}
