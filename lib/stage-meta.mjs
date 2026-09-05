// Stage + rating presentation metadata and the normalizers the bloom API
// runs writes through. Pure data, no React. Extracted verbatim from
// ProspectsApp.jsx (split step 3).

// Stage metadata. Each entry pairs a Lucide-style icon name (see Icon
// component) with a warm-paper-friendly bg/border. The `faded` flag dims
// the row for stages that are effectively dead-ends.
// Bg + border colors are deliberately saturated so the chip stands apart
// from the paper bg and the left-edge stripe reads at a glance. The Email
// series walks distinct hues (yellow → coral → rose → violet → teal) so two
// adjacent stages never read as the same color at a glance.
export const STAGE_META = {
  New: { icon: 'sparkle', bg: 'var(--stg-new-bg)', border: 'var(--stg-new-border)' },
  // Scanned + has email, awaiting a strong/skip verdict. Reuses the Nudge
  // palette (Nudge left the enum long ago).
  Prescreen: { icon: 'search', bg: 'var(--stg-nudge-bg)', border: 'var(--stg-nudge-border)' },
  // Reuses the Potential palette (Potential left the enum long ago).
  Validated: { icon: 'check-circle', bg: 'var(--stg-potential-bg)', border: 'var(--stg-potential-border)' },
  // The social track. Warm-up reuses retired palettes that were already
  // sitting free; the DM series gets its own magenta ramp that deepens with
  // each step, so it reads as one family and never blurs into the Email
  // series' rainbow walk.
  Followed: { icon: 'user', bg: 'var(--stg-instagram-bg)', border: 'var(--stg-instagram-border)' },
  Engaged: { icon: 'star', bg: 'var(--stg-replied-bg)', border: 'var(--stg-replied-border)' },
  Connected: { icon: 'linkedin', bg: 'var(--stg-linkedin-bg)', border: 'var(--stg-linkedin-border)' },
  'Story Reply': { icon: 'message', bg: 'var(--stg-social-media-bg)', border: 'var(--stg-social-media-border)' },
  'DM 1': { icon: 'send', bg: 'var(--stg-dm-1-bg)', border: 'var(--stg-dm-1-border)' },
  'DM 2': { icon: 'send', bg: 'var(--stg-dm-2-bg)', border: 'var(--stg-dm-2-border)' },
  'DM 3': { icon: 'send', bg: 'var(--stg-dm-3-bg)', border: 'var(--stg-dm-3-border)' },
  'Voice Note': { icon: 'mic', bg: 'var(--stg-contact-form-bg)', border: 'var(--stg-contact-form-border)' },
  'Email 1': { icon: 'send', bg: 'var(--stg-email-1-bg)', border: 'var(--stg-email-1-border)' },
  'Email 2': { icon: 'send', bg: 'var(--stg-email-2-bg)', border: 'var(--stg-email-2-border)' },
  'Email 3': { icon: 'send', bg: 'var(--stg-email-3-bg)', border: 'var(--stg-email-3-border)' },
  'Email 4': { icon: 'send', bg: 'var(--stg-email-4-bg)', border: 'var(--stg-email-4-border)' },
  'Email 5': { icon: 'send', bg: 'var(--stg-email-5-bg)', border: 'var(--stg-email-5-border)' },
  Instagram: { icon: 'instagram', bg: 'var(--stg-instagram-bg)', border: 'var(--stg-instagram-border)' },
  Facebook: { icon: 'facebook', bg: 'var(--stg-facebook-bg)', border: 'var(--stg-facebook-border)' },
  LinkedIn: { icon: 'linkedin', bg: 'var(--stg-linkedin-bg)', border: 'var(--stg-linkedin-border)' },
  'Contact Form': { icon: 'clipboard', bg: 'var(--stg-contact-form-bg)', border: 'var(--stg-contact-form-border)' },
  Rekindled: { icon: 'flame', bg: 'var(--stg-rekindled-bg)', border: 'var(--stg-rekindled-border)' },
  Replied: { icon: 'message', bg: 'var(--stg-replied-bg)', border: 'var(--stg-replied-border)' },
  'Setup Check': { icon: 'settings', bg: 'var(--stg-setup-check-bg)', border: 'var(--stg-setup-check-border)' },
  Interested: { icon: 'heart', bg: 'var(--stg-interested-bg)', border: 'var(--stg-interested-border)' },
  // Reuses the Booked palette — Booked isn't in the STAGES picker anymore,
  // so the color is free and 'Proposal Sent' sits in the same "warm, almost
  // there" zone of the pipeline.
  'Proposal Sent': { icon: 'send', bg: 'var(--stg-booked-bg)', border: 'var(--stg-booked-border)' },
  Potential: { icon: 'trending-up', bg: 'var(--stg-potential-bg)', border: 'var(--stg-potential-border)' },
  Nudge: { icon: 'bell', bg: 'var(--stg-nudge-bg)', border: 'var(--stg-nudge-border)' },
  Snoozed: { icon: 'hourglass', bg: 'var(--stg-snoozed-bg)', border: 'var(--stg-snoozed-border)' },
  'Re-warm': { icon: 'rotate-ccw', bg: 'var(--stg-re-warm-bg)', border: 'var(--stg-re-warm-border)' },
  Booked: { icon: 'calendar-check', bg: 'var(--stg-booked-bg)', border: 'var(--stg-booked-border)' },
  Client: { icon: 'briefcase', bg: 'var(--stg-client-bg)', border: 'var(--stg-client-border)' },
  'Payment Awaiting': { icon: 'clock', bg: 'var(--stg-payment-awaiting-bg)', border: 'var(--stg-payment-awaiting-border)' },
  Finished: { icon: 'moon', bg: 'var(--stg-finished-bg)', border: 'var(--stg-finished-border)', faded: true },
  'Not This Offer': { icon: 'thumbs-down', bg: 'var(--stg-not-this-offer-bg)', border: 'var(--stg-not-this-offer-border)', faded: true },
  Rejected: { icon: 'ban', bg: 'var(--stg-rejected-bg)', border: 'var(--stg-rejected-border)', faded: true },
  'Invalid Email': { icon: 'mail-x', bg: 'var(--stg-invalid-email-bg)', border: 'var(--stg-invalid-email-border)', faded: true },
  Lost: { icon: 'x-circle', bg: 'var(--stg-lost-bg)', border: 'var(--stg-lost-border)', faded: true },
};

