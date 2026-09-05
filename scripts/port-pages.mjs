// One-time data port: copies the workspace pages from the local dev D1 to
// the production app via its public API. Run AFTER remote migrations and
// AFTER the new code is live (the /api/pages route must exist).
//
//   node scripts/port-pages.mjs https://leadsthatbloom.com
//
// Reads pages from the local dev server (first arg defaults shown below),
// skips any page whose title already exists remotely, so it is safe to
// re-run.

const LOCAL = process.env.LOCAL_URL || 'http://localhost:3006';
const REMOTE = process.argv[2];

if (!REMOTE) {
  console.error('Usage: node scripts/port-pages.mjs <remote-url>');
  process.exit(1);
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

const { pages: localPages } = await getJson(`${LOCAL}/api/pages`);
const { pages: remotePages } = await getJson(`${REMOTE}/api/pages`);
const remoteTitles = new Set(remotePages.map((p) => p.title));

let ported = 0;
for (const p of localPages) {
  if (remoteTitles.has(p.title)) {
    console.log(`skip (exists): ${p.title}`);
    continue;
  }
  const res = await fetch(`${REMOTE}/api/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: p.title, emoji: p.emoji }),
  });
  if (!res.ok) {
    console.error(`FAILED create: ${p.title} -> ${res.status}`);
    continue;
  }
  const { page } = await res.json();
  const put = await fetch(`${REMOTE}/api/pages/${page.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: p.body || '' }),
  });
  console.log(`${put.ok ? 'ported' : 'BODY FAILED'}: ${p.emoji} ${p.title}`);
  if (put.ok) ported++;
}
console.log(`Done. ${ported} page(s) ported.`);
