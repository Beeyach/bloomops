// Asking a model what is actually in the picture.
//
// Deliberately not "tell me what is wrong with this website". A model given a
// screenshot and an open question will always find three problems, because that
// is what the question asks for, and the result is generic design criticism
// dressed as evidence. That is the same failure as the geometry heuristic in a
// more expensive costume.
//
// So every question is narrow, closed, and about something visible. The model's
// job is to report what is on screen, not to conclude anything about the
// business. Whether a finding is worth an email is already decided elsewhere by
// rules; this only settles whether the thing the rule believes is true is
// actually there to be seen.
//
// The answer must be structured, and "I cannot tell from this image" must be a
// first-class answer. A verdict that cannot say "unclear" will never say it.

import { askBackground } from './ai-call.mjs';
import { CLAIM, VIEWPORT } from './visual-evidence.mjs';

export const VISION_TASK = 'visual-evidence';

// One question per thing a rule might claim. Keyed by the probe's finding key
// so a claim and its question cannot drift apart.
//
// Each asks about appearance and nothing else. "Is the booking action visible
// in the first viewport" is answerable from a photograph; "is this site good at
// converting" is not, and a model asked the second will answer it anyway.
export const QUESTIONS = {
  'cta': {
    category: CLAIM.VISUAL_UX,
    ask: 'Is there a clearly visible button or link inviting the visitor to take an action — book, call, enquire, get in touch, buy — within this screenshot, without scrolling? If yes, quote its exact visible text.',
  },
  'ctas-collapse': {
    category: CLAIM.VISUAL_UX,
    ask: 'Are two or more different actions competing for attention in this screenshot, styled with similar prominence? If yes, quote the exact visible text of each.',
  },
  'long-form': {
    category: CLAIM.VISUAL_UX,
    ask: 'Does a form appear in this screenshot before the page has visibly explained what the visitor would be signing up for? Quote the visible text immediately above the form.',
  },
  'mobile-overflow': {
    category: CLAIM.MOBILE_VISUAL_UX,
    ask: 'In this phone screenshot, is any content visibly cut off at the right edge, overlapping other content, or running off the screen? Describe exactly what is clipped.',
  },
  'overlay': {
    category: CLAIM.VISUAL_UX,
    ask: 'Is a popup, banner or overlay visibly covering the main content of the page in this screenshot? If yes, quote its visible text.',
  },
};

export const questionFor = (key) => QUESTIONS[String(key || '')] || null;

const SYSTEM = [
  'You are looking at a screenshot of a web page and reporting only what is visibly on screen.',
  '',
  'Rules:',
  '- Answer only from the image. Never from what a page like this usually contains.',
  '- If the image does not settle the question, say so. "unclear" is a correct answer and is preferred to a guess.',
  '- Quote visible text exactly as it appears. Do not paraphrase it.',
  '- Do not comment on design quality, branding, colour choices or conversion rates.',
  '- Do not suggest improvements. You are recording evidence, not advising.',
  '',
  'Reply with JSON only, no prose around it:',
  '{"answer":"yes"|"no"|"unclear","visible":"exact visible text you are relying on, or empty","observation":"one sentence describing only what is on screen","confidence":"high"|"medium"|"low"}',
].join('\n');

// Parse defensively. A model that returns prose around its JSON, or nothing
// usable, is an unclear answer — never a yes.
export function parseVerdict(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return { answer: 'unclear', visible: '', observation: '', confidence: 'low', parsed: false };
  let obj;
  try { obj = JSON.parse(raw.slice(start, end + 1)); } catch { obj = null; }
  if (!obj || typeof obj !== 'object') return { answer: 'unclear', visible: '', observation: '', confidence: 'low', parsed: false };

  const answer = ['yes', 'no', 'unclear'].includes(obj.answer) ? obj.answer : 'unclear';
  const confidence = ['high', 'medium', 'low'].includes(obj.confidence) ? obj.confidence : 'low';
  return {
    answer,
    visible: String(obj.visible || '').slice(0, 300),
    observation: String(obj.observation || '').slice(0, 400),
    confidence,
    parsed: true,
  };
}

