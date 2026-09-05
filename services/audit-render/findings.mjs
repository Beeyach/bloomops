// What counts as a problem, and what is just how websites are built.
//
// This exists because the audit was padding. It ran a fixed checklist and
// narrated every item whether or not it was interesting, which produced lines
// like "your contact form is on your contact page, that costs you enquiries".
// Putting a form on /contact is how nearly every site is built. Calling it a
// defect manufactures a problem to fill time, and an owner who knows their own
// site reads it as exactly that, which then taints the findings that are real.
//
// So every finding carries a severity:
//
//   good   worth one approving sentence at most
//   minor  true, but not worth a prospect's attention. Recorded, never spoken.
//   real   actually costs them something. This is what gets said.
//
// An audit that sometimes concludes "this is in decent shape" is far more
// convincing than one that always finds three problems, because the second is
// obviously a template.

// Slower than this and a measurable share of visitors leave before it paints.
const SLOW_MS = 4000;
const SLUGGISH_MS = 2500;

// Anything wider than the viewport means sideways scrolling on a phone.
// A few pixels is usually a rounding artefact, not a broken layout.
const OVERFLOW_PX = 12;

import { isSchedulerUrl } from './booking-intent.mjs';

export function deriveFindings(facts, pages, checks) {
  const f = [];
  // A captcha with a bad key blocks that form completely, so it is stated
  // first. It is NOT treated as breaking every form on the site: on
  // doolancoaching.com the error is on a service page while /contact/ is
  // clean, so suppressing the other findings, or saying nobody can reach him
  // at all, would have overstated it in the other direction.
  const captchaPage =
    (Array.isArray(pages) && pages.find((p) => p.captchaBroken)) || (checks.captchaBroken ? { href: null } : null);
  // Aggregated across the landing page and everything the crawl opened. Judging
  // any of this from the home page alone was the root of most of the wrong
  // claims: the form lives on /contact and the booking widget lives on /book.
  const list = Array.isArray(pages) ? pages : pages ? [pages] : [];
  const contact = list.find((p) => p.form) || list.find((p) => p.email) || list[0] || null;
  const anyBooking = checks.booking || (list.some((p) => p.booking) ? { vendor: 'a booking tool' } : null);
  // Declared here rather than beside the booking chain that also uses it.
  // The enquiry chain above needs it too, and a const read before its own
  // line is the 'Cannot access before initialization' crash this file has
  // already been bitten by once.
  const onScheduler = (u) => isSchedulerUrl(u);
  const anyPromise = checks.replyPromise || list.some((p) => p.replyPromise);
  const add = (severity, key, detail) => f.push({ severity, ok: severity === 'good', key, ...(detail ? { detail } : {}) });

  if (captchaPage) {
    let where = null;
    try {
      where = captchaPage.href ? new URL(captchaPage.href).pathname.replace(/^\/|\/$/g, '').replace(/-/g, ' ') : null;
    } catch {}
    // The URL rides along so the walkthrough can go and film it. This is the
    // one finding worth showing rather than describing: a red error where a
    // captcha should be is not something anyone argues with.
    f.push({ severity: 'real', ok: false, key: 'captcha-broken', detail: where, href: captchaPage.href || null });
  }

  // ---- the landing experience -------------------------------------------
  // A styled button earns the compliment. The problem is only raised when
  // nothing above the fold even reads like an action, which is what the line
  // actually claims. An action that is there but does not look like a button
  // gets neither, and saying nothing is the right answer to a case we cannot
  // call: three separate videos told owners there was nothing up there to
  // click while a Book button sat on screen.
  if (facts.cta) add('good', 'cta', facts.cta.text);
  else if (!facts.actionAboveFold) add('real', 'cta');

  // ---- can they reach you -----------------------------------------------
  // A form on a contact page is normal. It is only a problem when there is no
  // way to make contact at all.
  //
  // An enquiry does not have to start on their website.
  //
  // resilientintimacy.com is why this is here. Her contact page carries no
  // HTML form, so the chain below reached "contact page has no form" and the
  // planner turned that into a lead-capture gap. Her home page has a "Request
  // an Appointment" button pointing at kori-hennessy.clientsecure.me, which is
  // a SimplePractice client portal: the enquiry path exists, it is deliberate,
  // and it is off her site. Telling a therapist nobody can reach her while her
  // own intake portal is one click away is the same class of error as telling
  // James Pearson his booking was only a form.
  //
  // Suppression is the fail-closed direction here, which is why a recognised
  // scheduling or intake host is enough on its own: the worst case is that LTB
  // stays quiet about a business that may genuinely have a gap. Requiring the
  // destination to be fetched before we agree to say NOTHING would be failing
  // open, which is the mistake this exists to prevent.
  const offsiteEnquiry =
    onScheduler(facts.bookingLink?.href) ||
    (facts.links || []).some((l) => onScheduler(l?.href)) ||
    (facts.navLinks || []).some((l) => onScheduler(l?.href)) ||
    list.some((p) => onScheduler(p?.clicked?.landedOn)) ||
    list.some((p) => onScheduler(p?.href));

  if (facts.form) add('good', 'form');
  else if (contact?.form) add('good', 'form-on-contact-page', facts.contactPage?.text);
  else if (facts.email) add('minor', 'form-email-only', facts.email.text);
  else if (contact?.email) add('minor', 'contact-page-email-only', contact.email.text);
  // Recorded, never spoken. There is an enquiry path; it is simply not a form
  // on their own page, and that is a choice rather than a fault.
  else if (offsiteEnquiry) add('minor', 'enquiry-offsite');
  else if (contact) add('real', 'contact-page-no-form');
  else if (facts.contactPage) add('minor', 'form-offpage', facts.contactPage.text);
  else if (facts.phone || facts.phoneInText) add('minor', 'phone-only');
  // Same rule at the bottom of the chain. "No way to contact them" is the
  // strongest wording on the list and must not survive a working intake link.
  else if (!offsiteEnquiry) add('real', 'no-contact');
  else add('minor', 'enquiry-offsite');

  // A missing phone number is not a defect. Plenty of shops sell perfectly
  // well without one. Only the tappability is worth a mention, and only when
  // a number is actually printed on the page.
  if (facts.phone) add('good', 'phone', facts.phone.text);
  else if (facts.phoneInText) add('minor', 'phone-not-tappable', facts.phoneInText);

  // ---- does it work ------------------------------------------------------
  // These are the ones an owner cannot see for themselves, which is what makes
  // them worth sending.
  if (checks.insecure) add('real', 'insecure');
  else if (checks.mixedContent) add('real', 'mixed-content');

  if (checks.mobileOverflowPx > OVERFLOW_PX) add('real', 'mobile-overflow', String(Math.round(checks.mobileOverflowPx)));
  else if (!facts.hasViewportMeta) add('real', 'viewport');

  // A site on the far side of the planet is measured across a link its own
  // visitors never use.
  //
  // The renderer runs in us-east1, and nineteen of the thirty-three sites told
  // they were slow are Australian. One of them wrote back to say it loads fast
  // for them, and they were right: it does, for anyone in Australia. What was
  // measured was the distance from Virginia.
  //
  // So a distant site has to be slow by more than that distance can explain
  // before anything is said. Three seconds of headroom is generous against a
  // transpacific round trip, which is the point: a claim about speed is one the
  // owner tests instantly against their own screen, and losing that argument
  // costs every other finding in the video.
  const slowAt = checks.farFromRenderer ? SLOW_MS + 3000 : SLOW_MS;
  const sluggishAt = checks.farFromRenderer ? SLUGGISH_MS + 3000 : SLUGGISH_MS;
  // Written report only, on Ary's call: a seconds figure read out loud
  // invites arguing about the number, and the number moves between runs.
  if (checks.loadMs >= slowAt) add('minor', 'slow', (checks.loadMs / 1000).toFixed(1));
  else if (checks.loadMs >= sluggishAt) add('minor', 'sluggish', (checks.loadMs / 1000).toFixed(1));

  // When every broken image came from one outside host, name the host instead
  // of counting the gaps. They did not break one at a time, the service they
  // were loaded from went away, and that is both the more useful thing to tell
  // someone and the more obviously true one.
  if (checks.deadImageHost && checks.brokenImages >= 3) {
    add('real', 'dead-image-host', `${checks.brokenImages}|${checks.deadImageHost}`);
  } else if (checks.brokenImages >= 3) add('real', 'broken-images', String(checks.brokenImages));
  else if (checks.brokenImages > 0) add('minor', 'broken-images', String(checks.brokenImages));

  // failed-requests is deliberately not a finding any more. It fired on two
  // sites where a person looking at the page could find nothing wrong, even
  // after the noise filtering, and its own narration had to excuse itself with
  // "some of that's invisible to you if it's cached" — which is an admission
  // that the owner cannot check it. A claim the recipient cannot verify costs
  // more than saying nothing: they conclude the audit is wrong, not that they
  // should look harder. Anything genuinely broken and visible is caught by
  // broken-images and dead-links, which both name specifics.
  if (checks.consoleErrors > 0) add('minor', 'console-errors', String(checks.consoleErrors));

  // Search. Every one of these is something the owner can confirm themselves
  // in under a minute, which is the bar: an SEO claim they cannot check reads
  // as consultant noise, and they will not go looking.
  //
  // noindex first, because it outranks everything else on the page. A site
  // carrying it is not in Google at all, however good the rest of it is.
  // These are collected in runChecks, so they arrive on `checks`, not `facts`.
  // Reading them off `facts` gave undefined, which every one of these tests
  // reads as "missing", and peopleedge.com.au was told it had no search
  // description while carrying a perfectly good 187-character one.
  // Ary's own catches, from about 250 sent audits. Both of the observations a
  // prospect ever wrote back to confirm were link problems, and the phone
  // mismatch is the one people are most surprised by, because the page looks
  // completely fine until you tap it.
  if (checks.phoneMismatch) {
    add('real', 'phone-mismatch', `${checks.phoneMismatch.shown}|${checks.phoneMismatch.dials}`);
  }
  if (checks.badEmail) add('minor', 'bad-email', checks.badEmail);
  // Several differently-labelled actions all landing in the same place. Three
  // or more labels collapsing to one destination, so a page offering a choice
  // is not actually offering one. Two is normal (a header and a footer button).
  const cta = checks.ctaTargets;
  if (cta && cta.labels >= 3 && cta.targets === 1) {
    add('real', 'ctas-collapse', String(cta.labels));
  }
  if (checks.expiredDate) add('real', 'expired-date', checks.expiredDate);
  // A free download that hands the file over without asking for anything. The
  // guide goes out and nothing comes back, which is the whole point of it.
  if (checks.openLeadMagnet) add('real', 'lead-magnet-open', checks.openLeadMagnet);
  // Demoted from spoken to written, along with stale-stack, no-meta-description
  // and no-reply-promise below. None of the four can be checked by the owner
  // against their own screen, which is what separates a finding that earns a
  // reply from one that reads as jargon or invention. They still count toward
  // the written report; they no longer take a spoken slot.
  if (checks.ancientMarkup) add('minor', 'ancient-markup');
  // The booking page loaded and the calendar did not.
  if (contact?.deadEmbed || checks.deadEmbed) add('real', 'calendar-not-loading');
  // Same class of finding as the dead calendar: a widget visibly not doing
  // its job, provable on camera, and invisible to the owner whose browser
  // cached the working version.
  if (checks.deadFeed) add('real', 'social-feed-dead');
  // A form that "sends" via the visitor's own mail app. The suggestion in the
  // spoken line is the fix Ary sells: a real form, and why it is better for
  // the visitor too.
  if (checks.mailtoForm) add('real', 'mailto-form');
  if (checks.deadMap) add('minor', 'map-not-loading');
  if (checks.noLinkPreview) add('minor', 'no-link-preview');
  if (Array.isArray(checks.bookingVendors) && checks.bookingVendors.length > 1) {
    add('real', 'two-schedulers', checks.bookingVendors.slice(0, 2).join(' and '));
  }

  if (checks.noindex) add('real', 'noindex');
  // Also back in the spoken set, reworded off the jargon: the claim is about
  // what people read when they search, not about a meta tag.
  if (checks.metaDescription === null) add('real', 'no-meta-description');
  if (checks.hasLocalSchema === false) add('minor', 'no-local-schema');
  if (checks.hasAddress === false) add('minor', 'no-address');

  // Links that are actually gone. The owner cannot see these without clicking
  // every link on their own site, which nobody does.
  const allDead = Array.isArray(checks.deadLinks) ? checks.deadLinks : [];
  // A dead item in the navigation gets its own finding ahead of the generic
  // count: the menu is the most clicked strip of the site, dropdown items
  // included, so this is the dead link an owner's own customers actually hit.
  const navDead = allDead.find((d) => d.nav);
  if (navDead) {
    add('real', 'nav-dead-link', [navDead.text || '', navDead.path || ''].join('|'));
  }
  const dead = allDead.filter((d) => d !== navDead);
  if (dead.length >= 2) add('real', 'dead-links', String(dead.length));
  else if (dead.length === 1) {
    // Described well enough to be found: what it is, roughly where it sits, and
    // where it points. A link nobody can locate is a claim nobody can check.
    const d = dead[0];
    const r = typeof d.atRatio === 'number' ? d.atRatio : null;
    const where = r === null ? '' : r < 0.25 ? 'near the top of your homepage' : r < 0.6 ? 'about halfway down your homepage' : 'near the bottom of your homepage';
    const what = d.isImage ? 'an image' : d.text ? `the "${d.text}" link` : 'a link';
    add('real', 'dead-link-one', [what, where, d.path].filter(Boolean).join('|'));
  }

  // A footer still claiming a year long past reads as nobody being home.
  // Two years is a typo; four is a signal, and it is sitting on every page.
  const thisYear = new Date().getFullYear();
  const age = checks.copyrightYear ? thisYear - checks.copyrightYear : 0;
  if (age >= 3) add('real', 'stale-copyright', String(checks.copyrightYear));
  else if (age === 2) add('minor', 'stale-copyright', String(checks.copyrightYear));

  if (!checks.hasH1) add('minor', 'no-h1');
  if (!facts.title) add('real', 'no-title');
  else {
    // A tab still reading the template default. The owner can check it in one
    // glance at their own browser, and it is also the headline Google shows,
    // which makes it the rare finding that is both trivial to verify and
    // genuinely costing them. Only bare defaults count: "Home | Bloom Salon"
    // has the business name in it and is fine.
    const t = String(facts.title).trim();
    if (/^(home|home page|welcome|index|untitled|new page|my site|my blog)$/i.test(t) || /just another wordpress site/i.test(t)) {
      add('real', 'default-title', t.slice(0, 40));
    }
  }

  // Template filler still in the copy. Nothing says "nobody finished this
  // site" louder, and the quoted words are on screen while it is said, so
  // the claim verifies itself.
  // Detail carries "snippet|page" when the filler was found on a subpage, so
  // the spoken line and the card can say where to look.
  if (checks.placeholderText) {
    add('real', 'placeholder-text', checks.placeholderPage
      ? `${checks.placeholderText}|${checks.placeholderPage}`
      : checks.placeholderText);
  }

  // A social icon that points at the platform's own homepage instead of the
  // business's page. Template leftover, instantly checkable: tap it and you
  // land on your own feed. Only exact platform roots count — a link to a
  // real profile path is fine, whatever it looks like.
  const SOCIAL_ROOT = /^https?:\/\/(?:www\.)?(facebook|instagram|tiktok|linkedin|youtube|twitter|x)\.com\/?$/i;
  const stub = (facts.links || []).find((l) => SOCIAL_ROOT.test(l.href || ''));
  if (stub) {
    const platform = stub.href.match(SOCIAL_ROOT)[1].toLowerCase();
    const NAME = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube', twitter: 'X', x: 'X' };
    add('real', 'social-stub', NAME[platform] || platform);
  }

  // Absence claims, which are the easiest kind to be wrong about, so both are
  // guarded twice. The page must have had real text to search — a thin render
  // proves nothing about what the business publishes — and the detection is
  // deliberately generous the other way: anything that might be hours or a
  // review mutes the finding, because a wrongly muted line costs nothing and
  // a wrong accusation costs the reply. The spoken wording carries its own
  // out for whatever lives somewhere the probe cannot see.
  if ((checks.bodyChars || 0) > 600) {
    if (checks.hasHours === false) add('real', 'no-hours');
    if (checks.hasReviews === false) add('real', 'no-reviews');
  }

  // ---- what happens after someone enquires --------------------------------
  // The technical checks above are hygiene. This is the part that is actually
  // being sold: a site can be flawless and still lose every lead that fills in
  // the form. These only apply when there is something to enquire through.
  const reachable = facts.form || contact?.form || facts.email || contact?.email;

  // A "Book Now" button is not a booking system. On achievewellnesscenters.com
  // it leads to a form with a free-text "Time" box: the visitor types when they
  // would like and waits for a human to confirm. Reporting that as "no way to
  // book you from the site" was wrong, and obviously wrong to an owner looking
  // at their own Book Now button. The distinction that matters is whether
  // anyone can actually pick a time.
  // Reuses the crawl's own classification rather than re-deriving it from the
  // URL. A first attempt re-tested the href with a narrower regex and missed a
  // page the crawl had already labelled 'book' because it was matched on the
  // word "consultation", so the site was told it had no booking path while its
  // booking page sat in the crawl results.
  // Resolves the Book button to the page it actually opens, including when
  // that page was already crawled under another name. doolancoaching.com's
  // "Book An Appointment" and its "Contact" link both point at /contact/, so
  // the booking destination had been visited and measured but was not
  // recognised as the booking destination, and the audit stayed silent about
  // a booking path it had already seen.
  const samePath = (a, b) => {
    try {
      const x = new URL(a);
      const y = new URL(b);
      return x.hostname.replace(/^www\./, '') === y.hostname.replace(/^www\./, '') &&
        x.pathname.replace(/\/$/, '') === y.pathname.replace(/\/$/, '');
    } catch {
      return false;
    }
  };
  const bookish =
    list.find((p) => p.kind === 'book') ||
    (facts.bookingLink?.href ? list.find((p) => samePath(p.href, facts.bookingLink.href)) : null) ||
    list.find((p) => /book|appointment|schedul|reserve/i.test(p.href + ' ' + (p.text || '')));
  // Which crawled page the chain below is reasoning about, or null when none
  // matched. Every branch turns on this, so returning it is what makes the
  // decision reconstructable from the response instead of from the source.
  facts.bookingResolved = bookish
    ? {
      href: bookish.href ?? null, kind: bookish.kind ?? null,
      hasCalendar: bookish.hasCalendar ?? null, furtherStep: bookish.furtherStep ?? null,
      asksForTime: bookish.asksForTime ?? null, clicked: bookish.clicked ?? null,
      form: bookish.form ? { fields: bookish.form.fields ?? null } : null,
    }
    : null;
  // Positive evidence of a real calendar, from anywhere the crawl actually
  // looked, beats the negative inference that booking is only a request form.
  //
  // sabinelehnhardt.com is the case this exists for. Her "Book your free
  // Session" opens an Acuity calendar, all four crawled pages came back
  // hasCalendar TRUE, and the audit still told her that her booking was a
  // request form and not a calendar — because the only calendar the chain
  // below consulted was the home page's. The evidence was sitting in the same
  // object, which is the second time that has been the shape of this bug.
  //
  // A page's hasCalendar is already pickers || slotUi || vendorFrame, so one
  // field covers all three of them.
  const realBooking =
    Boolean(facts.homeCalendar) ||
    Boolean(contact?.hasCalendar) ||
    list.some((p) => p.hasCalendar) ||
    list.some((p) => onScheduler(p.clicked?.landedOn)) ||
    onScheduler(facts.bookingLink?.href);

  // Moved down to here from among the embed checks, where it read `bookish`
  // sixty lines before the const that declares it. A const is hoisted but not
  // initialised, so that threw "Cannot access 'bookish' before initialization"
  // and killed the whole audit — but only on a site whose contact page is
  // behind a sign-in, because && short-circuits and never evaluated it
  // otherwise. macdonaldfitness.ca was the first one to hit it.
  //
  // A sign-in wall in front of the times. Only when we actually followed the
  // booking link and landed on one, never inferred.
  if (contact?.behindLogin && (bookish || facts.bookingLink)) add('minor', 'booking-behind-login');

  if (anyBooking) add('good', 'booking', anyBooking.vendor);
  // Every request-form arm below this line is unreachable once a real calendar
  // has been seen anywhere. That is the precedence, and it lives in one place.
  else if (realBooking) add('good', 'booking');
  // Confident only when the booking control was actually followed and still no
  // calendar appeared, or when the form asks the visitor to type a time, which
  // a calendar never needs to do. Otherwise the flow may continue somewhere we
  // did not go, and nothing is claimed.
  // Confident when the booking destination was actually opened and no calendar
  // was there: either it was clicked through, or the Book button led to a page
  // that was crawled, or the form asks the visitor to type a time, which a
  // calendar never needs to do.
  //
  // `furtherStep` is the crawler saying the booking flow continues past this
  // page. Following a Book control and finding no calendar on the page it
  // lands on proves nothing when the flow has another step: a service list
  // where you choose what you want before you choose when is a real booking
  // flow, and its first screen has no times on it by design.
  //
  // James Pearson Coaching is the case. Book Your Free Discovery Call leads to
  // go.jamespearson.coach/discoverycall, /book-online was crawled and returned
  // hasCalendar false with furtherStep TRUE — the crawler already knew the
  // flow went on — and this branch claimed his booking was only a request
  // form anyway. The data to get it right was sitting in the same object.
  //
  // asksForTime stays unconditional: a form that makes the visitor type a
  // preferred time IS the request-form behaviour, whatever comes next.
  else if (
    bookish?.asksForTime ||
    ((bookish?.clicked && !bookish.clicked.failed) ||
      (bookish?.form && facts.bookingLink?.href && samePath(bookish.href, facts.bookingLink.href)))
      && !bookish?.furtherStep
  )
    addIf(add, quoteFinding(checks, facts, contact, 'booking-is-a-form'));
  // Followed, no calendar yet, and the flow continues. Not settled, so nothing
  // is claimed about it.
  else if (bookish?.furtherStep) add('minor', 'booking-unknown');
  else if (bookish) add('minor', 'booking-unknown');
  // "Book a Conversation" that scrolls to a form on the same page. The crawler
  // skips same-page links, so this used to fall through to "no way to book you
  // from the site" on a site whose own button says Book.
  else if (facts.bookingLink?.samePage && facts.form && !facts.homeCalendar)
    addIf(add, quoteFinding(checks, facts, contact, 'booking-is-a-form'));
  else if (facts.bookingLink) add('minor', 'booking-unknown');
  // A form and no calendar is not "no way to book you". It is a booking taken
  // as a request, which is what booking-is-a-form already says and says
  // sympathetically. rainbowdotspirituality.com has no Book button and no
  // scheduler anywhere, so nothing above matched and it fell to the strongest
  // wording on the list, telling a business with eleven forms on its homepage
  // that there is no way to book them.
  //
  // The claim worth making was never that booking is absent. It is that there
  // is no calendar, so nobody can pick a time and every request becomes a
  // conversation about when. That is the same thing said truthfully.
  //
  // This used to emit booking-is-a-form, and it was the false positive.
  //
  // Read what reaching this line actually means: no booking control was found,
  // none was followed, no calendar was seen — and the site has a form. From
  // that the old code concluded "booking is a request form, not a calendar",
  // which is a claim about a booking flow nobody ever located. It is made from
  // the ABSENCE of a discovered link, not from having found and inspected one.
  //
  // James Pearson Coaching has a live Wix Bookings page at /book-online with a
  // service list and a Book your Free Discovery Call action. The crawl never
  // visited it, so nothing above matched, and LTB was one approval away from
  // telling him his booking was only a form. He would have opened the email,
  // looked at his own site, and known we had not.
  //
  // Booking on its own route is normal on Wix, Squarespace and WordPress
  // alike, and this branch cannot tell "there is no calendar" from "we did not
  // find the page with the calendar on it". So it now says the second thing,
  // which is the one it knows. booking-unknown is recorded and never spoken,
  // so the prospect keeps every other finding and makes no claim about
  // booking.
  //
  // Emitting the claim again requires bounded route discovery — sitemap, nav
  // and footer links, known scheduling hosts — that fetches each candidate and
  // reads it before concluding anything. Until that exists, this fails closed.
  else if (facts.form || contact?.form) add('minor', 'booking-unknown');
  else if (reachable) addIf(add, quoteFinding(checks, facts, contact, 'no-booking'));

  // Recorded, never spoken. A long form is usually a decision rather than a
  // fault: a therapist needs the insurance and the presenting concern, a
  // contractor needs the address and the job, and asking up front saves them a
  // screening call. The line said every extra field loses a few more people,
  // which is a marketing truism and not something checked about this business.
  //
  // This is the same lesson booking-is-a-form already learned, where a request
  // form was rewritten as a deliberate way of screening people rather than a
  // problem. The count stays in the findings for reference; nothing graded
  // minor is ever said out loud.
  const fields = contact?.form?.fields ?? facts.form?.fields ?? 0;
  if (fields >= 6) add('minor', 'long-form', String(fields));

  if (reachable && !anyPromise) add('minor', 'no-reply-promise');

  // ---- how old is this thing ----------------------------------------------
  // Only stated when the site says so itself. A jQuery major version is the
  // most reliable age signal on a page: 1.x and 2.x have been out of support
  // for years, so a site still shipping one has not been touched in a long
  // time. The platform name is reported without a version unless the site
  // published one, because guessing a version wrong in a sales video is worse
  // than not mentioning it at all.
  const jqMajor = parseInt(String(facts.jquery || '').split('.')[0], 10);
  // Back in the spoken set on Ary's call, with the wording carrying the why:
  // not tech trivia, but what an old platform costs them in practice.
  if (Number.isFinite(jqMajor) && jqMajor < 3) add('real', 'stale-stack', `jQuery ${facts.jquery}`);
  else if (facts.platform?.version && /^wordpress$/i.test(facts.platform.name)) {
    const major = parseInt(facts.platform.version.split('.')[0], 10);
    if (Number.isFinite(major) && major < 6) add('real', 'stale-stack', `WordPress ${facts.platform.version}`);
  }

  // Present only. Absence is not evidence here: plenty of businesses follow up
  // from a CRM, a phone, or a shared inbox that leaves no trace in the page
  // source. "I could not see a mailing tool" is not "you do not follow up".
  if (checks.followupTool) add('good', 'followup-tool', checks.followupTool);

  // Already on GoHighLevel. Never spoken as a finding; the narration reads it
  // to add the comfort line, and the written report can note it. Minor so it
  // can never take a spoken slot or be picked as the opener.
  if (checks.onGhl) add('minor', 'on-ghl');

  return f;
}

