import { Icon } from './Icons';
import { ONBOARDING_ACTIONS } from '@/lib/bloomops/onboarding-guidance-values.mjs';

// Presentation hints for the existing named steps, never service selection or
// permission logic. Custom titles fall back to the configured action's icon.
const stepArtwork = {
  'instagram access': ['instagram', 'instagram'],
  'course videos': ['video', 'video'],
  'brand assets': ['image', 'assets'],
  agreement: ['signature', 'agreement'],
  'kickoff booking': ['calendar', 'booking'],
  'meta business access': ['key', 'access'],
  'gohighlevel access': ['key', 'access'],
  'kajabi access': ['key', 'access'],
};
const actionArtwork = {
  agreement: ['signature', 'agreement'],
  upload: ['upload', 'assets'],
  booking: ['calendar', 'booking'],
  access: ['key', 'access'],
};

export function OnboardingStepIcon({ item }) {
  const title = item.title.trim().toLowerCase();
  const [icon, tone] = Object.hasOwn(stepArtwork, title) ? stepArtwork[title]
    : Object.hasOwn(actionArtwork, item.actionType) ? actionArtwork[item.actionType]
      : [ONBOARDING_ACTIONS[item.actionType]?.icon || 'onboarding', 'neutral'];
  return <span className={`bo-onboarding-art bo-onboarding-art-${tone}`} aria-hidden="true">
    <Icon name={icon} size={22} />
  </span>;
}

const parties = {
  client: ['Client task', 'user'],
  team: ['Team task', 'team'],
  user: ['Assigned task', 'user'],
  external: ['External task', 'external-link'],
};
const visibility = {
  client: ['Client-visible', 'eye', 'shared'],
  internal: ['Internal', 'lock', 'internal'],
  restricted: ['Restricted', 'lock', 'restricted'],
};

export function OnboardingMetadata({ item }) {
  const [party, partyIcon] = parties[item.responsibleParty] || ['Unassigned', 'user'];
  const [audience, audienceIcon, audienceTone] = visibility[item.visibility] || visibility.internal;
  return <ul className="bo-onboarding-badges" aria-label="Step details">
    <li className="bo-onboarding-badge bo-onboarding-badge-owner"><Icon name={partyIcon} size={14} />{party}</li>
    <li className={`bo-onboarding-badge bo-onboarding-badge-${audienceTone}`}><Icon name={audienceIcon} size={14} />{audience}</li>
    {item.verificationRequired && <li className="bo-onboarding-badge bo-onboarding-badge-review"><Icon name="shield-check" size={14} />Verification required</li>}
  </ul>;
}

export function onboardingStatusStyle(item) {
  if (item.state === 'complete' || item.status === 'completed') return { tone: 'success', glyph: 'check' };
  if (item.status === 'blocked') return { tone: 'error', glyph: 'cross' };
  if (item.state === 'no_action' || ['waived', 'not_applicable'].includes(item.status)) return { tone: 'neutral', glyph: 'dash' };
  if (item.state === 'awaiting_verification' || (item.submittedAt && item.status === 'in_progress') || (item.state === 'todo' && !item.guidanceReady)) return { tone: 'warning', glyph: 'clock' };
  if (['agency', 'todo'].includes(item.state) || ['pending', 'in_progress'].includes(item.status)) return { tone: 'info', glyph: 'clock' };
  return { tone: 'neutral', glyph: 'clock' };
}
