// The version stamp, the full-thread context, and the audit-evidence rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VERSION, versionLine } from '../lib/version.mjs';
import { buildReplyContext, buildFacts, contextSources, buildReplyPrompt, REPLY_SYSTEM } from '../lib/reply-context.mjs';
import { conversationThreadIds, cleanBodyForReading } from '../lib/gmail-thread.mjs';

const src = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the version object is one build fact, shared by UI and endpoint', () => {
  assert.ok(typeof VERSION.sha === 'string' && VERSION.sha.length >= 3);
  assert.match(VERSION.release, /^LTB /);
  assert.match(versionLine(), /^LTB .+ · .+ · (Production|Preview|Local)$/);
  // The human version: "1.0", not "1.0.0", and never empty.
  assert.match(VERSION.version, /^\d+\.\d+(\.\d+)?$/);
  assert.ok(!VERSION.version.endsWith('.0.0'), 'the trailing .0 is trimmed for wearing');
  // The route and the rail import the same module, so they cannot disagree.
  assert.match(src('app/api/version/route.js'), /from '@\/lib\/version\.mjs'/);
  assert.match(src('components/GlassRail.jsx'), /from '@\/lib\/version\.mjs'/);
  assert.match(src('components/GlassRail.jsx'), /A newer LTB version is available\. Refresh\./);
  // The badge wears the short form; the full line retreats to the tooltip.
  assert.match(src('components/GlassRail.jsx'), /v\{VERSION\.version\}/);
  assert.match(src('components/GlassRail.jsx'), /title=\{`\$\{versionLine\(\)\}/);
});

test('a reply-owed drawer leads with one dominant Draft reply', () => {
  const drawer = src('components/ProspectDrawer.jsx');
  // The state decides the filled button: reply owed means Draft reply is the
  // work, and Log a touch steps back to an outline.
  assert.match(drawer, /const needsReply = state\.pile === PILE\.NEEDS_YOU && Boolean\(state\.relationship\?\.needsPerson\)/);
  assert.match(drawer, /setTab\('overview'\); setDraftNonce\(\(n\) => n \+ 1\)/);
  assert.match(drawer, /focusDraft=\{draftNonce\}/);
  const view = src('components/ConversationTimeline.jsx');
  assert.match(view, /autoStart=\{focusDraft\}/);
  // Exactly once per press, and never over a draft in progress.
  assert.match(view, /autoStart === started\.current/);
  assert.match(view, /if \(!draft && !busy && !sending && !sent\) generate\(\)/);
});

test('Draft & send is one click with eyes-open sending', () => {
  const view = src('components/ConversationTimeline.jsx');
  // The countdown carries the text and fingerprint explicitly — the interval
  // closure would otherwise capture the render-time empty draft and send
  // nothing at all.
  assert.match(view, /startCountdown\(json\.draft, json\.fingerprint \|\| null\)/);
  assert.match(view, /send\(\{ body: text, fp \}\)/);
  // Ten visible seconds, a Cancel button, and typing stops the clock.
  assert.match(view, /Sending in \{countdown\}s/);
  assert.match(view, /setCopied\(false\); clearCountdown\(\);/);
  // Regenerate and Discard can never race a live countdown.
  const gen = view.slice(view.indexOf('async function generate'), view.indexOf('async function generate') + 120);
  assert.match(gen, /clearCountdown\(\)/);
});

test('the Gmail thread opens on the newest message, with history one click away', () => {
  const view = src('components/ConversationTimeline.jsx');
  // Collapsed by default: only the latest message renders until asked.
  assert.match(view, /const \[showAll, setShowAll\] = useState\(false\)/);
  assert.match(view, /messages\.slice\(-1\)/);
  assert.match(view, /Show the whole conversation/);
  assert.match(view, /Hide the earlier messages/);
  // And the collapsed caption says the draft still reads everything.
  assert.match(view, /Draft reply still reads the whole conversation\./);
});

test('full Gmail messages replace snippets in the model thread', () => {
  const events = [{ direction: 'inbound', occurred_at: '2026-08-04T22:00:00Z', matched_by: 'thread', in_reply_to: '<a>', snippet: 'tiny snippet', message_id: 'g1', thread_id: 't1', subject: 'Re: x' }];
  const fullMessages = [
    { from: 'Ary', at: '2026-08-01T09:00:00Z', subject: 'x', text: 'The whole outbound email body, paragraphs and all.' },
    { from: 'them', at: '2026-08-04T22:00:00Z', subject: 'Re: x', text: 'The whole inbound reply body, much longer than any snippet could ever be, with the actual question in it.' },
  ];
  const ctx = buildReplyContext({ prospect: {}, events, fullMessages });
  assert.match(ctx.thread[0].text, /whole outbound email body/);
  assert.match(ctx.latestInbound.text, /actual question in it/);
  assert.ok(!JSON.stringify(ctx.thread).includes('tiny snippet'), 'snippets are the fallback, not the source');
});

test('stored audit evidence is carried, with its date, and forbids "never looked"', () => {
  const facts = buildFacts({ business_name: 'X', site_intel: 'Booking page loads slowly; form above the fold.', site_intel_at: '2026-07-02T10:00:00Z' });
  const line = facts.find((f) => /Website evidence on file/.test(f));
  assert.ok(line, 'evidence line exists');
  assert.match(line, /do not claim the site was never looked at/);
  assert.match(line, /2026-07-02/);
  assert.ok(!facts.some((f) => /No website audit is stored/.test(f)));
});

test('missing audit evidence is stated honestly, never invented', () => {
  const facts = buildFacts({ business_name: 'X' });
  assert.ok(facts.some((f) => /No website audit is stored for this prospect/.test(f)));
  assert.ok(facts.some((f) => /say what you would check/.test(f)));
});

test('the sources line lists only what is really present', () => {
  assert.deepEqual(contextSources({}, {}), []);
  assert.deepEqual(
    contextSources({ audit_notes: 'x', info: 'y', offer_accepted_at: '2026-08-11' }, { hasGmailThread: true }),
    ['Gmail conversation', 'Website audit', 'Prospect notes', 'Accepted offer']
  );
  assert.deepEqual(contextSources({}, { isClient: true }), ['Client record']);
});

test('only threads we take part in count as the conversation', () => {
  const ids = conversationThreadIds([
    { direction: 'inbound', occurred_at: '2026-08-17', thread_id: 'blast', matched_by: 'domain', in_reply_to: null, refs: null },
    { direction: 'inbound', occurred_at: '2026-08-10', thread_id: 'real', matched_by: 'thread', in_reply_to: '<a>' },
    { direction: 'outbound', occurred_at: '2026-08-01', thread_id: 'ours' },
  ]);
  assert.ok(!ids.includes('blast'), 'a newsletter thread is not the conversation');
  assert.deepEqual(ids, ['real', 'ours']);
});

test('bodies keep their paragraphs and lose the quoted chain', () => {
  const cleaned = cleanBodyForReading('Real answer.\n\nSecond paragraph.\n\nOn Mon, Aug 11, 2026 at 9:00 AM Ary wrote:\n> old text');
  assert.equal(cleaned, 'Real answer.\n\nSecond paragraph.');
});

test('the promo tail after a sign-off is stripped; the sign-off and name stay', () => {
  const raw = [
    'I am at a loss. : )',
    '',
    "Here's to a well-lived day,",
    'Mary Ann',
    '',
    '“But blessed are your eyes, for they see: and your',
    'ears, for they hear.” Matthew 13:16:',
    '',
    '*Get a FREE chapter <http://www.becomingapresentparent.com/>* from -',
    'Becoming A Present Parent',
    '*Join me on Facebook <https://www.facebook.com/mary.a.johnson.908>*',
  ].join('\n');
  const cleaned = cleanBodyForReading(raw);
  assert.match(cleaned, /at a loss/);
  assert.match(cleaned, /well-lived day,\nMary Ann$/);
  assert.ok(!cleaned.includes('FREE chapter'), 'the promo block is gone');
  assert.ok(!cleaned.includes('Facebook'), 'the social links are gone');
});

test('a PS after the sign-off is content and survives', () => {
  const raw = 'Sounds good.\n\nThanks,\nGena\n\nP.S. Can you also look at the booking form?';
  assert.match(cleanBodyForReading(raw), /P\.S\. Can you also look at the booking form\?/);
});

test('a message with no sign-off is untouched by the signature pass', () => {
  const raw = 'Short answer with a link http://example.com in the middle.\n\nMore content.';
  assert.equal(cleanBodyForReading(raw), raw);
});

test('the generic "On … wrote:" header cuts quotes the dated pattern misses', () => {
  const raw = 'Yes, I prefer it this way.\n\nOn 2026-08-12 9:35 am, Ary at Bloomwired wrote:\n\n> Hi Cynthia,\n> old text';
  assert.equal(cleanBodyForReading(raw), 'Yes, I prefer it this way.');
});

test('a dash-delimited signature block is stripped, dashes included', () => {
  const raw = [
    'Yes, I prefer it this way.',
    '',
    '---',
    'Cynthia A. Criss, LPC, CSAT',
    'Open Hearts Open Minds Counseling Services',
    '4545 E. Shea Blvd., Suite 235',
    'CONFIDENTIALITY NOTICE: This message is protected under the Federal regulations.',
  ].join('\n');
  assert.equal(cleanBodyForReading(raw), 'Yes, I prefer it this way.');
});

test('a blank line between sign-off and name does not cost the name', () => {
  const raw = 'Thanks for reaching out.\n\nCheers,\n\nPablo\n*Pablo Steinman*\nw: www.steinmancoaching.com\np: 0211333415';
  assert.equal(cleanBodyForReading(raw), 'Thanks for reaching out.\n\nCheers,\n\nPablo');
});

test('the subject shows once above the conversation, never per card', () => {
  const view = src('components/ConversationTimeline.jsx');
  assert.ok(!/\{m\.subject\}/.test(view), 'no per-card subject render');
  assert.match(view, /\{subject\}/);
});

test('a synced Gmail thread renders even when nothing is classified yet', () => {
  const view = src('components/ConversationTimeline.jsx');
  // The empty-state branch must still show the conversation; hiding a real
  // thread behind "No reply yet" is how Chris's warm reply went unseen.
  const emptyBranch = view.slice(view.indexOf('if (!current?.state && !timeline.length)'), view.indexOf('async function correct'));
  assert.match(emptyBranch, /<GmailThread prospectId=\{prospectId\} onState=\{setThreadState\} \/>/);
  // "No reply yet" may only print once the thread fetch came back empty.
  assert.match(emptyBranch, /threadState === 'empty' && <p/);
  // A loaded thread is something to answer even before classification; no
  // thread still means no draft button, so an uncontacted prospect never
  // grows an off-sequence nudge. Found live on Chris during the pixel walk.
  assert.match(emptyBranch, /threadState === 'loaded' && <DraftReply prospectId=\{prospectId\} autoStart=\{focusDraft\} \/>/);
});

test('the prompt carries the audit rule to the model', () => {
  const ctx = buildReplyContext({ prospect: { business_name: 'X', audit_notes: 'CTA below the fold' }, events: [] });
  assert.match(buildReplyPrompt(ctx), /Website evidence on file/);
});

test('the reply prompt bans the corporate family by name and hands over her real openers', () => {
  // "No corporate phrasing" alone did not stop "Circling back on this one";
  // Ary caught it live on 2026-08-19. Bans work when the phrases are named,
  // exactly as "Good question" had to be.
  assert.match(REPLY_SYSTEM, /"circling back"/);
  assert.match(REPLY_SYSTEM, /"closing the loop"/);
  assert.match(REPLY_SYSTEM, /"touching base"/);
  assert.match(REPLY_SYSTEM, /Just checking in regarding/);
  assert.match(REPLY_SYSTEM, /Just want to follow up about/);
});