// What the video and the narration both work from, so the picture cannot end
// up boxing something the voice never mentions. One approving line at most,
// then everything that actually matters.
// How much a problem actually costs them, which is not the same as how easy it
// is to spot. A captcha erroring so nobody can send the form outranks a stale
// copyright year by a mile, and the video should lead with the first one even
// though the second is the more obvious thing to notice.
//
// Mirrors the weights the triage scanner scores with, so the finding that made
// a prospect worth a video is the finding the video opens on.
const IMPACT = {
  'captcha-broken': 10,
  noindex: 10,
  'no-contact': 8,
  insecure: 8,
  'mobile-overflow': 7,
  'dead-links': 7,
  'nav-dead-link': 8,
  'contact-page-no-form': 6,
  'broken-images': 6,
  // Ranked above a scattering of broken images: it is every thumbnail at once,
  // it can be shown on camera, and the cause can be named outright.
  'dead-image-host': 7,
  'stale-copyright': 6,
  'mixed-content': 5,
  'dead-link-one': 4,
  'no-meta-description': 4,
  'stale-stack': 4,
  viewport: 4,
  cta: 4,
  'no-title': 3,
  'default-title': 7,
  'no-reviews': 5,
  'no-hours': 4,
  'booking-is-a-form': 2,
  'no-booking': 2,
  'quote-form-thin': 3,
  'phone-mismatch': 9,
  'placeholder-text': 8,
  'social-stub': 5,
  'bad-email': 8,
  'two-schedulers': 5,
  'ctas-collapse': 6,
  'calendar-not-loading': 9,
  'mailto-form': 7,
  'social-feed-dead': 6,
  'map-not-loading': 6,
  'booking-behind-login': 5,
  'no-link-preview': 4,
  'lead-magnet-open': 6,
  'expired-date': 5,
  'long-form': 2,
};

