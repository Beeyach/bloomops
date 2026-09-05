// Ranks prospects by whether an audit video is worth rendering for them.
//
//   node scan.mjs domains.txt            (one domain per line)
//   node scan.mjs a.com b.com c.com
//
// Uses the render service's dryRun, which spends no ElevenLabs credits and
// takes about fifteen seconds a site. That is the whole point: deciding who
// deserves a video is free, so it can be done across a hundred prospects
// before a single one is paid for.
//
// Needs the same two things a render does:
//   RENDER_URL     the Cloud Run service URL
//   RENDER_SECRET  the x-render-secret value
// The Google identity token comes from gcloud, so be logged in. Set
// RENDER_TOKEN instead to skip gcloud entirely.

import { readFile } from 'node:fs/promises';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execCb);

const SERVICE = process.env.RENDER_URL || 'https://audit-render-669979959969.us-east1.run.app';
const SECRET = process.env.RENDER_SECRET;

// How much each finding argues for sending a video. Weighted by how visible
// the problem is to the owner once they look, because that is what makes them
// reply. A broken captcha is undeniable; a missing reply-time promise is a
// fair point that nobody feels urgency about.
const WEIGHT = {
  'captcha-broken': 10,
  // Not in Google at all. Outranks anything else on the page.
  noindex: 10,
  'no-meta-description': 4,
  'no-local-schema': 2,
  'no-address': 2,
  'no-contact': 8,
  insecure: 8,
  'mobile-overflow': 7,
  'dead-links': 7,
  'stale-copyright': 6,
  'dead-link-one': 4,
  'contact-page-no-form': 6,
  'broken-images': 6,
  slow: 5,
  'mixed-content': 5,
  viewport: 4,
  cta: 4,
  'stale-stack': 3,
  'no-title': 3,
  'booking-is-a-form': 2,
  'no-booking': 2,
  'quote-form-thin': 3,
  'phone-mismatch': 9,
  'bad-email': 8,
  'two-schedulers': 5,
  'ctas-collapse': 6,
  'calendar-not-loading': 9,
  'map-not-loading': 6,
  'booking-behind-login': 5,
  'no-link-preview': 4,
  'lead-magnet-open': 6,
  'ancient-markup': 5,
  'expired-date': 5,
  'long-form': 2,
  'no-reply-promise': 1,
};

// Two at a time. The service runs one render per instance with a ceiling of
// three, so more than this just queues and risks timeouts on the slow ones.
const CONCURRENCY = 2;

// Tiers rank one thing only: whether a video has something real to show. They
// are not a verdict on the prospect. NO_VIDEO means their site is in good order,
// which is a compliment, and they still get the full email sequence like anyone
// else. It was called SKIP, which read as skip the prospect, so it is spelled
// out now. Old scans that say SKIP mean the same thing.
function tierFor(score) {
  if (score >= 8) return 'SEND';
  if (score >= 4) return 'MAYBE';
  return 'NO_VIDEO';
}

// A gcloud identity token is good for an hour, and a few hundred sites takes
// longer than that. Minting one at the start and reusing it for the whole run
// meant every site after the sixtieth minute came back 401, which reads in the
// output as a site that refused us rather than as our own credentials going
// stale. Re-minted well before it expires, and again on the first 401 in case
// the clock and the token disagree.
const TOKEN_MAX_AGE_MS = 30 * 60 * 1000;
let tokenValue = null;
let tokenMintedAt = 0;
let tokenInFlight = null;

async function identityToken(force = false) {
  // Set RENDER_TOKEN to skip gcloud entirely, which also lets this run
  // somewhere gcloud is not installed. A token given that way cannot be
  // refreshed, so a long run needs gcloud.
  if (process.env.RENDER_TOKEN) return process.env.RENDER_TOKEN.trim();
  if (!force && tokenValue && Date.now() - tokenMintedAt < TOKEN_MAX_AGE_MS) return tokenValue;
  // One mint at a time. Workers run concurrently and would otherwise all
  // shell out to gcloud the moment the token aged out.
  if (!tokenInFlight) {
    tokenInFlight = (async () => {
      // shell: true because on Windows gcloud is a .cmd wrapper, and execFile
      // cannot launch those directly. Without it this fails with ENOENT.
      const { stdout } = await exec('gcloud auth print-identity-token', { shell: true });
      tokenValue = stdout.trim();
      tokenMintedAt = Date.now();
      return tokenValue;
    })().finally(() => {
      tokenInFlight = null;
    });
  }
  return tokenInFlight;
}

