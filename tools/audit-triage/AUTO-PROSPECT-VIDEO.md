# auto-prospect, with the video

Two parts. First where the video goes in the sequence, which depends on whether
they have heard from you before. Then the changes to the `auto-prospect` skill
so the emails and the video come from the same verified facts.

---

# Part one: when to send it

The numbers below are the triage as of 22 July 2026. 78 SEND and 53 MAYBE, and
107 of those 131 are already at Email 3 or 4. So most of the list is the second
situation below, not the first.

| Stage | SEND | MAYBE |
|---|---|---|
| Email 4 | 33 | 29 |
| Email 3 | 30 | 15 |
| Email 2 | 10 | 6 |
| Email 1 | 5 | 3 |

## They already had the sequence and went quiet

This is 107 of the 131. Three or four emails, no reply.

A video is the only honest reason to write again. Not a follow-up, not a nudge,
and not a reply on the old thread. A new email, a new subject, about a thing you
found. Silence has already told you the old angle did not land, so repeating it
in a fifth email will not work either.

**Start with Email 3, not Email 4.** Thirty SEND prospects, recent enough to
remember the name and quiet enough that a normal follow-up will not move them.
Email 4 is the bigger pool and the colder one, so it is the second batch.

> Subject: your contact form
>
> Hi Jo.
>
> I went back and had another proper look at your site. The spam check on your
> contact page is showing an error instead of loading, so the form under it
> can't be sent. Anyone who filled that in never reached you.
>
> I recorded a short walkthrough, it's about ninety seconds:
> https://file.gobloomwired.com/video/peopleedge-com
>
> If it's already fixed on your end, ignore me.
>
> 🌸 Ary from bloomwired.io

The link is fine here. The deliverability rule that keeps links out of a first
cold email does not apply to someone who has already had four.

## Brand new prospect

The original shape holds. A link in a first cold email costs deliverability, and
that does not bend.

**Email 1**, 75 to 100 words, zero links. The video becomes the closing
question, which is a better ask than a generic one because it is concrete and
costs them nothing to say yes to.

1. Genuine noticed-and-liked line
2. The single strongest verified finding, in plain words
3. The escape hatch
4. "I recorded a short walkthrough showing it. Want me to send it over?"

> Hi Dennis.
>
> I was reading through your executive functioning pages, the bit about
> interruptions in the workplace is well put.
>
> One thing I noticed: the spam check on that page is showing an error instead
> of loading, so the form under it can't be sent. If someone filled that in this
> week it wouldn't have reached you.
>
> If that's already fixed, ignore me. I recorded a short walkthrough showing
> what I mean. Want me to send it over?
>
> 🌸 Ary from bloomwired.io

**Email 2**, day 3, fresh subject and thread, 30 to 50 words. Goes to everyone
who did not reply, not only the yeses.

> Hi Dennis.
>
> Here's the walkthrough I mentioned, it's about ninety seconds:
> https://file.gobloomwired.com/video/doolancoaching
>
> The captcha thing is at the start. Everything else is small.
>
> 🌸 Ary

Say the length, so it reads as a minute and not a pitch deck. Naming where in
the video the finding sits proves it is actually about them.

**Emails 3 to 5** unchanged. The video is spent by Email 2, and resending a link
nobody clicked does not make them click it.

## Running a batch

Prospects → the **Worth a video** chip → tick the rows → **Record videos**.

Two at a time, about three minutes and 580 credits each. The confirm states the
cost before it spends anything. Keep the tab open while it runs.

**Do five before you do seventy eight.** Five from Email 3 is about 2,900
credits and twenty minutes. If any reply, the rest are worth it. If none do,
that is worth knowing before spending 45,000 credits rather than after.

## What not to do

- Do not send a video to a prospect with no real findings. NO_VIDEO means their
  site is in good order, and a video that manufactures a problem is worse than
  no video.
- Do not put the link in Email 1 for a new prospect.
- Do not reply on the old thread for a quiet one. New subject, or it reads as
  the fifth follow-up.
- Do not describe anything in the email that is not in the video. They may well
  watch it, and the two disagreeing is worse than either being thin.
- Do not claim anything about what happens after their form is submitted. It
  cannot be seen from outside, and it is the one line a prospect has written
  back to correct.

## Before sending any of them

Watch it with their site open beside it. Every finding the audit has got wrong
was caught this way and never by reading the code. The checks that produced
false claims all looked correct until someone opened the site.

---

# Part two: changes to the skill

The problem this fixes: the skill's audit subagent reads sites with `web_fetch`,
which cannot run JavaScript. It cannot see a rendered load time, a form's real
field count, a booking button's destination, or a captcha erroring inside its
own iframe. So the emails describe a site the subagent guessed at, while the
video describes the site as it actually renders. They disagree, and the prospect
can tell.

## Replace Step 2 with this

### Step 2a: get the verified facts first

Before spawning the subagent, run the audit service against the prospect's
domain. This costs nothing and takes about fifteen seconds.

```powershell
$b = @{ url="https://THEIRDOMAIN.com"; dryRun=$true } | ConvertTo-Json
$audit = Invoke-RestMethod -Uri "$RENDER_URL/render" -Method Post -Headers @{"x-render-secret"=$SECRET} -ContentType "application/json" -Body $b
```

Three outcomes:

- **`$audit.blocked` is set** — the site refused us. Do not let the subagent
  claim anything about what is or is not on it. Audit by hand or skip.
- **No findings with `severity: real`** — the site is in good order. There is no
  video angle. Rate the prospect on its other merits and send the normal
  sequence without one.
- **One or more `real` findings** — these are the verified facts. Pass them to
  the subagent and render a video.

### Step 2b: spawn the subagent with the facts

Add this to the subagent prompt, above its own audit instructions:

```
## Verified findings (already checked on the live rendered site)

These came from a real browser. It loaded the page, followed the booking button,
opened the contact page, and read inside iframes. Treat them as established fact
and build the angle from them.

{PASTE $audit.findings AND $audit.info HERE}

Do not re-derive these with web_fetch and do not contradict them. web_fetch
cannot see any of it, so where your reading disagrees, this is right and you are
wrong. You may add context it cannot judge: whether the business looks alive,
review counts, social recency, the niche angle, whether they seem to prefer
manual scheduling.

A video of these findings has been recorded. Which email carries the link
depends on whether this prospect has heard from us before. See Part one.
```

## Storing the link

The render call returns it, and the app records it automatically when the video
lands. `video_url` on the prospect, and the **Videos ready** chip lists every
prospect that has one.
