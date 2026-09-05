/* Reference snapshot copied from Beeyach/Bloomlab/apps/web/src/screens/DesignGallery.tsx for BloomOps visual implementation. Reference-only; not runtime code. */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import {
  Button,
  CallParticipant,
  ClientCaseCover,
  Cluster,
  ContactRow,
  contrastRatio,
  ExecutionEvent,
  ExecutionTrack,
  ExercisePrompt,
  Field,
  Grid,
  HoloMaterial,
  HoloTerritory,
  IconButton,
  IconClose,
  IconMore,
  IconPlus,
  IconSearch,
  InkSurface,
  Input,
  Inspector,
  InspectorSection,
  MASTERY_LABELS,
  MasteryBadge,
  motionClass,
  PipelineCard,
  Popover,
  PricingScopeItem,
  RewardReveal,
  Select,
  Sheet,
  SkillCard,
  Stack,
  Surface,
  Textarea,
  ToolPanel,
  usePrefersReducedMotion,
  WCAG_AA,
  WorkflowNode,
  colors,
  semanticColors,
  type Density,
  type HoloVariant,
  type MasteryState,
} from '@bloomlab/design-system';

import styles from './DesignGallery.module.css';

const SECTIONS = [
  ['palette', 'Palette'],
  ['type', 'Typography'],
  ['surfaces', 'Surfaces'],
  ['buttons', 'Buttons'],
  ['forms', 'Forms'],
  ['holo', 'Holo'],
  ['motion', 'Motion'],
  ['panels', 'Panels'],
  ['semantic', 'Semantic'],
] as const;

const MASTERY_STATES = Object.keys(MASTERY_LABELS) as MasteryState[];
const HOLO_VARIANTS: HoloVariant[] = ['soft', 'collectible', 'mastery', 'legendary'];

function grade(ratio: number): string {
  if (ratio >= WCAG_AA.text) return 'AA text';
  if (ratio >= WCAG_AA.largeText) return 'AA large';
  return 'fail';
}

/** `?section=<id>` shows one section alone, which makes per-section review and capture easy. */
const OnlySection = createContext<string | null>(null);

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const only = useContext(OnlySection);
  if (only && only !== id) return null;
  return (
    <Stack as="section" id={id} gap={5} className={styles.section} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.h2}>
        {title}
      </h2>
      {children}
    </Stack>
  );
}

/**
 * Developer surface behind `design_gallery` (off in production): every primitive and semantic
 * component in every state, so Phase 2 can be visually verified at all review widths.
 */
