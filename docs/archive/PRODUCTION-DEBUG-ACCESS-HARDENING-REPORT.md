# The debug passthrough was never public

Date: 2026-08-12 · commit `29ece4e` · Cloud Run `audit-render-00178-bqp` · tests 1,949 passing

The exposure this task set out to close did not exist. There is one debug flag
in the system, it sits behind a shared secret that is checked two lines into the
handler, and no route on the public app accepts or forwards it. That is proved
below against live production rather than asserted.

Two real weaknesses were found while proving it, and both are fixed.

**Spend: 0 credits.**

---

## Part 1 — the inventory

Searched `services/audit-render`, `app/api`, `lib` and `workers` for `debug`,
`?debug`, `debug=1`, `debug=true`, `includeDebug`, `diagnostic`, `trace`, and
every call site of `RENDER_URL`.

**One match in the entire codebase.**

| Surface | Public route | Upstream | What it exposes | Access check |
|---|---|---|---|---|
| `POST /precheck` with `{ debug: true }` | none — Cloud Run only | n/a, it is the renderer | `booking`, `bookingLink`, `bookingResolved`, `contact`, `form`, `homeCalendar`, and every crawled page with `kind`, `href`, `hasCalendar`, `asksForTime`, `furtherStep`, `clicked`, `form` | `x-render-secret`, checked before anything else in the handler |

Everything else that could have carried it does not:

- **No app route reads a debug parameter.** Zero matches for
  `searchParams.get('debug')`, `body.debug` or `body?.debug` anywhere in `app/`
  or `lib/`.
- **The app never forwards one.** `lib/precheck.mjs` posts exactly
  `{ url, ownFindings }` to the renderer. There is no code path from a query
  string on `leadsthatbloom.com` into the renderer's debug branch.
- **Five routes call `RENDER_URL`** (`audit-video/precheck`, `audit-video`,
  `visual-evidence`, `voice`, `voice-cache`). None passes a debug flag.
- **Every renderer route except `/health` carries the secret check**:
  `/precheck`, `/shots`, `/clone`, `/say`, `/render`, `/cache`, `/cache/audio`.

## Part 2 — production, before the change

Live, read-only, against `audit-render-…run.app`:

```
no secret,     {"debug":true}  ->  HTTP 403  {"error":"Forbidden"}
wrong secret,  {"debug":true}  ->  HTTP 403  {"error":"Forbidden"}
empty header,  {"debug":1}     ->  HTTP 403  {"error":"Forbidden"}
GET /health                    ->  HTTP 200  {"ok":true}
GET /cache                     ->  HTTP 403
GET /                          ->  HTTP 404
```

And on the app:

```
POST leadsthatbloom.com/api/audit-video/precheck  ->  HTTP 401
POST leadsthatbloom.com/api/outreach              ->  HTTP 401
```

> **Production debug output is currently reachable only by a caller holding
> `RENDER_SECRET`, because `POST /precheck` returns 403 on the second line of
> its handler and the debug branch is fifty lines below it.**

The 403 body is `{"error":"Forbidden"}` and nothing else: no stack, no
implementation detail, and no indication of whether the secret was missing,
wrong, or the wrong length.

## Part 3 — the access contract, unchanged

The existing mechanism already fits, so nothing new was invented. The renderer
is a server-to-server service whose canonical credential is `RENDER_SECRET`,
held by Cloudflare Pages and never sent to a browser.

| Caller | Normal call | Debug call |
|---|---|---|
| Public, no secret | 403 | 403, no payload |
| The app, server side | works | never asks for one |
| An operator holding the secret | works | full diagnostics |

Fails closed: an unconfigured `RENDER_SECRET` refuses everything rather than
opening everything.

**Chosen error behaviour: explicit 403.** This endpoint was never public — it
has always required the secret — so there is no compatibility argument for
silently stripping the flag, and a clear refusal is the honest answer. The
response says nothing about *why*.

## Part 4 — the query string was never the authorisation

The flag is read from the JSON body, and the gate runs before the body is
parsed. Knowing the flag exists gains nothing.

**Direct Cloud Run invocation cannot bypass anything**, because there is nothing
in front of it to bypass: the app does not proxy debug, so the renderer's own
check is the only boundary and it is the one being tested. Cloud Run ingress is
public by design — Cloudflare Workers call it over the internet — and every
route behind it refuses without the secret.

## Part 5 — the two real weaknesses

### The secret was compared with `!==`

String comparison short-circuits on the first differing byte, which is the
timing signal a character-at-a-time guess needs. The cron drain route already
compares its secret in constant time and explains why; the renderer guarded the
same class of thing and did not.