// Five at most, against a two minute ceiling. Three fitted ninety seconds, and
// ninety seconds was the brief until the ceiling moved.
//
// Still capped, and not because of length alone: a list of eight things stops
// sounding like someone looked and starts sounding like a report. The strongest
// few are also the ones most likely to get a reply. Whatever is not spoken
// stays in the findings and can go in the email.
//
// Three, down from five. Ary's shape for a video is compliment, problem,
// connector, problem, connector, problem, close, and five problems overran it
// into the same list-reading the cap exists to prevent.
const MAX_SPOKEN = 3;

// What to say to a quote-led business where an appointment business would hear
// about booking. A roofer is not missing a calendar and never wanted one.
//
// The only thing worth claiming about their form is what it actually asks for,
// because they can open it and see. What happens AFTER the form is deliberately
// never a finding: it is invisible from outside, and it is the single line a
// prospect wrote back to correct, with "It's automated. I have a system. Now
// you know." Returning null says nothing at all, which is the right answer when
// their form already asks about the job.
// quoteFinding returns null when there is nothing worth saying, which is a
// real answer for a trade whose form already asks about the job.
const addIf = (add, key) => { if (key) add('real', key); };

function quoteFinding(checks, facts, contact, appointmentKey) {
  if (!checks.quoteLed) return appointmentKey;
  const form = contact?.form || facts.form;
  if (!form) return null;
  return form.asksAboutJob === false ? 'quote-form-thin' : null;
}