// Does the picture support the claim the rule wants to make?
//
// The polarity matters and is easy to get backwards. The `cta` finding claims
// there is NO visible action, so the picture supports it when the model answers
// "no". Getting this the wrong way round would turn the enforcement into a
// rubber stamp, which is worse than not having it.
const SUPPORTED_WHEN = {
  'cta': 'no',              // the finding says there is nothing to click
  'ctas-collapse': 'yes',   // the finding says actions compete
  'long-form': 'yes',       // the finding says the form comes too early
  'mobile-overflow': 'yes', // the finding says content is clipped
  'overlay': 'yes',         // the finding says a popup covers the page
};

export function supports(key, verdict) {
  const wanted = SUPPORTED_WHEN[String(key || '')];
  if (!wanted) return false;
  // Low confidence is not support. A model that is guessing is the geometry
  // heuristic again, with a bigger bill.
  if (verdict?.confidence === 'low') return false;
  return verdict?.answer === wanted;
}

// Fetch the stored picture and hand back its bytes, base64, for the model.
//
// The public URL stays what it always was: the audit trail. A human can open
// it, and the artifact row points at it. What changed is that it is no longer
// how the model receives the image — Anthropic could not fetch it, and the
// picture the model looks at should not depend on a third party's fetcher
// reaching a host it apparently cannot.
//
// The sha256 check is the part worth keeping. It proves the bytes handed to
// the model are the bytes that were stored and recorded — not a placeholder,
// not a cached older capture, not an error page served with a 200. Without it,
// "the model looked at the screenshot" would be an assumption again.
export async function imageBytes(url, { expectSha256 = null } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`the stored screenshot answered ${res.status}`);

  const mediaType = (res.headers.get('content-type') || '').split(';')[0].trim() || 'image/png';
  if (!mediaType.startsWith('image/')) {
    throw new Error(`the stored screenshot is ${mediaType}, not an image`);
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  if (!buf.length) throw new Error('the stored screenshot is empty');

  if (expectSha256) {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const got = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (got !== expectSha256) {
      // Fail rather than look at it. A picture whose bytes disagree with the
      // record cannot support a claim traced to that record.
      throw new Error('the stored screenshot does not match the hash that was recorded for it');
    }
  }

  // Chunked: String.fromCharCode(...buf) blows the argument limit somewhere
  // around a hundred kilobytes, which is exactly the size these are.
  let binary = '';
  for (let i = 0; i < buf.length; i += 8192) {
    binary += String.fromCharCode(...buf.subarray(i, i + 8192));
  }
  return { data: btoa(binary), mediaType, bytes: buf.length };
}

// Look at one artifact and answer one question about it.
//
// Returns the structured verdict plus everything needed to trace it: which
// picture, which page, which viewport, which model. A verdict that cannot be
// traced to an image is exactly the thing this pass exists to stop.
export async function reviewArtifact(db, {
  workspace, apiKey, configuredModel, artifact, key,
}) {
  const question = questionFor(key);
  if (!question) return { key, skipped: 'no question is defined for that finding' };
  if (!artifact?.storedAt) return { key, skipped: 'there is no stored image to look at' };
  if (artifact.blocked) return { key, skipped: 'the page was blocked, so there is nothing to see' };

  const where = artifact.viewport === VIEWPORT.MOBILE ? 'a phone (390x844)' : 'a desktop browser (1920x1080)';
  const prompt = [
    `This is a screenshot of ${artifact.url}, taken in ${where}, showing the first screen without scrolling.`,
    '',
    question.ask,
  ].join('\n');

  // Bytes, not a link. If the picture cannot be fetched or does not match its
  // recorded hash, no model is asked and no claim is supported.
  const image = await imageBytes(artifact.storedAt, { expectSha256: artifact.sha256 || null });

  const res = await askBackground(db, {
    workspace,
    task: VISION_TASK,
    system: SYSTEM,
    prompt,
    images: [image],
    maxTokens: 400,
    apiKey,
    configuredModel,
  });

  const verdict = parseVerdict(res.text);
  return {
    key,
    category: question.category,
    question: question.ask,
    verdict,
    supported: supports(key, verdict),
    artifactId: artifact.id ?? null,
    storedAt: artifact.storedAt,
    url: artifact.url,
    viewport: artifact.viewport,
    capturedAt: artifact.capturedAt,
    model: res.model,
    usage: res.usage || {},
    // How the model actually received the picture, and how much of it. Recorded
    // because "it saw the screenshot" was previously an assumption.
    delivery: 'base64',
    imageBytes: image.bytes,
    mediaType: image.mediaType,
  };
}