async function probe(domain, retryOn401 = true) {
  const url = domain.startsWith('http') ? domain : `https://${domain}`;
  const res = await fetch(`${SERVICE}/render`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await identityToken()}`,
      'x-render-secret': SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, dryRun: true }),
  });
  if (res.status === 401 && retryOn401) {
    await identityToken(true);
    return probe(domain, false);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${body.slice(0, 120)}`);
  }
  return res.json();
}

async function scanOne(domain) {
  try {
    const r = await probe(domain);
    // A site that blocked us tells us nothing. Reporting it as a prospect with
    // no contact form is a claim about their site rather than about our access,
    // and leahyiannis.com scored SEND on exactly that mistake.
    if (r.blocked) {
      return {
        domain,
        tier: 'BLOCKED',
        score: -1,
        error: `blocked (${r.blocked.status || 'error page'}${r.blocked.title ? ': ' + r.blocked.title.slice(0, 40) : ''})`,
      };
    }
    const real = (r.findings || []).filter((f) => f.severity === 'real');
    const score = real.reduce((sum, f) => sum + (WEIGHT[f.key] || 1), 0);
    return {
      domain,
      tier: tierFor(score),
      score,
      findings: real.map((f) => f.key),
      info: r.info,
      script: r.script,
    };
  } catch (e) {
    // A site that cannot be reached is not a judgement about the prospect, so
    // it is reported rather than silently scored zero and read as nothing wrong.
    return { domain, tier: 'ERROR', score: -1, error: String(e.message).slice(0, 120) };
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node scan.mjs <domains.txt | domain [domain...]>');
    process.exit(1);
  }
  if (!SECRET) {
    console.error('RENDER_SECRET is not set.');
    process.exit(1);
  }

  let domains = args;
  if (args.length === 1 && args[0].endsWith('.txt')) {
    domains = (await readFile(args[0], 'utf8')).split(/\r?\n/);
  }
  // Anything that is not a hostname is dropped before it costs a browser
  // launch. A clipboard mixup once filled this file with PowerShell commands
  // and every one of them was dutifully opened as a URL.
  const LOOKS_LIKE_DOMAIN = /^(https?:\/\/)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+\.?(\/\S*)?$/i;
  const raw = domains.map((d) => d.trim()).filter(Boolean).filter((d) => !d.startsWith('#'));
  // Deduplicated by hostname, so the same prospect listed twice is scanned
  // once. The tracker had adolescentlifecoaching.com in there twice.
  const byHost = new Map();
  for (const d of raw.filter((x) => LOOKS_LIKE_DOMAIN.test(x))) {
    const host = d.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
    if (!byHost.has(host)) byHost.set(host, d);
  }
  domains = [...byHost.values()];
  const rejected = raw.filter((d) => !LOOKS_LIKE_DOMAIN.test(d));
  if (rejected.length) {
    console.error(`Ignoring ${rejected.length} line(s) that are not domains:`);
    rejected.slice(0, 5).forEach((d) => console.error(`  ${d.slice(0, 70)}`));
    console.error('');
  }
  if (!domains.length) {
    console.error('No valid domains found. Check the file.');
    process.exit(1);
  }

  await identityToken();
  console.error(`Scanning ${domains.length} sites, ${CONCURRENCY} at a time. No credits are spent.\n`);

  const results = [];
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, domains.length) }, async () => {
      while (index < domains.length) {
        const d = domains[index++];
        const r = await scanOne(d);
        results.push(r);
        console.error(`  ${String(results.length).padStart(3)}/${domains.length}  ${r.tier.padEnd(5)} ${d}`);
      }
    })
  );

  results.sort((a, b) => b.score - a.score);

  console.log('');
  console.log('TIER      SCORE  DOMAIN                              FINDINGS');
  for (const r of results) {
    if (r.tier === 'ERROR' || r.tier === 'BLOCKED') {
      console.log(`${r.tier.padEnd(8)}    -  ${r.domain.padEnd(34)} ${r.error}`);
      continue;
    }
    console.log(`${r.tier.padEnd(8)}${String(r.score).padStart(4)}  ${r.domain.padEnd(34)} ${r.findings.join(', ')}`);
  }

  const send = results.filter((r) => r.tier === 'SEND');
  const maybe = results.filter((r) => r.tier === 'MAYBE');
  console.log('');
  const blocked = results.filter((r) => r.tier === 'BLOCKED' || r.tier === 'ERROR');
  const noVideo = results.length - send.length - maybe.length - blocked.length;
  console.log(
    `${send.length} worth a video, ${maybe.length} borderline, ${noVideo} nothing to show, ${blocked.length} could not be read.`
  );
  console.log('Everyone here still gets the emails. This only ranks the video.');
  // ~1,100 characters a script at turbo's 0.5 credits per character.
  console.log(`Rendering the SEND list costs about ${send.length * 560} credits.`);
  console.log('');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