// A compliment that argues with something the video is about to call a problem.
// zentasticmassage.com.au drew both "there's a clear way to get in touch, which
// is the main thing" and, moments later, "someone who lands ready to get in
// touch has to go hunting for how". Each line is true on its own and the pair
// is nonsense, which is worse than either: a viewer who catches the video
// contradicting itself stops believing the parts that were right.
//
// Keyed by the compliment, listing the problems it cannot sit beside. Only
// genuine collisions belong here. Praising the phone while criticising the
// footer is not a contradiction, it is just a video about two things.
const CONTRADICTS = {
  // Both speak to whether making contact from the landing page is easy.
  // A mailto form is a form the compliment must not praise.
  form: ['cta', 'no-contact', 'contact-page-no-form', 'mailto-form'],
  'form-on-contact-page': ['cta', 'no-contact', 'contact-page-no-form', 'mailto-form'],
  'form-email-only': ['no-contact', 'contact-page-no-form'],
  cta: ['cta', 'ctas-collapse'],
  // Praising the booking flow while saying it is missing, gated, a request
  // form, or visibly broken.
  booking: ['no-booking', 'booking-is-a-form', 'calendar-not-loading'],
  phone: ['phone-mismatch'],
};

// Problems that must not be raised together, whichever of them ranked higher.
// Unlike CONTRADICTS, which is about a compliment arguing with a problem, these
// are problems that overlap: saying both is repeating one point in two ways and
// spends the video's three slots on a single idea.
//
// Keyed by the one that survives, listing what it suppresses.
const SUPERSEDES = {
  // A site served entirely over plain HTTP cannot have a mixed-content problem:
  // there is no secure page for the insecure parts to be mixed into.
  insecure: ['mixed-content'],
  // Four ways of saying the search listing is not set up. One is a point, four
  // is a lecture, and they land on the same fix.
  'no-title': ['no-meta-description', 'no-local-schema'],
  'no-meta-description': ['no-local-schema'],
  // Two nearly identical dead-link sentences in one video is a lecture. The
  // menu one is the stronger story and it wins the slot; a herd of others
  // ('dead-links', count form) is different enough to keep.
  'nav-dead-link': ['dead-link-one'],
  // The tab title and the search description are one point to an owner: "your
  // Google listing looks unfinished". Two near-identical openers in one video
  // read as a loop, so the stronger claim wins the slot.
  'default-title': ['no-meta-description'],
};

