# Mining your own audits to widen the checklist

Paste this into your prospecting project in Claude, the one that has your past
audit chats and knowledge files. It reads what you have already noticed across
real sites and hands back a list in the shape the audit service can actually
use.

It writes nothing and changes nothing. The output comes back to Claude Code to
be turned into checks.

---

## The prompt

```
Read through this project's chat history and knowledge files and pull out every
specific thing I have ever noticed on a prospect's website.

I am building an automated audit that opens a site in a real browser and
records a short video of what is wrong. It already checks about twenty things.
I want to widen that list using what I actually notice by hand, because my own
observations are sharper than the generic ones.

## What to collect

Every concrete observation about a real site. Not advice, not strategy. The
thing I pointed at. For example, from my sent mail:

- a phone number in the text that differs from the click-to-call link
- an FAQ answering questions about a different service than the page is about
- a nav link pointing at the wrong page
- two booking systems live on the same site
- every page pointing at the same generic Book Now
- a homepage CTA that goes somewhere unexpected

## For each one, give me

| Field | What I need |
|---|---|
| observation | What I noticed, in my own words, quoted if you can find them |
| industry | Which kinds of business it applied to, or "any" |
| how often | How many separate sites I said it about |
| detectable | How a headless browser could find it, concretely. Say "no" if it needs judgement |
| owner can check | How the owner confirms it themselves in under a minute. Say "no" if they cannot |

## Rules

Sort by how often I said it. The ones I repeat are the ones worth automating.

Be strict about "detectable". "The copy is vague" is real but no browser can
judge it. "The tel: href does not match the visible number" is the same kind of
observation and a browser can check it exactly. I only want the second kind.

Be strict about "owner can check" too. A claim they cannot verify for
themselves is worse than no claim at all: they conclude the audit is wrong
rather than that they should look harder. Anything they cannot check in a
minute is not worth saying out loud.

Separate anything that only applies to trades, roofing, HVAC, plumbing,
contractors. Those businesses sell by quote, not by appointment, and the audit
already treats them differently.

Flag anything I said that turned out to be wrong, where the prospect replied to
correct me. Those are worth more than the hits.

End with the ten you would automate first, and why those ten.
```

---

## What comes back

Hand the output to Claude Code. Each row that is both detectable and
owner-checkable becomes a check in `services/audit-render/capture.mjs`, a
finding in `findings.mjs`, a line of narration in `narrate.mjs`, and a weight in
`tools/audit-triage/scan.mjs`. Anything failing either test gets left out on
purpose.
