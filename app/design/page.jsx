import { getCloudflareContext } from '@opennextjs/cloudflare';
import { notFound } from 'next/navigation';
import { isDevelopment } from '@/lib/bloomops/auth-config.mjs';
import { requireShell } from '@/lib/bloomops/shell-server.mjs';
import { INTERNAL_NAV } from '@/lib/bloomops/navigation.mjs';
import { NavList } from '@/components/bloomops/InternalNav';
import { TabBar } from '@/components/bloomops/MobileNav';
import { Button, EmptyState, Facts, Field, Notice, PageHeader, Status, Surface, fieldAria } from '@/components/bloomops/Primitives';
import { ActivityRow, ClientFilters, ClientHealth, ClientRow, ClientStatus, ClientTabs, ContactRow } from '@/components/bloomops/Clients';

// The developer design gallery: the primitives A5 introduced, in their
// states, for review at every width. Developer-only: it renders in
// development, or where BLOOMOPS_DESIGN_GALLERY=1 is set on purpose, and
// only for a signed-in internal member. Everywhere else it does not exist.
// `?section=<id>` shows one section alone, for capture.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Design gallery' };

const SECTIONS = [
  ['palette', 'Palette'],
  ['type', 'Typography'],
  ['surfaces', 'Surfaces'],
  ['buttons', 'Buttons'],
  ['forms', 'Forms'],
  ['status', 'Status'],
  ['navigation', 'Navigation'],
  ['clients', 'Clients'],
  ['states', 'States'],
];

// Fixtures for the Clients section only, so the components can be seen in
// isolation. They exist in this developer-only file and nowhere else: no
// BloomOps screen ever renders a sample client.
const GALLERY_CLIENTS = [
  { id: 'gallery-1', name: 'Northwind Studio', relationshipStatus: 'active', health: 'on_track', startDate: '2026-03-02', owner: { name: 'Priya Manel' }, primaryContact: { name: 'Rae Ellis' } },
  { id: 'gallery-2', name: 'Harbour & Co Physiotherapy', relationshipStatus: 'onboarding', health: 'needs_attention', startDate: null, owner: null, primaryContact: { name: 'Sam Oyelaran' } },
  { id: 'gallery-3', name: 'Vela', relationshipStatus: 'draft', health: 'at_risk', startDate: null, owner: { name: 'Priya Manel' }, primaryContact: null },
];

const GALLERY_CONTACT = { id: 'gc-1', name: 'Rae Ellis', title: 'Operations lead', email: 'rae@example.com', phone: '+61 2 5550 0100', isPrimary: true, linked: false };
const GALLERY_CONTACT_2 = { id: 'gc-2', name: 'Sam Oyelaran', title: null, email: 'sam@example.com', phone: null, isPrimary: false, linked: true };

const GALLERY_EVENTS = [
  { id: 'ge-1', title: 'Health changed', detail: 'From On Track to Needs Attention.', actor: 'Priya Manel', occurredAt: '2026-09-04T09:12:00.000Z' },
  { id: 'ge-2', title: 'Primary contact changed', detail: 'Rae Ellis is now the primary contact.', actor: 'Priya Manel', occurredAt: '2026-09-02T14:40:00.000Z' },
  { id: 'ge-3', title: 'Client created', detail: null, actor: 'Ellen Bright', occurredAt: '2026-08-28T08:00:00.000Z' },
];

const PALETTE = [
  ['Cloud', '#F8FAFF'],
  ['Snow', '#FFFFFF'],
  ['Mist', '#F0F3FC'],
  ['Soft Lilac', '#EEEAFB'],
  ['Ink', '#18152B'],
  ['Deep Ink', '#100D22'],
  ['Ink Soft', '#5D5873'],
  ['Ink Faint', '#86819C'],
  ['Electric Sky', '#6EC8FF'],
  ['Bubblegum', '#FF82C8'],
  ['Lavender', '#A99BFF'],
  ['Aqua', '#75E6DE'],
  ['Lemon Cream', '#FFE98A'],
  ['Peach', '#FFB49C'],
  ['Ice', '#CFF8FF'],
  ['Success', '#56BFA1'],
  ['Warning', '#E5A94C'],
  ['Error', '#D85C72'],
  ['Info', '#5D90D9'],
  ['Link / focus', '#3B69BD'],
];

function galleryEnabled() {
  let env = {};
  try {
    env = getCloudflareContext().env || {};
  } catch {}
  return isDevelopment(env) || String(env.BLOOMOPS_DESIGN_GALLERY || '') === '1';
}