// What the video will actually say, in a handful of words. The tracker used
// to store the finding KEYS here, so the card showed "nav-dead-link" and
// "placeholder-text" and Ary had to know the codebase to read her own
// pipeline. These are the same findings in plain words, in the order the
// video raises them, so the chips on the card are a preview of the script.
const PLAIN = {
  cta: 'No button above the fold',
  'no-contact': 'No way to contact them at all',
  'contact-page-no-form': 'Contact page has no form',
  'mailto-form': 'Form opens their mail app instead of sending',
  'captcha-broken': 'Spam check erroring, so the form cannot send',
  'calendar-not-loading': 'Booking calendar never loads',
  'social-feed-dead': 'Instagram feed on the page is dead',
  'nav-dead-link': 'Dead link in the main menu',
  'dead-links': (d) => `${d} dead links`,
  'dead-link-one': 'A dead link on the page',
  'broken-images': (d) => `${d} images not loading`,
  'dead-image-host': (d) => `Images gone: ${String(d).split('|')[1] || 'their image host'} is down`,
  'phone-mismatch': 'Phone number shown is not the one it dials',
  'placeholder-text': (d) => `Template text still on the page: "${String(d).split('|')[0]}"`,
  'default-title': (d) => `Browser tab still says "${d}"`,
  'social-stub': (d) => `${d} icon goes to ${d}, not their page`,
  'stale-copyright': (d) => `Footer still says ${d}`,
  'expired-date': (d) => `Still showing ${d}`,
  'lead-magnet-open': 'Free download asks for no email',
  'ctas-collapse': 'Every button goes to the same place',
  'two-schedulers': 'Two booking systems both live',
  'booking-is-a-form': 'Booking is a request form, not a calendar',
  'no-booking': 'No way to book from the site',
  'quote-form-thin': 'Quote form asks nothing about the job',
  'long-form': (d) => `Contact form asks for ${d} things`,
  'no-hours': 'No opening hours on the site',
  'no-reviews': 'No reviews or testimonials on the site',
  'no-meta-description': 'No description for search results',
  'stale-stack': (d) => `Running ${d}, years out of date`,
  insecure: 'Served over http, marked Not secure',
  'mixed-content': 'Some assets load insecurely and get blocked',
  'mobile-overflow': 'Layout runs off the screen on a phone',
  viewport: 'Not sized for phones at all',
  noindex: 'Site told Google not to list it',
  'no-title': 'Page has no title',
  slow: (d) => `Took ${d} seconds to load`,
};