export default function DesignGallery() {
  const reduced = usePrefersReducedMotion();
  const [params] = useSearchParams();
  const only = params.get('section');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [progress, setProgress] = useState(0.35);
  const [rewardKey, setRewardKey] = useState(0);
  const [density, setDensity] = useState<Density>('medium');
  const [scope, setScope] = useState({ reminders: true, recovery: true, reporting: false });

  return (
    <OnlySection.Provider value={only}>
      <Stack as="article" gap={6} className={styles.screen} aria-labelledby="gallery-title">
        <p className={styles.back}>
          <Link to="/">← Bloomlab</Link>
        </p>
        <div>
          <h1 id="gallery-title" className={styles.title}>
            Design gallery
          </h1>
          <p className={styles.lede}>
            Every primitive and semantic component, every state. Reduced motion is currently{' '}
            <strong>{reduced ? 'on' : 'off'}</strong>.
          </p>
        </div>

        <Cluster as="nav" gap={2} className={styles.nav} aria-label="Sections">
          <Link to="/design" aria-current={only ? undefined : 'page'}>
            All
          </Link>
          {SECTIONS.map(([id, label]) => (
            <Link
              key={id}
              to={`/design?section=${id}`}
              aria-current={only === id ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </Cluster>

        <Section id="palette" title="Palette">
          <p className={styles.note}>
            Ratios are ink-on-colour (as a background) and colour-on-cloud (as text). Status is
            never colour alone, so semantic colours only need the non-text bar.
          </p>
          <Grid minColumn="9rem" gap={3}>
            {Object.entries({ ...colors, ...semanticColors }).map(([name, hex]) => {
              const onCloud = contrastRatio(hex, colors.cloud);
              const inkOn = contrastRatio(colors.ink, hex);
              return (
                <div key={name} className={styles.swatch}>
                  <div className={styles.chip} style={{ background: hex }} />
                  <span className={styles.swatchName}>{name}</span>
                  <span className={styles.mono}>{hex}</span>
                  <span className={styles.ratios}>
                    <span>
                      ink on it {inkOn.toFixed(1)}:1 · {grade(inkOn)}
                    </span>
                    <span>
                      on cloud {onCloud.toFixed(1)}:1 · {grade(onCloud)}
                    </span>
                  </span>
                </div>
              );
            })}
          </Grid>
        </Section>

        <Section id="type" title="Typography">
          <p className={styles.display}>Something broke. Find out why.</p>
          <p className={styles.displayMd}>
            Bricolage Grotesque for display, Inter for the interface.
          </p>
          <p className={styles.body}>
            Inter carries lessons, prompts and interface copy. It stays readable in long sessions
            and never drops below sixteen pixels in inputs on mobile. Short sections, strong
            hierarchy, expandable depth.
          </p>
          <p className={styles.small}>
            Secondary text uses Ink Soft, which clears AA on every light surface.
          </p>
          <p className={styles.code}>
            IBM Plex Mono · wait: 1 day before appointment · SMS_SENT 10:00
          </p>
        </Section>

        <Section id="surfaces" title="Surfaces">
          <Grid minColumn="14rem" gap={4}>
            <Surface tone="snow">
              <h3 className={styles.h3}>Snow · elevation 0</h3>
              <p className={styles.note}>Default container.</p>
            </Surface>
            <Surface tone="mist" elevation={1}>
              <h3 className={styles.h3}>Mist · elevation 1</h3>
              <p className={styles.note}>Secondary grouping.</p>
            </Surface>
            <Surface tone="tint" elevation={2} interactive>
              <h3 className={styles.h3}>Tint · elevation 2 · interactive</h3>
              <p className={styles.note}>Hover lifts.</p>
            </Surface>
          </Grid>
          <InkSurface padding="lg">
            <Stack gap={3}>
              <h3 className={styles.h3}>Ink surface · roles invert</h3>
              <p className={styles.note}>
                Workspace for the Workflow Lab and Call Room. <a href="#surfaces">Links go aqua</a>.
              </p>
              <Cluster gap={2}>
                <Button variant="primary">Run it</Button>
                <Button>Inspect</Button>
                <Button variant="ghost">Later</Button>
                <IconButton label="More" icon={<IconMore />} variant="outlined" />
              </Cluster>
              <Field label="Test contact" hint="Existing or generated.">
                <Input placeholder="Maria Alvarez" />
              </Field>
            </Stack>
          </InkSurface>
        </Section>

        <Section id="buttons" title="Buttons">
          <Cluster gap={2}>
            <Button variant="primary">Run it</Button>
            <Button>Inspect history</Button>
            <Button variant="ghost">Skip</Button>
            <Button variant="danger">Walk away</Button>
          </Cluster>
          <Cluster gap={2}>
            <Button variant="primary" icon={<IconPlus />}>
              Add trigger
            </Button>
            <Button loading>Saving</Button>
            <Button disabled>Unavailable</Button>
            <Button size="sm">Small</Button>
            <Button size="sm" variant="primary">
              Small primary
            </Button>
          </Cluster>
          <Cluster gap={2}>
            <IconButton label="Search" icon={<IconSearch />} />
            <IconButton label="Close" icon={<IconClose />} variant="outlined" />
            <IconButton label="Pinned" icon={<IconMore />} pressed />
            <IconButton label="Disabled" icon={<IconPlus />} disabled />
          </Cluster>
          <p className={styles.note}>
            Tab through them: focus rings are 2px in the link blue on light surfaces and aqua on
            ink.
          </p>
        </Section>

        <Section id="forms" title="Forms">
          <Grid minColumn="16rem" gap={4}>
            <Field label="Business name" required hint="As the client writes it.">
              <Input placeholder="GlowHaus Med Spa" />
            </Field>
            <Field label="Phone" error="Phone is required for SMS reminders.">
              <Input inputMode="tel" defaultValue="" />
            </Field>
            <Field label="Pipeline">
              <Select defaultValue="consult">
                <option value="leads">Leads</option>
                <option value="consult">Consultations</option>
                <option value="closed">Closed</option>
              </Select>
            </Field>
            <Field label="Disabled">
              <Input disabled defaultValue="Read only" />
            </Field>
          </Grid>
          <Field label="Explain it to the owner" hint="No GHL jargon.">
            <Textarea placeholder="When someone books, they get a confirmation…" />
          </Field>
        </Section>

        <Section id="holo" title="Holo material">
          <p className={styles.note}>
            Move the pointer across a card, or press and drag on touch. Tilt maxes at 6°, settles in
            420 ms. Strong holo is reserved for territories, mastery, client cases, unlocks.
          </p>
          <Grid minColumn="14rem" gap={4}>
            {HOLO_VARIANTS.map((variant) => (
              <HoloMaterial key={variant} variant={variant} className={styles.holoDemo}>
                <h3>{variant}</h3>
                <p>
                  {variant === 'soft' && 'Independent skills, quiet lift.'}
                  {variant === 'collectible' && 'Territories and client cases.'}
                  {variant === 'mastery' && 'Mastered skills and completed territories.'}
                  {variant === 'legendary' && 'Boss Clients and Field Ready. Tasteful.'}
                </p>
              </HoloMaterial>
            ))}
          </Grid>
          <HoloMaterial
            variant="collectible"
            interactive={false}
            radius="md"
            className={styles.holoDemo}
          >
            <h3>Static</h3>
            <p>Same material with physics off, for dense lists.</p>
          </HoloMaterial>
        </Section>

        <Section id="motion" title="Motion">
          <Grid minColumn="14rem" gap={4}>
            <Stack gap={2}>
              <h3 className={styles.h3}>State · 120–200 ms</h3>
              <div className={`${styles.stateDemo} ${motionClass.state}`}>Hover me</div>
            </Stack>
            <Stack gap={2}>
              <h3 className={styles.h3}>Spatial · ≤ 300 ms</h3>
              <Button onClick={() => setSheetOpen(true)}>Open sheet</Button>
            </Stack>
            <Stack gap={2}>
              <h3 className={styles.h3}>Execution</h3>
              <ExecutionTrack progress={progress} label="Contact through workflow" />
              <Field label="Progress">
                <Input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(progress * 100)}
                  onChange={(event) => setProgress(Number(event.target.value) / 100)}
                />
              </Field>
            </Stack>
            <Stack gap={2}>
              <h3 className={styles.h3}>Reward · 1.5–3 s · skippable</h3>
              <Button onClick={() => setRewardKey((k) => k + 1)}>Replay</Button>
            </Stack>
          </Grid>
          <RewardReveal key={rewardKey} durationMs={2000}>
            <HoloMaterial variant="legendary" className={styles.reward}>
              <h3>Field Ready</h3>
              <p>47 capabilities demonstrated. Restrained, and you can skip it.</p>
            </HoloMaterial>
          </RewardReveal>
          <Sheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title="Configure step"
            footer={
              <Button variant="primary" onClick={() => setSheetOpen(false)}>
                Done
              </Button>
            }
          >
            <Stack gap={4}>
              <Field label="Wait for" hint="Appointment-relative waits use the booking time.">
                <Select defaultValue="1d">
                  <option value="1h">1 hour before appointment</option>
                  <option value="1d">1 day before appointment</option>
                </Select>
              </Field>
              <p className={styles.note}>
                Escape, the backdrop, or Close dismiss it. Focus is trapped.
              </p>
            </Stack>
          </Sheet>
        </Section>

        <Section id="panels" title="Panels">
          <Cluster gap={2}>
            {(['low', 'medium', 'high'] as Density[]).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={density === value ? 'primary' : 'secondary'}
                onClick={() => setDensity(value)}
              >
                {value} density
              </Button>
            ))}
            <Popover
              label="Filters"
              trigger={(props) => (
                <Button size="sm" {...props}>
                  Popover
                </Button>
              )}
            >
              <Stack gap={2}>
                <p className={styles.note}>Light-dismiss, anchored, flips when cramped.</p>
                <Button size="sm" variant="primary">
                  Apply
                </Button>
              </Stack>
            </Popover>
          </Cluster>
          <Grid minColumn="18rem" gap={4}>
            <ToolPanel
              title="Execution log"
              density={density}
              actions={<IconButton label="Clear" icon={<IconClose />} />}
              className={styles.panelPreview}
            >
              <ul className={styles.events}>
                <ExecutionEvent
                  time="10:00"
                  name="Form submitted"
                  detail="Consultation request"
                  status="ok"
                />
                <ExecutionEvent
                  time="10:00"
                  name="Workflow enrolled"
                  detail="Booking reminders"
                  status="info"
                />
                <ExecutionEvent
                  time="10:00"
                  name="If / Else"
                  detail="Has phone?"
                  branch="No phone"
                  status="ok"
                />
                <ExecutionEvent time="10:00" name="Send SMS" status="skipped" />
                <ExecutionEvent
                  time="09:00 +1d"
                  name="Wait"
                  detail="1 day before appointment"
                  status="waiting"
                />
              </ul>
            </ToolPanel>
            <Inspector
              title="Send SMS"
              density={density}
              onClose={() => undefined}
              className={styles.panelPreview}
            >
              <InspectorSection title="Message">
                <Field label="Body">
                  <Textarea defaultValue="Hi {{contact.first_name}}, see you tomorrow at {{appointment.start_time}}." />
                </Field>
              </InspectorSection>
              <InspectorSection title="Sending">
                <p className={styles.note}>Respects DND. Skips when no phone.</p>
              </InspectorSection>
            </Inspector>
          </Grid>
        </Section>

        <Section id="semantic" title="Semantic components">
          <h3 className={styles.h3}>Mastery badge · one glyph per state</h3>
          <Cluster gap={2}>
            {MASTERY_STATES.map((state) => (
              <MasteryBadge key={state} state={state} />
            ))}
          </Cluster>

          <h3 className={styles.h3}>Skill card · material escalates</h3>
          <Grid minColumn="14rem" gap={4}>
            {MASTERY_STATES.map((state, index) => (
              <SkillCard
                key={state}
                title={
                  [
                    'Wait',
                    'If / Else',
                    'Custom values',
                    'Appointment-relative wait',
                    'Re-entry rules',
                    'No-show recovery',
                    'Pipeline automation',
                    'Deliverability',
                  ][index] ?? state
                }
                territory="AUTOMATE"
                state={state}
                summary="Fixed delay, appointment-relative, business hours, late enrollment."
                demonstrations={index}
              />
            ))}
          </Grid>

          <h3 className={styles.h3}>Holo territory</h3>
          <Grid minColumn="16rem" gap={4}>
            <HoloTerritory
              territory="AUTOMATE"
              scope="Workflows, communication, timing, logic."
              demonstrated={12}
              total={40}
            />
            <HoloTerritory
              territory="SELL"
              scope="Prospecting, audits, discovery, pricing, closing."
              demonstrated={3}
              total={36}
            />
            <HoloTerritory
              territory="STRATEGIZE"
              scope="Funnels, offers, conversion, economics."
              demonstrated={18}
              total={18}
            />
          </Grid>

          <h3 className={styles.h3}>Client case cover · abstract identity</h3>
          <Grid minColumn="16rem" gap={4}>
            <ClientCaseCover
              businessName="GlowHaus Med Spa"
              industry="Med spa"
              relationship="discovery"
            />
            <ClientCaseCover
              businessName="Northwind Roofing"
              industry="Roofing"
              relationship="active"
            />
            <ClientCaseCover
              businessName="Lumen Coaching"
              industry="Coach"
              relationship="proposal"
              boss
            />
          </Grid>

          <h3 className={styles.h3}>Workflow node · light on ink</h3>
          <InkSurface padding="lg">
            <div className={styles.canvas}>
              <WorkflowNode
                kind="trigger"
                name="Appointment Status"
                config="status = confirmed"
                status="done"
              />
              <WorkflowNode
                kind="if_else"
                name="If / Else"
                config="contact.phone exists"
                status="done"
                selected
              />
              <WorkflowNode
                kind="wait"
                name="Wait"
                config="1 day before appointment"
                status="waiting"
                approximation
              />
              <WorkflowNode
                kind="action"
                name="Send SMS"
                config="Reminder · template A"
                status="running"
              />
              <WorkflowNode kind="action" name="Add Tag" config="reminded-24h" status="skipped" />
              <WorkflowNode kind="end" name="End" status="failed" />
            </div>
          </InkSurface>

          <h3 className={styles.h3}>Contact row · high density</h3>
          <ToolPanel title="Contacts" density="high">
            <div className={styles.rows}>
              <ContactRow
                name="Maria Alvarez"
                hasPhone
                hasEmail
                tags={['Lead', 'Booked']}
                owner="Ary"
                lastActivity="10:02"
              />
              <ContactRow
                name="Dana Whitfield"
                hasPhone={false}
                hasEmail
                tags={['Lead', 'VIP', 'Referral', 'Meta']}
                owner="Ary"
                lastActivity="09:41"
                selected
              />
              <ContactRow
                name="Jon Park"
                hasPhone
                hasEmail={false}
                owner={undefined}
                lastActivity="Yesterday"
              />
            </div>
          </ToolPanel>

          <h3 className={styles.h3}>Pipeline card</h3>
          <Grid minColumn="14rem" gap={3}>
            <PipelineCard
              contactName="Maria Alvarez"
              value={1800}
              stage="Consultation booked"
              ageDays={2}
              owner="Ary"
            />
            <PipelineCard
              contactName="Northwind Roofing"
              value={7500}
              stage="Proposal sent"
              ageDays={11}
              selected
            />
          </Grid>

          <h3 className={styles.h3}>Exercise prompt</h3>
          <ExercisePrompt
            family="FIX_IT"
            title="Two reminders"
            skills={['Wait', 'Re-entry']}
            noHints
          >
            <p>Maria received two reminder messages. She should have received one.</p>
            <p>Find out why. Then fix it without touching the confirmation.</p>
          </ExercisePrompt>

          <h3 className={styles.h3}>Pricing scope item</h3>
          <Surface padding="md">
            <PricingScopeItem
              name="Booking reminders"
              description="Confirmation, 24 h and 2 h SMS."
              priceImpact={600}
              included
              locked
            />
            <PricingScopeItem
              name="No-show recovery"
              description="Missed-appointment follow-up over three days."
              priceImpact={450}
              included={scope.recovery}
              onIncludedChange={(value) => setScope((s) => ({ ...s, recovery: value }))}
              dependency="reminders stop escalating after the 2 h message"
            />
            <PricingScopeItem
              name="Reporting dashboard"
              priceImpact={null}
              included={scope.reporting}
              onIncludedChange={(value) => setScope((s) => ({ ...s, reporting: value }))}
            />
          </Surface>

          <h3 className={styles.h3}>Call participant · very low density</h3>
          <InkSurface depth="deep" padding="lg">
            <Grid minColumn="16rem" gap={4}>
              <CallParticipant
                name="Dana Whitfield"
                company="GlowHaus Med Spa"
                audio="speaking"
                elapsed="04:12"
              />
              <CallParticipant name="Ary" company="Bloomwired" audio="listening" seed="ary" />
            </Grid>
          </InkSurface>
        </Section>
      </Stack>
    </OnlySection.Provider>
  );
}
