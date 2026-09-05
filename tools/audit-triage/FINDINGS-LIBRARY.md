# Every finding the audit can make

Generated from the code, so it cannot drift from what actually ships.
Regenerate with `node dump-library.mjs`.

- **real** is spoken in the video. **minor** is recorded and never said.
- **good** is the one compliment the video opens with.
- Weight is what the triage scanner scores. 8 or more alone makes a prospect worth a video.
- At most three real findings are spoken per video, the three highest weighted.

## Spoken in the video (31)

### `noindex`  ·  weight 10

> There's a line in your code telling Google not to list your site. Usually left behind after a rebuild. Search site colon your domain, and if almost nothing comes back, that's why.

*On screen: card*

### `calendar-not-loading`  ·  weight 9

> Your booking page opens, but the calendar itself never loads. Just an empty space where the times should be. You'd probably never see it, because your browser has it cached from every other time you've looked. Someone new gets the blank version.

*On screen: own beat*

### `phone-mismatch`  ·  weight 9

> Your page shows ${shown}, but the link behind it dials ${dials}. Tap it on your phone and look at what comes up before you connect. If that second number is one you set up on purpose, ignore me.

*On screen: own beat*

### `bad-email`  ·  weight 8

> The email address on your site is ${f.detail}, which can't receive anything. Anyone who copies it out and writes to you gets a bounce, and you'd never know they tried.

*On screen: own beat*

### `insecure`  ·  weight 8

> Your site's still served over plain http instead of https. That means browsers put a "Not secure" warning right next to your address, which scares people off before they've read a word. It's usually a free fix with whoever hosts your site.

*On screen: own beat*

### `no-contact`  ·  weight 8

> I couldn't find a contact form, an email link, or a contact page anywhere. So someone who wants to work with you has nothing to click, and they're not going to hunt for it.

*On screen: own beat*

### `dead-links`  ·  weight 7

> ${f.detail} of the links on your site go to a page that isn't there any more. Someone clicking those gets an error instead of whatever you were sending them to, and you'd never see it happen.

*On screen: card*

### `mobile-overflow`  ·  weight 7

> On a phone, your layout runs about ${f.detail} pixels wider than the screen, so people have to scroll sideways just to read it. Open your own site on your phone and you'll see it straight away.

*On screen: own beat*

### `broken-images`  ·  weight 6

> ${f.detail} images on the page aren't loading, so visitors are seeing blank gaps where your images should be.

*On screen: own beat*

### `contact-page-no-form`  ·  weight 6

> I followed your contact link, and there's no form on that page either, so reaching out is harder than it needs to be.

*On screen: own beat*

### `ctas-collapse`  ·  weight 6

> You've got ${f.detail} different buttons on the page, and every one of them goes to the same place. So someone picking the option that fits them lands in the same general form as everyone else, and you can't tell which one they came for. Click any two and you'll see.

*On screen: own beat*

### `lead-magnet-open`  ·  weight 6

> Your "${f.detail}" link hands the file straight over, without asking for an email first. So you're giving the thing away and getting nothing back, and you've no idea who took it or how to follow up.

*On screen: own beat*

### `map-not-loading`  ·  weight 6

> The map on your site doesn't load, so there's just an empty box where directions should be. Same thing as the calendar: your browser's got it cached so it looks fine to you, and someone new gets the blank one.

*On screen: own beat*

### `stale-copyright`  ·  weight 6

> Your footer still says ${f.detail}. It's on every page, and it's the kind of thing that makes someone wonder whether you're still taking clients.

*On screen: card*

### `ancient-markup`  ·  weight 5

> The site's built with the kind of code people used before phones existed. Layout tables, font tags, that era. It's why it fights you on a phone, and it's the reason small changes turn into big ones.

*On screen: own beat*

### `booking-behind-login`  ·  weight 5

> Your booking link asks people to sign in before it shows any times. So someone who just wants to see if you're free has to make an account first, and most of them won't.

*On screen: own beat*