export function plainFinding(f) {
  const v = PLAIN[f.key];
  if (typeof v === 'function') return v(f.detail);
  return v || f.key;
}

// Whether this site has earned a video, decided by the only thing that has
// to live with the answer: the recorder. The tracker's severity comes from a
// separate audit that reads the site a different way, and when the two
// disagree the video is the one that goes to a stranger, so this is the
// verdict that counts.
//
// The rule is deliberately strict. One small finding is a video that spends
// two minutes of somebody's attention to say one thing they half knew, and
// then asks for money. Two real findings, or one that genuinely costs them,
// is a video with a reason to exist.
// One finding has to be this heavy to carry a video by itself.
export const WORTH_ONE_ALONE = 8;
// Or several together have to reach this much AND include something real.
export const WORTH_TOGETHER = 10;
// The floor for "something real": a pile of 4s is a pile of small things, and
// a video about small things is the one that makes her look like she is
// reaching. At least one finding has to cost them something on its own.
export const WORTH_NEEDS_ONE_OF = 6;

export function worthRecording(findings, ownFindings = []) {
  const { real } = spoken(findings);
  const score = real.reduce((n, f) => n + (IMPACT[f.key] || 0), 0);
  const heaviest = real.reduce((n, f) => Math.max(n, IMPACT[f.key] || 0), 0);
  // Anything Ary added herself always justifies a video: she looked at the
  // site with her own eyes, which is a better instrument than this one.
  const hers = Array.isArray(ownFindings) && ownFindings.length > 0;
  const worth = hers
    || heaviest >= WORTH_ONE_ALONE
    || (real.length >= 2 && score >= WORTH_TOGETHER && heaviest >= WORTH_NEEDS_ONE_OF);
  const why = hers
    ? 'You added something yourself.'
    : !real.length
      ? 'Nothing could be verified on their site.'
      : worth
        ? `${real.length} verified problem${real.length === 1 ? '' : 's'} worth ${score}.`
        : `Only ${real.length} small thing${real.length === 1 ? '' : 's'} worth ${score}. Not enough for two minutes of their attention.`;
  // What the video will actually say, in the order it will say it. Ary's
  // findings take the speaking slots first and the total is capped at three,
  // so the measured ones past that point are never mentioned. The card used to
  // list the top three measured findings regardless: with three of her own it
  // showed three problems the video does not raise, next to the words "You
  // added something yourself."
  const ownText = (Array.isArray(ownFindings) ? ownFindings : [])
    .map((o) => String(o?.text || '').trim())
    .filter(Boolean)
    .slice(0, MAX_SPOKEN);
  const reasons = [...ownText, ...real.map((f) => plainFinding(f))].slice(0, MAX_SPOKEN);
  return {
    worth,
    score,
    heaviest,
    keys: real.map((f) => f.key),
    reasons,
    why,
  };
}