// Rating metadata. Stored value in DB is still the emoji string (we don't
// want to migrate data). We just present it as a colored icon.
// `filled` makes the icon render as a solid colored badge instead of an
// outline — way easier to scan as a "rating chip". `x-circle` stays
// outlined since filling it would hide its internal X mark.
// Only 💚/💙/✖️ are in the picker (see RATINGS). The other four stay in this
// lookup so any legacy value still renders, but they're no longer selectable.
export const RATING_META = {
  '💚': { icon: 'heart',      filled: true,  color: 'var(--rt-strong-color)', bg: 'var(--rt-strong-bg)', label: 'Strong' },
  // Maybe, not Client. The tooltip has read "Client" since this table was
  // written and it never meant that: none of the 38 rows carrying a blue heart
  // is at the Client stage, and the stage column is what actually records one.
  // The CSS variables keep their old names, which are only referenced here.
  '💙': { icon: 'heart',      filled: true,  color: 'var(--rt-client-color)', bg: 'var(--rt-client-bg)', label: 'Maybe' },
  '✖️': { icon: 'x-circle',   filled: false, color: 'var(--rt-skip-color)', bg: 'var(--rt-skip-bg)', label: 'Skip' },
  '🥀': { icon: 'ban',        filled: false, color: 'var(--rt-skip-color)', bg: 'var(--rt-skip-bg)', label: 'Dead site' },
  '📭': { icon: 'mail',       filled: false, color: 'var(--rt-skip-color)', bg: 'var(--rt-skip-bg)', label: 'No email found' },
  '🟠': { icon: 'circle-dot', filled: true,  color: 'var(--rt-orange-color)', bg: 'var(--rt-orange-bg)', label: 'Orange' },
  '⭐': { icon: 'star',       filled: true,  color: 'var(--rt-star-color)', bg: 'var(--rt-star-bg)', label: 'Star' },
  '🔥': { icon: 'flame',      filled: true,  color: 'var(--rt-hot-color)', bg: 'var(--rt-hot-bg)', label: 'Hot' },
  '🟡': { icon: 'circle-dot', filled: true,  color: 'var(--rt-yellow-color)', bg: 'var(--rt-yellow-bg)', label: 'Yellow' },
};

// Ratings are stored as emoji, which are awkward to type from automation.
// Accept friendly names too — `rating: 'strong'` is nicer than `'💚'`.
export const RATING_ALIASES = {
  strong: '💚', green: '💚',
  dead: '🥀', 'dead-site': '🥀', wilted: '🥀',
  client: '💙', won: '💙', blue: '💙',
  skip: '✖️', x: '✖️', reject: '✖️',
};

// null/'' → no rating. An emoji passes through. A known name maps to its
// emoji. Anything else throws rather than silently storing garbage.
export function normalizeRating(value, ratings) {
  if (value == null || value === '') return null;
  if (ratings.includes(value)) return value;
  const alias = RATING_ALIASES[String(value).trim().toLowerCase()];
  if (alias) return alias;
  throw new Error(
    `Invalid rating: ${value}. Use one of ${ratings.join(' ')} or a name like "strong".`
  );
}

// Reply-type visual language, shared by the row dot and the Stats breakdown.
export const REPLY_TYPE_META = {
  interested: { label: 'Interested', color: 'var(--reply-interested-color)', bg: 'var(--reply-interested-bg)' },
  defer:      { label: 'Defer',      color: 'var(--reply-defer-color)', bg: 'var(--reply-defer-bg)' },
  decline:    { label: 'Decline',    color: 'var(--reply-decline-color)', bg: 'var(--reply-decline-bg)' },
};