The check now lives in `services/audit-render/access.mjs` and uses
`crypto.timingSafeEqual`, with the length compared first because
`timingSafeEqual` throws on mismatched buffers — and a throw would turn a wrong
guess into a 500, which is its own signal.

It is in its own dependency-free file because the renderer's packages exist only
inside its container image, so nothing under `services/audit-render` can be
imported by the repo's test suite. The access decision is the part worth
testing, so it now lives somewhere testable.

### A non-string could have escalated

The first version coerced with `String(given)`. A test passed
`{ toString: () => SECRET }` and it was accepted. It cannot arrive that way over
HTTP — a header is always a string — but the function is no longer willing to
find out. Non-strings are refused outright.

That one was found by a test, not by reading the code.

## Part 6 — tests

`tests/debug-access.test.mjs`, 12 behavioural tests against the real `secretOk`:

- nothing, empty string, `undefined`, `null` — refused
- a wrong secret of exactly the right length — refused
- correct prefixes at seven-character intervals, padded and unpadded — refused
- leading or trailing whitespace, and a newline — refused
- wrong case — refused
- numbers, booleans, objects, arrays, and an object whose `toString` returns the
  secret — refused
- an unconfigured secret refuses everything, and cannot match itself
- the correct secret is accepted, whatever it contains, including unicode
- a mismatched length never reaches `timingSafeEqual`, so a wrong guess is a
  `false` and never a throw
- the function returns a boolean and nothing else

The route-ordering property is proved against live production above, which is
stronger evidence than a unit test of the same thing.

Suite: **1,949 passing**, up from 1,937.

## Part 7 — production acceptance, after deploying

### Unauthorised

```
no secret      ->  HTTP 403  {"error":"Forbidden"}
wrong secret   ->  HTTP 403  {"error":"Forbidden"}
same length    ->  HTTP 403  {"error":"Forbidden"}
GET /health    ->  {"ok":true}
```

### The app, with no session

```
POST /api/audit-video/precheck  ->  401
POST /api/outreach              ->  401
```

### Authorised, with the flag

```
HTTP 200
keys: ['booking-is-a-form']
debug fields: booking, bookingLink, bookingResolved, contact, form,
              homeCalendar, pages
pages returned: 1
```

The diagnostics that proved the booking and calendar work are intact.

### Authorised, without the flag

```
keys: ['booking-is-a-form']   has debug: false
```

Normal behaviour unchanged. The detector output is identical either way.

## Part 8 — logs

Cloud Run's access log records method, path and status for every request, so a
refused debug attempt is visible as a 403 on `/precheck` without anything being
added. Request headers are not logged, so the presented secret never appears.

The service's own logging was checked: `console.log` on stage timings, and
`console.error` on a failed render carrying the URL and the error message. **No
secret, cookie or authorization header is written anywhere.**

No per-request logging was added. The normal production path stays quiet, which
is what it should be.

## Part 9 — deployment

| | |
|---|---|
| Commit | `29ece4e` |
| Cloud Run revision | `audit-render-00178-bqp` |
| Traffic | 100% |
| Tests | 1,949 passing |
| Pages | unchanged, no app code touched |

## Part 10 — adjacent surface

Spot-checked the public app, bounded and read-only:

```
/api/system-health   401      /api/public/video-view  401
/api/settings        401      /api/cron/drain         401
/api/prospects       401      /api/gmail/push         401
/gate                200      renderer /              404
```

Every unauthenticated response is the same sentence:
`{"error":"Not authenticated. Enter your access code."}`. No stack traces, no
environment dumps, no config endpoints, no publicly listed screenshot or debug
URLs.

**No adjacent exposure found.** Nothing added to the backlog from this task.

One note rather than a finding: the debug payload contains crawl facts about
third-party websites — domains, page paths, form shapes. Not credentials, and
not reachable without the secret, but worth knowing it is business data rather
than only technical trivia.

## Safety

| | |
|---|---|
| Emails sent | 0 |
| `send_events` | unchanged |
| Package 19 | untouched: `APPROVED`, `sequence_approved` 1, `sequence_max_step` 2 |
| Cynthia | not mutated, not refreshed, not approved, not sent |
| Packages created or approved | 0 |
| Contacts adopted | 0 |
| Prospect persistence refreshes | 0 |
| Credits | **0** |
| Secrets rotated | none — the proof showed no exposure |
| Secret values printed | none, in terminal output or in this report |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

## Remaining backlog

1. a job in backoff looks identical to a stuck one
2. `select[name*=date i]` remains a weak calendar signal beyond the birthday filter