export function spoken(findings, max = MAX_SPOKEN) {
  const all = findings.filter((x) => x.severity === 'real');
  // Overlapping problems dropped before the cut, not after, or a suppressed one
  // takes a slot on the way out and the video ends up raising two points where
  // it could have raised three.
  //
  // Walked strongest first so the survivor is the one that ranked highest: the
  // suppression is written from the winner's side, and applying it in impact
  // order is what makes that true whichever pair actually turned up.
  const byImpact = [...all].sort((a, b) => (IMPACT[b.key] || 0) - (IMPACT[a.key] || 0));
  const suppressed = new Set();
  for (const f of byImpact) {
    if (suppressed.has(f.key)) continue;
    for (const k of SUPERSEDES[f.key] || []) suppressed.add(k);
  }
  const real = byImpact.filter((f) => !suppressed.has(f.key)).slice(0, max);
  // Back into the order the walkthrough visits things, so the video does not
  // jump to the contact page and back for the sake of ranking.
  real.sort((a, b) => all.indexOf(a) - all.indexOf(b));
  // The first compliment that does not argue with a problem being raised. Only
  // the spoken problems count: one ranked out of the video cannot be
  // contradicted by a line nobody hears. Having no compliment is a fine
  // outcome, and a quieter one than opening with a claim the video then spends
  // a minute undoing.
  const spokenKeys = new Set(real.map((f) => f.key));
  const good = findings.find(
    (x) => x.severity === 'good'
      && !(CONTRADICTS[x.key] || []).some((k) => spokenKeys.has(k)),
  );
  return { real, opener: good || null, clean: all.length === 0 };
}