function Section({ id, title, only, children }) {
  if (only && only !== id) return null;
  return (
    <section id={id} className="bo-gallery-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="bo-h2" style={{ marginBottom: 16 }}>
        {title}
      </h2>
      <div className="bo-stack">{children}</div>
    </section>
  );
}

export default async function DesignGalleryPage({ searchParams }) {
  if (!galleryEnabled()) notFound();
  await requireShell('internal');
  const params = (await searchParams) || {};
  const only = SECTIONS.some(([id]) => id === params.section) ? params.section : null;

  return (
    <div className="bo-root">
      <main id="main" className="bo-page">
        <PageHeader title="Design gallery" subtitle="The BloomOps primitives introduced in A5, in every state, for review at 1440, 1024, 768, 390, and 320." />
        <nav className="bo-gallery-nav" aria-label="Sections">
          <a href="/design" aria-current={only ? undefined : 'page'}>
            All
          </a>
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`/design?section=${id}`} aria-current={only === id ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>

        <Section id="palette" title="Palette" only={only}>
          <p className="bo-small">Semantic colour sits beside a label or outlines a control; it is never small text on its own.</p>
          <div className="bo-swatches">
            {PALETTE.map(([name, hex]) => (
              <div key={name} className="bo-swatch">
                <div className="bo-swatch-chip" style={{ background: hex }} />
                <span className="bo-strong">{name}</span>
                <span className="bo-soft bo-num">{hex}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="type" title="Typography" only={only}>
          <p className="bo-display bo-display-lg">Bricolage Grotesque for display.</p>
          <p className="bo-display">A page title at 32px, tracking −0.02em.</p>
          <p className="bo-h2">A section heading at 20px.</p>
          <p className="bo-lede">A lede in Inter at 16px, Ink Soft, for the sentence under a title that says what the page is for.</p>
          <p className="bo-body">Body copy in Inter at 15px, Ink, line height 1.6. Long enough to read for hours without fatigue, short enough on the line to scan. Figures stay aligned where it helps: 1,204 / 88 / 3.</p>
          <p className="bo-small">Small text at 13.5px in Ink Soft for metadata. No monospace anywhere a person reads.</p>
        </Section>

        <Section id="surfaces" title="Surfaces" only={only}>
          <div className="bo-gallery-grid">
            <Surface>
              <p className="bo-h3">Snow</p>
              <p className="bo-small">The default container, when a group of facts needs an edge.</p>
            </Surface>
            <Surface tone="mist">
              <p className="bo-h3">Mist</p>
              <p className="bo-small">Secondary grouping and previews.</p>
            </Surface>
            <Surface tone="tint" raised>
              <p className="bo-h3">Tint, raised</p>
              <p className="bo-small">Rare emphasis. The active navigation item uses the same tint.</p>
            </Surface>
          </div>
          <p className="bo-small">Most of a page is not in a surface at all: rows separated by hairlines carry operational lists.</p>
          <ul className="bo-rows" aria-label="Example rows">
            {['A row with a title and a line of metadata', 'Another row'].map((title) => (
              <li key={title} className="bo-row">
                <span className="bo-row-text">
                  <span className="bo-row-title">{title}</span>
                  <span className="bo-row-meta" style={{ display: 'block' }}>
                    Metadata sits under the title in Ink Soft.
                  </span>
                </span>
                <span className="bo-row-end">
                  <Status label="Active" tone="success" glyph="check" />
                </span>
              </li>
            ))}
          </ul>
          <Facts items={[['Label', 'Value'], ['A longer label', 'Facts are label and value pairs for identity and state.']]} />
        </Section>

        <Section id="buttons" title="Buttons" only={only}>
          <div className="bo-cluster">
            <Button variant="primary">Primary</Button>
            <Button>Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <div className="bo-cluster">
            <Button variant="primary" loading>
              Loading
            </Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <Button size="sm" variant="ghost" icon="plus">
              With icon
            </Button>
          </div>
          <p className="bo-small">44px targets, 1px press, visible focus. Small buttons return to 44px on touch screens.</p>
        </Section>

        <Section id="forms" title="Forms" only={only}>
          <div className="bo-stack" style={{ maxWidth: 420 }}>
            <Field id="g-email" label="Email address" hint="A hint explains what goes here.">
              <input {...fieldAria({ id: 'g-email', hint: true })} className="bo-control" type="email" placeholder="name@example.com" readOnly />
            </Field>
            <Field id="g-error" label="With an error" error="Enter an email address, like name@example.com.">
              <input {...fieldAria({ id: 'g-error', error: true })} className="bo-control" type="email" defaultValue="not-an-address" readOnly />
            </Field>
            <Field id="g-select" label="Role">
              <select {...fieldAria({ id: 'g-select' })} className="bo-control" defaultValue="team_member">
                <option value="team_member">Team Member</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Field id="g-disabled" label="Disabled">
              <input {...fieldAria({ id: 'g-disabled' })} className="bo-control" type="text" defaultValue="Read only" disabled />
            </Field>
            <Notice tone="error">A notice for an outcome the person must read.</Notice>
            <Notice tone="success">Saved.</Notice>
          </div>
        </Section>

        <Section id="status" title="Status" only={only}>
          <div className="bo-cluster">
            <Status label="Neutral" />
            <Status label="Active" tone="success" glyph="check" />
            <Status label="Waiting" tone="info" glyph="clock" />
            <Status label="Suspended" tone="warning" glyph="clock" />
            <Status label="Failed" tone="error" glyph="cross" />
            <Status label="Removed" glyph="dash" />
          </div>
          <p className="bo-small">Always a word beside the glyph. Used in rows where scanning matters; prose says the word plainly.</p>
        </Section>

        <Section id="navigation" title="Navigation" only={only}>
          <div className="bo-gallery-grid">
            <div style={{ maxWidth: 232 }}>
              <p className="bo-h3" style={{ marginBottom: 8 }}>
                Sidebar (from 1024px)
              </p>
              <NavList items={INTERNAL_NAV} active="clients" />
            </div>
            <div>
              <p className="bo-h3" style={{ marginBottom: 8 }}>
                Phone tab bar (below 768px)
              </p>
              <div className="bo-gallery-tabbar" style={{ maxWidth: 420, border: '1px solid var(--bo-border)', borderRadius: 10, overflow: 'hidden' }}>
                <TabBar items={INTERNAL_NAV} active="clients" />
              </div>
              <p className="bo-small" style={{ marginTop: 8 }}>
                Four destinations and More, which opens the other seven as a labelled sheet. Preview only; the real bar is fixed to the bottom of the phone screen.
              </p>
            </div>
          </div>
        </Section>

        <Section id="clients" title="Clients" only={only}>
          <p className="bo-small">A client is an ordinary operational record: hairline rows, two independent state markers, and facts. No cards, no material effects.</p>
          <div className="bo-cluster">
            <ClientStatus status="draft" />
            <ClientStatus status="onboarding" />
            <ClientStatus status="active" />
            <ClientStatus status="paused" />
            <ClientStatus status="completed" />
            <ClientStatus status="ended" />
          </div>
          <div className="bo-cluster" style={{ marginTop: 12 }}>
            <ClientHealth health="on_track" />
            <ClientHealth health="needs_attention" />
            <ClientHealth health="at_risk" />
          </div>
          <div style={{ marginTop: 24 }}>
            <ClientFilters active="active" counts={{ all: 12, draft: 2, onboarding: 3, active: 5, paused: 1, completed: 1, ended: 0 }} basePath="/design" />
            <ul className="bo-rows" aria-label="Clients (gallery)">
              {GALLERY_CLIENTS.map((client) => (
                <ClientRow key={client.id} client={client} />
              ))}
            </ul>
          </div>
          <div style={{ marginTop: 24 }}>
            <ClientTabs clientId="gallery-1" active="overview" />
            <ul className="bo-rows" aria-label="Contacts (gallery)">
              <ContactRow contact={GALLERY_CONTACT} actions={<Button size="sm">Edit</Button>} />
              <ContactRow contact={GALLERY_CONTACT_2} actions={<Button size="sm">Make primary</Button>} />
            </ul>
          </div>
          <ol className="bo-activity" aria-label="Activity (gallery)" style={{ marginTop: 24 }}>
            {GALLERY_EVENTS.map((event) => (
              <ActivityRow key={event.id} event={event} />
            ))}
          </ol>
        </Section>

        <Section id="states" title="States" only={only}>
          <EmptyState title="Nothing here yet" actions={<Button variant="primary">Primary action</Button>}>
            <p>An empty state says what would be here, and what makes it appear.</p>
          </EmptyState>
          <Surface tone="mist" padding="lg" className="bo-page-narrow">
            <p className="bo-body">A limited state: this area is open to some people and not to you. It says so and describes nothing.</p>
          </Surface>
          <div className="bo-cluster">
            <Button variant="primary" loading>
              Working
            </Button>
            <span className="bo-small">Loading is a spinner in the control that started it, never a whole-page block.</span>
          </div>
          <div className="bo-toast bo-toast-info" style={{ maxWidth: 440 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span className="bo-toast-text">A toast confirms an outcome and goes away.</span>
          </div>
        </Section>
      </main>
    </div>
  );
}