### `expired-date`  ·  weight 5

> There's still something dated ${f.detail} up on the site. Anyone finding that now either thinks it's current, or works out that nobody's been here in a while.

*On screen: own beat*

### `mixed-content`  ·  weight 5

> The page itself is on https, but a few things on it still load over plain http, and browsers block those outright. So parts of your page just aren't showing up.

*On screen: own beat*

### `slow`  ·  weight 5

> Your homepage took ${f.detail} seconds to finish loading. Open it on your phone on mobile data, not wifi, and you'll feel how long that is when you're waiting on it.

*On screen: own beat*

### `two-schedulers`  ·  weight 5

> You've got two booking systems linked from the site, ${f.detail}. Whichever one you stopped using is still reachable, so someone can book into the one you're not watching.

*On screen: own beat*

### `dead-link-one`  ·  weight 4

> : ''} that points at ${path}, and that page isn't there any more. Small thing, but whoever clicks it gets an error instead of what you meant to show them.

*On screen: card*

### `no-link-preview`  ·  weight 4

> When someone shares your site in a text or a DM, it turns up as a bare link with no picture and no description. Send yourself the link and you'll see what it looks like.

*On screen: own beat*

### `no-meta-description`  ·  weight 4

> You don't have a description set for search results, so Google is picking its own out of your page. It's the grey line under your link, and it's the bit people read before they click.

*On screen: card*

### `viewport`  ·  weight 4

> The site's missing its mobile viewport tag, so phones shrink the whole desktop layout down instead of laying it out properly for a small screen.

*On screen: own beat*

### `no-title`  ·  weight 3

> The page has no title tag, so your search results and browser tabs show a bare URL instead of your name.

*On screen: own beat*

### `quote-form-thin`  ·  weight 3

> Your quote form asks for a name and an email, but nothing about the actual job. No address, no idea what they need. So every request that comes in has to be chased before you can price it, and that's a round trip you're doing on every single one.

*On screen: own beat*

### `stale-stack`  ·  weight 3

> The site's still running ${f.detail}, which has been out of support for years. That usually means nobody's touched the setup in a long while, and it's where security and speed problems creep in.

*On screen: card*

### `booking-is-a-form`  ·  weight 2

> You're taking these as requests instead of letting people pick their own time, which I'd guess is on purpose so you can see who you're working with first. The part I'd look at is the gap after that. Every one of those turns into you going back and forth to find a time, and that's usually where people go quiet.

*On screen: card*

### `long-form`  ·  weight 2

> Your contact form asks for ${f.detail} separate things. On a phone that's a lot of typing, and every extra field loses a few more people before they hit send.

*On screen: own beat*

### `no-booking`  ·  weight 2

> There's no way to actually book you from the site. So every enquiry turns into a back and forth just to find a time that works, and that's usually where people go quiet.

*On screen: own beat*

### `no-reply-promise`  ·  weight 1

> Nothing on the page tells someone when they'll hear back. Even a line saying you reply within a day would stop them writing to two other people while they wait.

*On screen: own beat*

## The opening compliment (6)

### `cta`  ·  weight 4

> The main action's right there at the top, which is good. Someone landing on it knows right away what you want them to do.

*On screen: own beat*

### `booking`

> People can book you straight from the site, which is the main thing.

### `followup-tool`

> You've got real email tooling wired up, so something's catching people after they reach out.

### `form`

> Your contact form's right there on the page, so no one has to go hunting for it.

### `form-on-contact-page`

> There's a clear way to get in touch, which is the main thing.

### `phone`

> Your number's tappable, so someone on a phone can just press it and call you.

## Recorded but never spoken (11)

### `no-address`  ·  weight 2

*On screen: card*

### `no-local-schema`  ·  weight 2

*On screen: card*

### `booking-unknown`

### `console-errors`

### `contact-page-email-only`

### `form-email-only`

### `form-offpage`

### `no-h1`

### `phone-not-tappable`

### `phone-only`

### `sluggish`
