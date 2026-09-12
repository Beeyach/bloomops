import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { ROLE_DESCRIPTIONS } from '@/lib/bloomops/shell.mjs';
import { ROLE_LABELS } from '@/lib/bloomops/membership.mjs';
import { CAPABILITY_LABELS, listCapabilities, evaluate } from '@/lib/bloomops/authorization.mjs';
import { navItem } from '@/lib/bloomops/navigation.mjs';
import { Button, Facts, PageHeader, Section, Surface } from '@/components/bloomops/Primitives';
import SignOutButton from '@/app/sign-in/SignOutButton';

// Settings in A5 is narrow and true: who you are signed in as, which
// workspace you are in, what your role means, what you have been given
// access to, and the way out. The narrow GHL setup link requires template
// management authority; broad workspace/appearance preferences remain later work.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const { access, actor } = await requireShell('internal');
  const role = access.membership.role;
  const capabilities = listCapabilities(actor);
  return (
    <>
      <PageHeader title="Settings" subtitle={navItem('settings').purpose} />
      <div className="bo-page-narrow">
        <Section id="account" title="Account" className="bo-section-first">
          <Surface padding="lg">
            <Facts items={[['Name', access.user.name || 'Not set'], ['Email', access.user.email]]} />
            <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <SignOutButton />
            </div>
            <p className="bo-small" style={{ marginTop: 12 }}>
              Signing out ends this session on this device. You sign in again with a link sent to your email.
            </p>
          </Surface>
        </Section>
        <Section id="workspace" title="Workspace">
          <Surface padding="lg">
            <Facts items={[['Workspace', access.workspace.name], ['Your role', ROLE_LABELS[role] || role], ['What that means', ROLE_DESCRIPTIONS[role] || '']]} />
          </Surface>
        </Section>
        {evaluate(actor, { action: 'templates.manage' }).allowed && <Section id="ghl-setup" title="GHL builds">
          <p className="bo-body">Choose which Systems service types can start a GHL build.</p>
          <Button href="/settings/ghl-builds">Manage GHL build setup</Button>
        </Section>}
        <Section id="access" title="Your access">
          <Surface padding="lg">
            {capabilities.length === 0 ? (
              <p className="bo-body">No access beyond your role. Additional access, such as finance, can be granted when it is needed.</p>
            ) : (
              <ul className="bo-preview-list" style={{ marginTop: 0 }} aria-label="Granted access">
                {capabilities.map((key) => (
                  <li key={key}>
                    <span className="bo-dot" aria-hidden="true" />
                    <span>{CAPABILITY_LABELS[key] || key}</span>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </Section>
      </div>
    </>
  );
}
