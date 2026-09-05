# Prospect video triage

Paste this into a Cowork chat with the Chrome extension connected and
leadsthatbloom.com open and logged in.

It finds which prospects are worth an audit video, writes what it found into
each one's Info column, and hands back a ranked shortlist. It renders nothing
and spends no ElevenLabs credits.

It decides one thing only: does a video have something real to show. Every
prospect keeps their stage, their rating, and their place in the email sequence
no matter what tier they land in.

---

## The prompt

```
You are triaging Ary's prospect list to find which ones are worth an audit
video. You will not render any videos. Nothing you do here costs credits.

Read this before anything else. You are ranking VIDEOS, not prospects. A
prospect who does not get a video still gets the full email sequence, keeps
their stage, and keeps their rating. NO_VIDEO means their site is in good
order, which is a good thing about them. It is not a reason to deprioritise,
archive, mark down, or stop emailing anyone. Older output calls this tier SKIP.
It means the same thing and it has never meant skip the prospect.

## What you need first

1. leadsthatbloom.com open in Chrome and logged in (you should see the sidebar,
   not an access-code gate). If you see the gate, stop and ask Ary to log in.
   Never type her access code yourself.
2. A terminal with gcloud logged in, and RENDER_SECRET available.

## Step 1: pull the list

In the leadsthatbloom tab:

  (() => {
    if (!window.bloom) return 'ERROR: window.bloom missing - open the Prospects tab once, then retry';
    const rows = window.bloom.getProspects()
      .filter(p => p.domain && p.rating !== '✖️')
      .map(p => ({ email: p.email, domain: p.domain, stage: p.stage, name: p.name }));
    return JSON.stringify(rows);
  })()

Include every stage, not just New. Prospects who already had the sequence and
went quiet are the best audience for a video: they know the name already, and a
recorded finding is a real reason to reopen a dead thread rather than a
"just following up".

## Step 2: scan them

Write the domains to a file, one per line, then:

  cd F:\bloomtrack-pro\tools\audit-triage
  node scan.mjs domains.txt

It takes about 15 seconds a site, two at a time, so budget roughly 8 minutes
per 100 prospects. The tail of the output is JSON: keep it.

## Step 3: write the findings back

Only for SEND and MAYBE. Leave NO_VIDEO and BLOCKED rows untouched.

Most of a batch comes back with nothing wrong, and writing "nothing found" into
two hundred Info columns buries the handful that matter. Tagging only the ones
worth acting on means the tag itself carries the meaning: a row with VIDEO: in
its Info is a row with something to say.

  const prev = (window.bloom.findByEmail('EMAIL') || {}).info || '';
  await window.bloom.setInfo('EMAIL', 'VIDEO: TIER (score N)\n' + INFO_BLOCK + '\n---\n' + prev);

INFO_BLOCK is the `info` field from the scan output. It already reads as plain
text: platform, booking, email tool, contact, speed, socials, issues.

Ary can then search VIDEO: SEND in the app to pull the render queue, or VIDEO:
for everything triaged. Info is searchable, so no column or filter is needed.

Prospects in the New stage have no email address yet, so findByEmail will not
find them. Match those on domain instead, or skip the write-back for that batch
and hand the list back in the report.

Do not change anyone's stage, rating, or email sequence, in either direction
and for any tier. This step only records what was seen.

## Step 4: hand back the shortlist

Report, in this order:

1. Every SEND prospect: name, domain, stage, score, and the one finding that
   makes it worth sending. This is the render queue.
2. Every MAYBE prospect in one line each. Ary decides these.
3. A count of NO_VIDEOs and a count of ERRORs. Name the errors; a site that
   would not load is not the same as a site with nothing wrong. Do not present
   the NO_VIDEO count as prospects being dropped. They are not.
4. The credit cost of rendering the SEND list, at ~315 credits each.

## Judgement

- SEND means something on their site is visibly broken or missing, so a video
  has something undeniable to show.
- NO_VIDEO is a real answer, and a positive one. Their site is in good order.
  A video would have to manufacture a problem, which is worse than no video.
  They stay in the sequence and get emailed exactly like everyone else.
- ERROR is not NO_VIDEO. A site that would not load is not a site with nothing
  wrong. Report those separately so Ary can look herself.
- Do not re-score by your own judgement. The scan reads the live rendered DOM,
  clicks booking buttons, and looks inside iframes. Your read of a page from
  HTML is strictly worse information than its output.
```

---

## After the triage

Render the SEND list one at a time, each returning a hosted link:

```powershell
$TOKEN = gcloud auth print-identity-token
$body = @{ url="https://SOMEPROSPECT.com"; name="FirstName"; upload=$true } | ConvertTo-Json
Invoke-RestMethod -Uri "$RENDER_URL/render" -Method Post -Headers @{Authorization="Bearer $TOKEN"; "x-render-secret"=$SECRET} -ContentType "application/json" -Body $body
```

The reply carries `url`, which is what goes in the email.