// One level deep, and only the pages that bear on the enquiry path. Reading the
// landing page alone was behind most of the wrong claims: the form lives on
// /contact and the booking widget lives on /book, and judging either from the
// home page is guessing. Capped, because this runs per prospect and an
// unbounded crawl on a large site would take minutes.
//
// Pure so it can be tested against real link lists without a browser. It was
// silently returning nothing on live Wix sites and the browser round trip made
// that slow to find.
const PAGE_KINDS = [
  { kind: 'contact', re: /contact|get\s*in\s*touch|enquir|inquir/i },
  { kind: 'book', re: /book|appointment|schedule|reserve|consultation/i },
  { kind: 'services', re: /services|treatments|programs|offerings|classes/i },
  { kind: 'pricing', re: /pricing|prices|rates|fees|packages|membership/i },
];

const bareHost = (h) => h.replace(/^www\./, '');
export const sameSite = (a, b) => bareHost(a.hostname) === bareHost(b.hostname);

export function pickPages(links, target, max = 4) {
  let home;
  try {
    home = new URL(target);
  } catch {
    return [];
  }
  // Normalised without the scheme or www, so http/https and www/non-www point
  // at one entry rather than looking like three different pages.
  const norm = (u) => `${bareHost(u.hostname)}${u.pathname.replace(/\/$/, '')}`;
  const seen = new Set([norm(home)]);
  const picked = [];

  for (const { kind, re } of PAGE_KINDS) {
    if (picked.length >= max) break;
    for (const l of links || []) {
      let u;
      try {
        u = new URL(l.href);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(u.protocol) || !sameSite(u, home)) continue;
      if (seen.has(norm(u))) continue;
      if (!re.test(l.text || '') && !re.test(u.pathname)) continue;
      seen.add(norm(u));
      picked.push({ kind, href: u.href, text: l.text || '' });
      break;
    }
  }
  // Anything left over goes to other internal pages. The four named kinds miss
  // plenty: doolancoaching.com's service pages are called "Life Coaching" and
  // "Sober Coaching", which match no keyword, and one of them carries a contact
  // form whose captcha is broken. Filling the remaining slots found it.
  if (picked.length < max) {
    const SKIP = /\/(blog|news|privacy|terms|cookie|login|account|cart|checkout|search)/i;
    for (const l of links || []) {
      if (picked.length >= max) break;
      let u;
      try {
        u = new URL(l.href);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(u.protocol) || !sameSite(u, home)) continue;
      if (seen.has(norm(u)) || SKIP.test(u.pathname)) continue;
      if (u.pathname.replace(/\/$/, '') === '') continue; // the home page again
      seen.add(norm(u));
      picked.push({ kind: 'page', href: u.href, text: l.text || '' });
    }
  }

  return picked;
}

// Social platforms the site links out to. Only the presence of a link is
// claimed, never activity: seeing a Facebook icon says they have a page, not
// that anyone has posted to it this year. The auto-prospect skill's Info field
// asks for "last post" too, and that is deliberately not answered here rather
// than guessed.
const SOCIALS = [
  ['Facebook', /facebook\.com/i],
  ['Instagram', /instagram\.com/i],
  ['LinkedIn', /linkedin\.com/i],
  ['TikTok', /tiktok\.com/i],
  ['YouTube', /youtube\.com|youtu\.be/i],
  ['X', /twitter\.com|(?:^|\/\/)x\.com/i],
];

export function socialPlatforms(links) {
  const hrefs = (links || []).map((l) => l.href);
  return SOCIALS.filter(([, re]) => hrefs.some((h) => re.test(h))).map(([name]) => name);
}

// A compact snapshot for the tracker's Info column, in the shape the
// auto-prospect skill asks for: platform, tools detected, socials, plus the
// measured facts its subagent cannot get from web_fetch because they only
// exist once the page has actually rendered and run.
export function buildInfo(facts, checks, pages, findings) {
  const list = Array.isArray(pages) ? pages : [];
  const form = list.find((p) => p.form)?.form || facts.form || null;
  const socials = socialPlatforms(facts.links);
  const lines = [
    `Platform: ${facts.platform ? facts.platform.name + (facts.platform.version ? ' ' + facts.platform.version : '') : 'unknown'}`,
    `Booking: ${checks.booking ? checks.booking.vendor : 'none found'}`,
    `Email tool: ${checks.followupTool || 'none detected'}`,
    `Contact: ${form ? `form${form.fields ? ` (${form.fields} fields)` : ''}` : facts.email ? 'email link only' : 'none found'}${
      list.length ? `, checked ${list.map((p) => p.kind).join(', ')}` : ''
    }`,
    `Speed: ${checks.loadMs ? (checks.loadMs / 1000).toFixed(1) + 's load (median of 3)' : 'not measured'}${
      checks.mobileOverflowPx > OVERFLOW_PX ? `, overflows ${Math.round(checks.mobileOverflowPx)}px on mobile` : ', mobile ok'
    }`,
    `Social: ${socials.length ? socials.join(', ') : 'none linked'}`,
  ];
  const real = findings.filter((x) => x.severity === 'real');
  if (real.length) lines.push(`Issues: ${real.map((x) => x.key).join(', ')}`);
  return lines.join('\n');
}
