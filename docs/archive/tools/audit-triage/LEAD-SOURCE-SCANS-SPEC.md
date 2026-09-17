# New lead-source scans — spec, not built

Three scan types Ellen asked for, written against the code that exists so
whoever builds them is not guessing. None of this is built yet.

## How lead scans already work

The pattern to follow, all of it already in the repo:

1. `app/api/scan/route.js` holds an `ACTORS` map (Apify actor per type) and a
   per-type spend guard. A POST kicks off a run and writes a row to
   `scan_runs` with `status='running'`.
2. Results land back in `scan_runs.results` as JSON. The user reviews them.
3. `app/api/scan/import/route.js` takes the picked rows and inserts them, with
   dedupe against existing prospects on host, name and email.

Five types exist today: `fb-ads`, `fb-posts`, `maps`, `ig-profiles`,
`ig-discover`.

Two of the three requests do NOT fit the Apify shape, so they need a sibling
path, not a new entry in `ACTORS`. That is the main thing to know before
starting.

---

## 1. Podcast guests — build this one

**Verdict: yes, cleanly. The one to build if only one gets built.**

Podcast RSS is open XML. No Apify, no auth, no rate limit, no ToS question. A
coach who guests on podcasts is warm, findable, and named in the feed.

**Shape:** not an Apify actor. A new scan `type: 'podcast'` whose handler
fetches feed URLs directly and parses them, rather than calling Apify. Branch in
`route.js` before the `ACTORS[type]` lookup, the same way a non-Apify type would
have to.

**Input:** a textarea of podcast RSS feed URLs, one per line. (Finding the feed
URL for a show is a separate manual step; do not try to search for feeds.)

**Per feed, fetch and parse:**
- `<title>` of the show, for context
- each `<item>`: episode `<title>`, `<pubDate>`, and the guest name

The guest name is the hard part. It is usually in the episode title
(`"Ep 42: Burnout with Dr. Jane Smith"`) or the first line of
`<description>`/`<itunes:summary>`. Extract with a pattern
(`with X`, `feat. X`, `guest X`, `ft X`), and when unsure keep the whole episode
title and let the user read it. Do not invent a name.

**Store** in `scan_runs.results` as JSON, one row per guest:
`{ guest, show, episode, pubDate, feedUrl }`.

**Import** into `leads`, not `prospects`. A podcast guest is a raw lead with no
domain yet, and `leads` is exactly that table. Map:
- `author_name` = guest
- `platform` = 'Other' (or add 'Podcast' to the platform list)
- `notes` = `${show} — ${episode} (${pubDate})`
- `status` = 'new'

The other chat said "if you add one source, add this one." It is right.

**Effort:** about half a day. RSS parsing, one new branch in `route.js`, one new
branch in the import route, a textarea in the scan UI.

---

## 2. Booking-link search — build second, needs a key

**Verdict: yes, but it needs a paid search API.**

Google cannot be scraped directly. A search API (Serper, SerpAPI, Brave) takes a
"dork" query like `site:calendly.com "life coach"` and returns URLs. At Ary's
volume this is a few dollars a month.

**Shape:** another non-Apify `type: 'booking-search'`. Handler calls the search
API, dedupes URLs, and stores them.

**Setup cost:** one API key, added to the secrets the scan route already reads
(same place the Apify token lives). This is the only new dependency in the whole
spec.

**Input:** the dork pattern, or a niche the handler wraps into one. Output: URLs,
each one a business already using a booking tool, which is a warm signal for
Ary because it means they take bookings seriously.

**Import** into `leads` or `prospects` depending on whether a domain comes back.
A booking URL usually resolves to a domain, so `prospects` with `domain` set is
probably right, landing in `New`.

**Effort:** about half a day plus the API signup.

---

## 3. Skool — skip, or do by hand

**Verdict: maybe, and not worth it.**

The Skool directory is public but it is a JS app. Whether it can be read at all
depends on whether the data comes from an endpoint you can hit or only renders
in the browser, and its ToS is less permissive than an RSS feed.

**Recommendation:** do not build this. If a specific Skool community is worth
mining, open it by hand and use the existing **Add lead** button. Building a
fragile scraper for one source with a worse ToS is not a good trade against the
other two.

---

## Order

1. Podcast guests. Cleanest, no dependency, warm leads.
2. Booking-link search. Same value, one API key of friction.
3. Skool. Leave it manual.

## What not to do

- Do not add podcast or booking to the `ACTORS` map. They are not Apify actors,
  and wiring them there will send an empty run to Apify and bill for nothing.
- Do not try to find podcast feed URLs automatically. Take them as input.
- Do not import a guest whose name could not be extracted cleanly. Keep the
  episode title and let Ary read it, the same way the triage keeps a domain it
  could not read rather than guessing.
- Do not scrape Google directly for the booking search. Use the API.
