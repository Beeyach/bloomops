// Looks at a site, decides what is worth saying, and records a walkthrough
// that is paced to the narration.
//
// Split into two passes on purpose:
//
//   probe()       loads the page, follows the contact link, decides findings.
//                 No recording, so it is fast and costs nothing to repeat.
//   walkthrough() records the video, holding each beat long enough that the
//                 picture lasts as long as the audio.
//
// The reason for the split is that the script cannot be written until the
// findings are known, and the audio length cannot be known until the script is
// spoken. Recording first meant the video was whatever length it happened to
// be and the mux padded the difference, so a video ended on a frozen frame
// while the voice kept going. For something whose whole premise is that a
// person looked at your site, that reads as automated.
//
// Same two lessons as tools/audit-video are baked in: elements are tagged with
// data-aud and selected by that tag (deriving a selector from tag/class boxed
// the wrong element), and the CTA match is word-boundaried (a bare substring
// called the nav link "Playbook" a call to action because it contains "book").
//
// Nothing is reported that was not read off the live rendered DOM. This gets
// narrated at a prospect, so being confidently wrong is the one failure that
// actually costs something.

import { chromium } from 'playwright-core';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deriveFindings, spoken, pickPages } from './findings.mjs';
import { INTENT_SOURCES } from './booking-intent.mjs';
import { COLLECT_CALENDAR_SRC, judgeCalendar } from './calendar-evidence.mjs';

const ROSE = '#E5457F';

const LAUNCH = { args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] };
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// The highlight follows the element rather than being stamped where it was
// once seen.
//
// It used to call scrollIntoView with smooth behaviour and then read
// getBoundingClientRect on the very next line, which measures the element
// before the animation has moved it at all. The box is position:fixed, so it
// was pinned to wherever the element had been while the page scrolled out from
// under it — a rose rectangle sitting on empty page next to the button it was
// supposed to be pointing at.
//
// Waiting for the scroll to settle would fix that one race and leave a second:
// the box is held on screen for several seconds, and pages reflow during it.
// Images below the fold finish loading, a sticky header collapses, an entrance
// animation runs, and the button moves out from under a box that was correct
// when it was drawn.
//
// So the position is recomputed every frame from the live element instead of
// being calculated once. Correct while scrolling, correct after reflow, and it
// costs no extra wall-clock, which matters because these holds are cued
// against the narration and any added delay would push every later beat late.
// A navigation part-way through a beat costs that beat, never the render.
//
// Anything can move the page under us: a script on a timer, a redirect, a
// close control that turns out to be a link. Playwright answers a page.evaluate
// caught by one with "Execution context was destroyed", and an uncaught one
// takes the whole video with it, after every measurement has already been made
// and every line already spoken. tranquilhypno.com.au died that way at 210
// seconds and revivebodytherapy.com at 242.
async function callout(page, selector, text, holdMs) {
  const ok = await page.evaluate(
    ({ selector, text, ROSE }) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });

      const box = document.createElement('div');
      box.className = '__aud';
      box.style.cssText = `position:fixed;border:3px solid ${ROSE};border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.45);z-index:2147483647;pointer-events:none`;
      const tag = document.createElement('div');
      tag.className = '__aud';
      tag.textContent = text;
      tag.style.cssText = `position:fixed;background:${ROSE};color:#fff;font:600 21px/1.3 system-ui,sans-serif;padding:10px 16px;border-radius:11px;z-index:2147483647;pointer-events:none;max-width:720px`;
      if (!document.body) return false;
      document.body.append(box, tag);

      // Driven by a timer rather than requestAnimationFrame. rAF only runs
      // while the page is considered visible, and in a headless browser being
      // screen-recorded it fires once and then stops: measured, and the box sat
      // frozen while the element moved 600px out from under it. A timer runs
      // regardless of visibility. 40ms is finer than the video's frame, so the
      // box is in the right place in every frame that gets captured.
      const place = () => {
        const r = el.getBoundingClientRect();
        box.style.left = `${r.left - 6}px`;
        box.style.top = `${r.top - 6}px`;
        box.style.width = `${r.width + 12}px`;
        box.style.height = `${r.height + 12}px`;
        // The label sits above the box, unless that would put it off the top
        // of the screen, in which case it goes underneath.
        tag.style.left = `${Math.max(8, r.left - 6)}px`;
        tag.style.top = r.top - 46 >= 8 ? `${r.top - 46}px` : `${r.bottom + 10}px`;
      };
      // Once up front, so the box is never briefly drawn in the corner before
      // the first tick, then on a timer for as long as it is on screen.
      place();
      const timer = setInterval(() => {
        // Self-clearing, so the loop cannot outlive the beat and start fighting
        // the next callout.
        if (!box.isConnected) { clearInterval(timer); return; }
        place();
      }, 40);
      return true;
    },
    { selector, text, ROSE }
  ).catch(() => false);
  if (ok) {
    await page.waitForTimeout(holdMs);
    await page.evaluate(() => document.querySelectorAll('.__aud').forEach((n) => n.remove())).catch(() => {});
  }
  return ok;
}

// `still: true` holds the page where it is. Everything else drifts.
//
// Most of these cards are about things with nowhere to point: a jQuery
// version, a missing description, nothing saying when someone will hear back.
// The card appeared and the page stopped dead underneath it for as long as the
// line took, which on a slow sentence is several seconds of a screenshot. The
// card is position:fixed, so the page can keep moving behind it and the words
// stay put — the viewer reads the claim while their own site carries on.
//
// Still is for the two beats where the frame is the point: the CTA line, which
// is about the top of the page and has just scrolled there to prove it, and the
// footer fallback, which has just travelled to the bottom.
async function note(page, text, holdMs, { still = false } = {}) {
  const drew = await page.evaluate(
    ({ text, ROSE }) => {
      const d = document.createElement('div');
      d.className = '__aud';
      d.textContent = text;
      d.style.cssText = `position:fixed;inset:auto 0 60px 0;margin:0 auto;width:max-content;max-width:80%;background:${ROSE};color:#fff;font:600 24px/1.4 system-ui,sans-serif;padding:16px 28px;border-radius:14px;z-index:2147483647;pointer-events:none;box-shadow:0 10px 30px rgba(0,0,0,.45)`;
      if (!document.body) return;
      document.body.append(d);
    },
    { text, ROSE }
  ).then(() => true).catch(() => false);
  // The card never got drawn, so there is nothing to hold on or clear away.
  if (!drew) return;
  if (still) {
    await page.waitForTimeout(holdMs);
  } else {
    await driftFor(page, holdMs);
  }
  await page.evaluate(() => document.querySelectorAll('.__aud').forEach((n) => n.remove())).catch(() => {});
}

// Moves the page about a screenful over the time given, eased so it sets off
// and settles gently rather than sliding at a constant rate.
//
// Downward when there is room, upward when there is not, so a beat landing at
// the bottom of the page still moves instead of sitting on the last frame. The
// travel is deliberately small: this is the page breathing under a line about
// something invisible, not a second tour.
async function driftFor(page, holdMs) {
  const STEP_MS = 240;
  const t0 = Date.now();
  const startY = await page.evaluate(() => window.scrollY).catch(() => 0);
  const span = await page
    .evaluate((from) => {
      const max = Math.max(0, ((document.body && document.body.scrollHeight) || 0) - window.innerHeight);
      const room = max - from;
      const reach = window.innerHeight * 0.85;
      if (room > 80) return Math.min(room, reach);
      return -Math.min(from, reach);
    }, startY)
    .catch(() => 0);
  if (!span) {
    await page.waitForTimeout(holdMs);
    return;
  }
  while (Date.now() - t0 < holdMs) {
    const phase = Math.min(1, (Date.now() - t0) / holdMs);
    const eased = 0.5 - Math.cos(phase * Math.PI) / 2;
    await page
      .evaluate(({ from, dist, t }) => {
        const max = Math.max(0, ((document.body && document.body.scrollHeight) || 0) - window.innerHeight);
        const y = Math.max(0, Math.min(max, Math.round(from + dist * t)));
        window.scrollTo({ top: y, behavior: 'smooth' });
      }, { from: startY, dist: span, t: eased })
      .catch(() => {});
    // Never sleep past the end of the hold. A flat STEP_MS overshot every beat
    // by up to a quarter second, which is nothing once and several seconds
    // across a video, and all of it landed after the narration had finished.
    const left = holdMs - (Date.now() - t0);
    if (left <= 0) break;
    await page.waitForTimeout(Math.min(STEP_MS, left));
  }
}


// Clears newsletter popups, modals and consent banners before anything is
// measured or recorded. achievewellnesscenters.com opens a "join our list"
// dialog that locks body scrolling, so the walkthrough sat motionless behind
// it and every measurement was taken through it.
//
// Only genuine dismiss controls are clicked. "Accept" and "I agree" are
// deliberately excluded: agreeing to somebody's terms on their site is not
// this tool's business. Anything that will not close politely is hidden
// locally instead, which changes what our own headless browser renders and
// agrees to nothing.
// Swept more than once because these are usually on a timer. The "Join Our
// List" dialog on achievewellnesscenters.com does not exist at 2 seconds and
// is up by 5, so a single early pass found nothing and reported success.
async function sweepOverlays(page, passes = 2, gapMs = 3500) {
  let total = { clicked: 0, hidden: 0 };
  for (let i = 0; i < passes; i += 1) {
    if (i) await page.waitForTimeout(gapMs);
    const r = await dismissOverlays(page);
    total = { clicked: total.clicked + r.clicked, hidden: total.hidden + r.hidden };
  }
  return total;
}

// Keeps dismissing popups for as long as the recording runs.
//
// dismissOverlays is a sweep: it runs at a moment and clears what is on screen
// then. That is no use against a popup on a timer or a scroll trigger, which is
// most of them. empoweringhealth.clinic runs WordPress Popup Maker, whose
// close button the sweep matches perfectly and never got the chance to click,
// because the popup opened after the tour had moved on. It sat over the page
// for the rest of the video with a callout box pointing at a form behind it.
//
// So the same narrow rule is installed in the page and re-run on an interval.
// setInterval rather than a MutationObserver: the trigger is usually a timer
// rather than a DOM insert, the element often exists all along and is only
// unhidden, and an observer would miss exactly that case.
async function installOverlayWatcher(page) {
  await page
    .evaluate(() => {
      if (window.__audOverlayWatcher) return;
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      // Deliberately the same rule as the sweep, and no wider. Anything looser
      // running unattended for a whole video would eventually click something
      // that mattered, and a video of a page being dismantled is worse than one
      // with a popup in it.
      const DISMISS = /^(x|✕|×|close|no thanks|no, thanks|maybe later|not now|dismiss|skip|continue browsing)$/i;
      window.__audOverlayWatcher = setInterval(() => {
        for (const el of document.querySelectorAll('button,a,[role="button"],[aria-label]')) {
          if (!vis(el)) continue;
          // Never anything that navigates. This runs unattended for the whole
          // recording, and a close control that is really a link takes the page
          // with it: Playwright then throws "Execution context was destroyed"
          // out of whatever evaluate was in flight and the render dies.
          // tranquilhypno.com.au and revivebodytherapy.com both failed this way,
          // at 210 and 242 seconds, after everything had already been measured.
          const href = el.getAttribute('href');
          if (href && !/^#/.test(href) && !/^javascript:/i.test(href)) continue;
          const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`;
          if (!DISMISS.test((el.textContent || '').trim()) && !/close|dismiss/i.test(label)) continue;
          try {
            el.click();
          } catch {}
        }
      }, 600);
    })
    .catch(() => {});
}

async function dismissOverlays(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(350);
  return page
    .evaluate(() => {
      const vis = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const DISMISS = /^(x|✕|×|close|no thanks|no, thanks|maybe later|not now|dismiss|skip|continue browsing)$/i;
      let clicked = 0;
      [...document.querySelectorAll('button,a,[role="button"],[aria-label]')]
        .filter((el) => {
          if (!vis(el)) return false;
          const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`;
          const txt = (el.textContent || '').trim();
          return DISMISS.test(txt) || /close|dismiss/i.test(label);
        })
        .slice(0, 5)
        .forEach((el) => {
          try {
            el.click();
            clicked += 1;
          } catch {}
        });

      // Whatever is left that covers the page gets hidden rather than agreed to.
      //
      // Deliberately narrow. A first attempt hid anything large, absolutely
      // positioned and above z-index 100, which on Wix meant 37 elements of
      // ordinary page layout: it gutted the page and invented a broken-images
      // finding as a side effect. An overlay now has to look like an actual
      // dialog before it is touched.
      const DIALOG_TEXT =
        /join our list|subscribe|newsletter|sign ?up|be the first|special offer|discount|% off|mailing list|stay in touch|don'?t miss/i;
      // Cookie and privacy consent bars. Hidden, never accepted: clicking their
      // "Accept" would agree to their terms on their behalf, which is not this
      // tool's call. But a bar that only offers Accept and locks scrolling until
      // you take it freezes the whole walkthrough behind it (js-sprinklers did
      // exactly this). Hiding it in our own headless browser agrees to nothing.
      // These are usually a slim bar well under the newsletter-dialog size
      // floor, so they get a much lower one of their own.
      const COOKIE_TEXT =
        /cookie|consent|gdpr|ccpa|we value your privacy|privacy (policy|preferences|choices)|do not sell|tracking technolog/i;
      let hidden = 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      for (const el of document.querySelectorAll('div,section,aside,dialog')) {
        const s = getComputedStyle(el);
        if (s.position !== 'fixed' && s.position !== 'sticky' && s.position !== 'absolute') continue;
        if (parseInt(s.zIndex || '0', 10) < 1000) continue;
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        if (area > vw * vh * 1.4) continue; // a full-page wrapper, not a dialog
        const text = (el.innerText || '').slice(0, 400);
        const isCookie = COOKIE_TEXT.test(text);
        // A newsletter dialog has to be sizeable to count; a cookie bar can be a
        // thin strip, so it clears a far lower floor.
        if (area < vw * vh * (isCookie ? 0.005 : 0.1)) continue;
        const looksLikeDialog =
          isCookie ||
          el.getAttribute('role') === 'dialog' ||
          el.getAttribute('aria-modal') === 'true' ||
          !!el.querySelector('input[type=email]') ||
          DIALOG_TEXT.test(text);
        if (!looksLikeDialog) continue;
        if (el.querySelector('nav') || el.tagName === 'HEADER') continue;
        el.style.display = 'none';
        hidden += 1;
      }

      // Modals routinely lock scrolling on the body. Give it back. With
      // !important, because the lock is often a class carrying its own
      // !important, which a plain inline style would lose to.
      for (const el of [document.documentElement, document.body]) {
        const s = getComputedStyle(el);
        if (s.overflow === 'hidden' || s.overflowY === 'hidden') {
          el.style.setProperty('overflow', 'auto', 'important');
        }
        if (s.position === 'fixed') el.style.setProperty('position', 'static', 'important');
      }
      return { clicked, hidden };
    })
    .catch(() => ({ clicked: 0, hidden: 0 }));
}


// A captcha with a bad key writes its error inside its own iframe, so reading
// document.body.innerText never sees it. On doolancoaching.com the service
// pages carry a contact form whose reCAPTCHA says "ERROR for site owner:
// Invalid domain for site key", which means nobody can submit that form at
// all, and the audit walked straight past it twice: once because only the
// landing page was checked, and once because the text was in a frame.
//
// This is the highest-value thing the service can find, and it is invisible to
// a raw HTML fetch, so it is exactly what the audit skill cannot do for itself.
const CAPTCHA_ERROR = /ERROR for site owner|Invalid site key|Invalid domain for site key|Localhost is not in the list/i;

async function captchaBrokenOn(page) {
  for (const frame of page.frames()) {
    try {
      const text = await frame.evaluate(() => (document.body && document.body.innerText) || '');
      if (CAPTCHA_ERROR.test(text)) return true;
    } catch {
      // A frame that cannot be read tells us nothing either way.
    }
  }
  return false;
}

// Reads everything interesting off the current page and tags the elements it
// found, so a callout can point at exactly the thing that was measured. Run in
// both passes: the tags live on one page instance and do not survive a reload.
function readFacts(page) {
  return page.evaluate(({ intent }) => {
    const vis = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const mark = (el, name) => {
      if (!el) return null;
      el.setAttribute('data-aud', name);
      return `[data-aud="${name}"]`;
    };
    const clean = (el) => (el.textContent || '').replace(/\s+/g, ' ').replace(/^[^\w+(]+/, '').trim();
    const tel = [...document.querySelectorAll('a[href^="tel:"]')].filter(vis);
    const mail = [...document.querySelectorAll('a[href^="mailto:"]')].filter(vis);
    // A search box is a form and is not the one anybody fills in to reach you.
    // It is usually the first form in the markup too, sitting in the header, so
    // taking forms[0] pointed the "this is what they fill in" box at the search
    // field and told sites with no contact form at all that theirs was right
    // there on the page.
    //
    // Judged on what it is for rather than how it looks: the search role, a
    // search action, or a single lonely text input named the way search inputs
    // are named. A real enquiry form asks for more than one thing.
    const isSearch = (f) => {
      if (f.getAttribute('role') === 'search') return true;
      const hay = `${f.getAttribute('action') || ''} ${f.className || ''} ${f.id || ''}`.toLowerCase();
      if (/(^|[^a-z])search([^a-z]|$)|\/\?s=|[?&]s=|[?&]q=/.test(hay)) return true;
      const fields = [...f.querySelectorAll('input,textarea,select')].filter(
        (el) => !['hidden', 'submit', 'button', 'image'].includes((el.type || '').toLowerCase())
      );
      if (fields.length > 1) return false;
      return fields.some((el) => {
        if ((el.type || '').toLowerCase() === 'search') return true;
        const n = `${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
        return /^(s|q)$/.test((el.name || '').trim()) || /search|find|look up/.test(n);
      });
    };
    const forms = [...document.querySelectorAll('form')].filter((f) => vis(f) && !isSearch(f));
    // Deliberately more than one screen. The window is 800px tall, and
    // myspiritoasis.com puts "View Services", "Bookings & Gift Certificates"
    // and "Contact Us" — real anchors, filled, padded, unmistakably buttons —
    // at 820px. Twenty pixels past an arbitrary line, and the video told her
    // there was nothing telling a visitor what to do next.
    //
    // Technically true of a 1280x800 window and useless as a claim, because
    // the fold is not a real place. It moves with every screen, and those
    // buttons are on the first screen of most laptops and every desktop.
    //
    // So the band is a screen and a half. Being generous here can only cost a
    // compliment that did not need paying; being strict calls a working front
    // page broken to the person who built it, which is the failure this whole
    // check exists to avoid.
    const foldH = window.innerHeight * 1.5;
    // Lead magnets count. askkatiep.com offers a "Free PDF" above the fold,
    // which is precisely what she wants a visitor to do, and telling her
    // nothing there says what to do next would have been wrong.
    //
    // Deliberately generous, and it excludes nav. Getting this wrong in the
    // "no CTA" direction is an accusation: coachdocanna.com has "Explore
    // coaching with Anna" above the fold and was told nothing there tells a
    // visitor what to do next. A false positive only costs a compliment we
    // did not need to pay; a false negative calls someone's front page broken.
    //
    // Nav is NOT excluded. Trying that told achievewellnesscenters.com it had
    // nothing above the fold to act on, when its "Book Now!" button sits in the
    // nav and is exactly what it wants people to do. On a small business site
    // the nav button often IS the call to action.
    //
    // Word boundaries still matter: a bare substring once read the nav link
    // "Playbook" as a call to action because it contains "book".
    const ctaWords =
      // The common verbs carry their endings. "Book Now" matched and
      // "Bookings & Gift Certificates" did not, because \bbook\b will not cross
      // into "ings" — so a button whose whole job is booking was not a call to
      // action while a differently worded one was.
      /\b(book(?:s|ing|ings)?|call|quote|quotes|contact|schedul(?:e|es|ing)|enquir|inquir|request|buy|shop|order|explore|start|begin|discover|apply|join|subscribe|register|download|try|guide|checklist|ebook|workbook|masterclass|quiz|consult(?:s|ing|ation|ations)?|freebie|appointment|appointments)\b|get \bstarted\b|get in touch|learn more|find out|work with|let's talk|talk to|see how|read more|free pdf|free guide|free call|free download|free training|\bmeet\b/i;
    // The word alone is not enough. Matching any link above the fold whose text
    // contains a call-to-action word meant a plain nav bar with "Contact" in it
    // scored as "the main action is right there at the top", which is the
    // opening compliment of the video and was simply not true on a site that
    // has no button at all.
    //
    // So it has to render like a button as well as read like one: a real
    // button element, or something with a fill or a border and padding around
    // it. That still allows a styled Book Now sitting in the header, which
    // genuinely is the call to action, while a text link in a menu is not.
    const looksClickable = (el) => {
      if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') return true;
      const st = getComputedStyle(el);
      const bg = st.backgroundColor || '';
      const filled = !!bg && !/^transparent$/i.test(bg) && !/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(bg);
      const outlined = parseFloat(st.borderTopWidth || '0') > 0 || parseFloat(st.borderTopLeftRadius || '0') > 2;
      // Sized like a button, by padding OR by height. It used to require
      // horizontal padding as well, and koriburkholder.com's "Book Your Career
      // Alignment Audit" has a 3px border, is 45px tall, and reports zero
      // padding because its spacing comes from the element inside it. A bordered
      // box that tall is a button whatever it does with its own padding.
      const padded =
        parseFloat(st.paddingLeft || '0') >= 8 ||
        parseFloat(st.paddingTop || '0') >= 5 ||
        parseFloat(st.height || '0') >= 34;
      return (filled || outlined) && padded;
    };
    // A button that is part of the artwork.
    //
    // empoweringhealth.clinic has BOOK NOW drawn into its hero image, inside a
    // link that goes to their booking page. To a visitor it is the call to
    // action and it works like one. Every test above is blind to it: the label
    // is pixels, so textContent is empty, ctaWords has nothing to match, and
    // looksClickable sees an image rather than a filled, padded box. The video
    // said "nothing above the fold says what to do next" over a screen with a
    // large BOOK NOW on it.
    //
    // So where it goes decides it, since that is what separates a call to
    // action from decoration. A link home is excluded: that is the logo, which
    // is above the fold and wraps an image on nearly every site there is.
    const CTA_HREF = /book|appointment|schedul|contact|enquir|inquir|consult|quote|shop|order|checkout|start|apply/i;
    const imageCta = (el) => {
      if (el.tagName !== 'A') return false;
      const href = el.getAttribute('href') || '';
      if (!href || href.startsWith('#')) return false;
      let u;
      try {
        u = new URL(href, location.href);
      } catch {
        return false;
      }
      if (u.pathname.replace(/\/$/, '') === location.pathname.replace(/\/$/, '')) return false;
      if (!CTA_HREF.test(`${u.pathname}${u.search}`)) return false;
      const img = el.querySelector('img');
      if (!img || !vis(img)) return false;
      const r = img.getBoundingClientRect();
      // Big enough to read as a button rather than an icon.
      return r.width >= 80 && r.height >= 24;
    };
    const cta = [...document.querySelectorAll('a,button')].filter((el) => {
      if (!vis(el)) return false;
      if (el.getBoundingClientRect().top >= foldH) return false;
      if (imageCta(el)) return true;
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!txt || txt.length > 70) return false;
      if (!ctaWords.test(txt)) return false;
      return looksClickable(el);
    });

    // "No tel: link" alone does not tell you whether a phone number is even
    // shown. Without this the script said "your phone number is not tappable"
    // to sites with no phone number at all, describing the formatting of
    // something that does not exist.
    const phoneInText = (((document.body && document.body.innerText) || '').match(/\+?\d[\d\s().-]{6,}\d/g) || [])
      .map((s) => s.trim())
      .find((s) => {
        const digits = s.replace(/\D/g, '');
        return digits.length >= 7 && digits.length <= 15;
      }) || null;

    // Both halves of this used to miss zentasticmassage.com.au, whose contact
    // link is the word "CONTACTS" pointing at "contact.html".
    //
    // The text test closed on \b, so "contact" matched and "contacts" did not:
    // the boundary has to fall between "contact" and whatever follows, and "s"
    // is a word character. Only the opening boundary is needed. It is what
    // stops "no contact sports" style false hits, and the closing one was
    // rejecting the commonest label a menu uses.
    //
    // The href test demanded a slash before the word, which is every absolute
    // path and no relative one. A hand-written site links to "contact.html"
    // with nothing in front of it, so anchoring to a slash OR the start of the
    // string is what actually means "the path begins with this".
    //
    // Together they made the page invisible: no contact page meant no detour,
    // so the video never walked to the form that was sitting there, and the
    // findings judged the enquiry path from the landing page alone.
    const contactPage = [...document.querySelectorAll('a[href]')]
      .filter(vis)
      .find(
        (a) =>
          /\b(contacts?|get in touch|reach us|enquir|inquir)/i.test(a.textContent || '') ||
          /(^|\/)(contact|get-in-touch|enquir|inquir)/i.test(a.getAttribute('href') || '')
      );

    // Every visible internal-looking link, so the crawl can choose which pages
    // are worth opening rather than guessing from the URL alone.
    // Position and shape are captured alongside the href so a dead link can be
    // described well enough to find. awakenananda.com's broken link is an image
    // with no text and no alt, a third of the way down the page: "one of your
    // links is dead" was true and nobody, including its owner, could locate it.
    const pageH = (document.body && document.body.scrollHeight) || 1;
    const links = [...document.querySelectorAll('a[href]')]
      .filter(vis)
      .map((a) => ({
        text: clean(a).slice(0, 60),
        href: a.href,
        isImage: !clean(a) && !!a.querySelector('img'),
        atRatio: Math.min(1, Math.max(0, (a.getBoundingClientRect().top + window.scrollY) / pageH)),
      }))
      .filter((l) => /^https?:/i.test(l.href));

    // The navigation separately, WITHOUT the visibility filter. Dropdown
    // submenu items are display:none until hovered, so the visible-links list
    // never sees them — and the menu is the most clicked strip of the site,
    // which makes a dead item there the most found-out kind of dead link.
    // Marked nav:true so the link checker can say where it was.
    const navLinks = [...document.querySelectorAll('header a[href], nav a[href], [role="navigation"] a[href], [class*="menu" i] a[href]')]
      .map((a) => ({
        text: (clean(a) || (a.getAttribute('aria-label') || '')).slice(0, 60),
        href: a.href,
        nav: true,
      }))
      .filter((l) => /^https?:/i.test(l.href))
      .slice(0, 60);

    // What the site is built on. Only reported when the site says so itself,
    // via its generator tag or an unmistakable path, because guessing a
    // platform wrong in a sales video is worse than not mentioning it.
    const generator = (document.querySelector('meta[name="generator"]')?.content || '').trim();
    const html = document.documentElement.innerHTML.slice(0, 250000);
    const platform =
      (generator.match(/^(WordPress|Drupal|Joomla|Wix|Squarespace|Shopify|Weebly|Duda|Webflow)[\s/]*([\d.]+)?/i) &&
        generator.match(/^(WordPress|Drupal|Joomla|Wix|Squarespace|Shopify|Weebly|Duda|Webflow)[\s/]*([\d.]+)?/i)) ||
      (/\/wp-content\//i.test(html) ? ['', 'WordPress', ''] : null) ||
      (/static\.wixstatic\.com|wix\.com/i.test(html) ? ['', 'Wix', ''] : null) ||
      (/squarespace\.com|static1\.squarespace/i.test(html) ? ['', 'Squarespace', ''] : null) ||
      (/cdn\.shopify\.com/i.test(html) ? ['', 'Shopify', ''] : null) ||
      (/weebly\.com/i.test(html) ? ['', 'Weebly', ''] : null);

    // jQuery is the most reliable age signal on the page: 1.x and 2.x are long
    // out of support, and a site still on them has not been touched in years.
    const jquery = (window.jQuery && window.jQuery.fn && window.jQuery.fn.jquery) || null;


    // A booking control that points at an anchor on this same page. Very
    // common: "Book a Conversation" scrolling down to a contact form rather
    // than opening a booking page. The crawler correctly skips same-page
    // links, so without this the site looked as though it had no booking path
    // at all and got told so.
    // Rebuilt from lib sources rather than written again here. The rule for
    // what counts as appointment intent, and why "The Book" is not it, lives
    // in booking-intent.mjs.
    const apptRes = intent.text.map((s) => new RegExp(s, 'i'));
    const schedRe = new RegExp(intent.scheduler, 'i');
    const bookEl = [...document.querySelectorAll('a[href],button')]
      .filter(vis)
      .find((el) => {
        const href = el.getAttribute('href') || '';
        if (href && schedRe.test(href)) return true;
        const text = (el.textContent || '').trim();
        return apptRes.some((re) => re.test(text));
      });
    let bookingLink = null;
    if (bookEl) {
      const raw = bookEl.getAttribute('href');
      let samePage = !raw;
      if (raw) {
        try {
          const u = new URL(raw, location.href);
          samePage = u.pathname.replace(/\/$/, '') === location.pathname.replace(/\/$/, '');
        } catch {
          samePage = false;
        }
      }
      bookingLink = {
        text: (bookEl.textContent || '').trim().slice(0, 40),
        samePage,
        href: raw ? new URL(raw, location.href).href : null,
        sel: mark(bookEl, 'booklink'),
      };
    }

    // Whether a real calendar is already on this page.
    const homeCalendar =
      document.querySelectorAll('input[type=date],input[type=time],input[type=datetime-local]').length > 0;

    return {
      title: (document.title || '').trim(),
      links,
      navLinks,
      bookingLink,
      homeCalendar,
      // Where the copyright notice sits, so the beat about a stale year can put
      // it on screen instead of describing it over whatever the previous beat
      // left showing. Marked here rather than in runChecks because readFacts is
      // the pass that runs again on the recording page, and a data-aud
      // attribute set on any earlier page instance is gone by then.
      //
      // Smallest element still carrying the whole notice, so the box lands on
      // the line rather than around half the page.
      copyrightSel: (() => {
        const RE = /(?:©|\(c\)|copyright)\s*(?:\d{4}\s*[-–]\s*)?\d{4}/i;
        for (const el of document.querySelectorAll('footer *, footer, [class*="copyright" i], [id*="copyright" i], p, span, div, li, td')) {
          if (!RE.test(el.textContent || '')) continue;
          if (el.children.length && [...el.children].some((c) => RE.test(c.textContent || ''))) continue;
          if (!vis(el)) continue;
          return mark(el, 'copyright');
        }
        return null;
      })(),
      platform: platform ? { name: platform[1], version: /^\d/.test((platform[2] || '').trim()) ? platform[2].trim() : null } : null,
      jquery,
      hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
      phone: tel.length ? { text: clean(tel[0]), sel: mark(tel[0], 'phone') } : null,
      phoneInText,
      email: mail.length ? { text: clean(mail[0]), sel: mark(mail[0], 'email') } : null,
      form: forms.length
        ? {
            sel: mark(forms[0], 'form'),
            // Whether the form asks anything about the job. A quote form that
            // takes only a name and an email cannot be priced from, so every
            // request needs a reply before it can be answered. Read off the
            // fields themselves, so the owner confirms it by opening the form.
            asksAboutJob: [...forms[0].querySelectorAll('input,select,textarea')].some((el) => {
              const hay = [
                el.name, el.id, el.placeholder, el.getAttribute('aria-label'),
                (el.closest('label') || {}).textContent,
              ].join(' ').toLowerCase();
              return /address|suburb|postcode|zip|street|service|job|project|work|property|type|describe|detail|message|comment|enquir|inquir|how can we|what do you need/.test(hay);
            }),
          }
        : null,
      contactPage: contactPage
        ? { text: clean(contactPage).slice(0, 40), sel: mark(contactPage, 'contactpage'), href: contactPage.href }
        : null,
      // A CTA drawn into an image has no text to read, so the label falls back
      // to the image's alt and then to where the link goes. Without this the
      // callout rendered as `Main action: ""`, which looks like the audit
      // failed rather than like the button being a picture.
      // Anything above the fold that reads like an action, however it is
      // styled. Not the same question as "is there a button", and it is the one
      // that decides whether the video is allowed to say nothing up there tells
      // a visitor what to do.
      //
      // Saying that has been wrong three times, on three different sites, each
      // for a different styling reason: a button drawn into the hero image, a
      // link with no padding, a nav item that reads as the main action. Every
      // fix found another hole, because the claim was being made from a test
      // designed for the compliment, where being strict is right.
      //
      // They are separated now. A styled button earns the compliment. The
      // problem is only stated when there is nothing up there that even reads
      // like an action, which is the thing actually being claimed. In between,
      // an action that does not look like a button, the video says neither, and
      // that silence is the correct answer.
      actionAboveFold: [...document.querySelectorAll('a,button,[role="button"]')].filter((el) => {
        if (!vis(el)) return false;
        if (el.getBoundingClientRect().top >= foldH) return false;
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return !!txt && txt.length <= 70 && ctaWords.test(txt);
      }).length,
      cta: cta.length
        ? {
            text: (() => {
              const t = clean(cta[0]).slice(0, 60);
              if (t) return t;
              const alt = (cta[0].querySelector('img')?.getAttribute('alt') || '').trim();
              if (alt) return alt.slice(0, 60);
              try {
                const seg = new URL(cta[0].getAttribute('href'), location.href).pathname
                  .split('/')
                  .filter(Boolean)
                  .pop();
                if (seg) return seg.replace(/[-_]+/g, ' ').replace(/\.\w+$/, '').slice(0, 60);
              } catch {}
              return 'the button in your header image';
            })(),
            sel: mark(cta[0], 'cta'),
          }
        : null,
      // Tagged here rather than only where the count is taken, because these
      // tags have to exist on the page instance being FILMED. The count comes
      // from the probe, and the probe's page is long gone by the time the
      // walkthrough runs, so a selector from it would point at nothing and the
      // beat would fall back to talking over a still frame.
      brokenImageSel: (() => {
        const bad = [...document.images].find((i) => {
          const src = i.getAttribute('src');
          if (!src || /^data:|^blob:/.test(src)) return false;
          if (i.getAttribute('data-src') && !i.currentSrc) return false;
          return i.complete && i.naturalWidth === 0;
        });
        if (!bad) return null;
        // A broken image can collapse to nothing, and a highlight drawn around
        // nothing is a rose dot in the middle of the page. When it has no size
        // worth boxing, box the thing it sits in instead: the blog row or card
        // around it shows the gap better than the missing image does.
        const r = bad.getBoundingClientRect();
        const target = r.width < 24 || r.height < 24 ? bad.closest('li,article,div') || bad : bad;
        return mark(target, 'brokenimg');
      })(),
      pageHeight: (document.body && document.body.scrollHeight) || 0,
    };
  }, { intent: INTENT_SOURCES });
}

// Opens the linked contact page and reports what is on it, or null if it could
// not be reached. Returning null matters: it is the difference between "the
// contact page has no form" and "we never saw the contact page", and only one
// of those is safe to narrate.
//
// Same site only. Plenty of sites point "Contact" at Facebook or a booking
// host, and following that would have the video wander onto a third party's
// page while the narration talks about the prospect's site.
//
// Compared by hostname rather than origin. pranareiki.com redirects http to
// https, so its own contact link is https while the URL we were handed is
// still http; an origin comparison called the site's own contact page a
// third party and reported "we could not reach it" about a page that returns
// 200 and contains a form. www is ignored for the same reason.
const sameSite = (a, b) => a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '');


// Finds a booking control and tags it, returning a selector, or null.
//
// Never returns anything that could submit: nothing inside a <form>, nothing
// with type=submit. These are real businesses and a test submission is a real
// enquiry landing in a real inbox. Reading a page is free; sending someone a
// fake booking is not.
async function findBookingControl(page) {
  return page.evaluate(({ intent }) => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const here = location.pathname.replace(/\/$/, '');
    const candidates = [...document.querySelectorAll('a,button,[role="button"]')].filter((el) => {
      if (!vis(el)) return false;
      if (el.closest('form')) return false;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'submit' || type === 'image') return false;
      // The same rule the findings use. It was a bare-token regex here too,
      // so the walkthrough would have walked to "The Book" on camera.
      const href = el.getAttribute('href') || '';
      if (href && new RegExp(intent.scheduler, 'i').test(href)) return true;
      return intent.text.some((s) => new RegExp(s, 'i').test((el.textContent || '').trim()));
    });
    // Prefer one that actually goes somewhere else; a nav item pointing at the
    // current page teaches us nothing.
    const pick =
      candidates.find((el) => {
        const h = el.getAttribute('href');
        if (!h) return true;
        try {
          return new URL(h, location.href).pathname.replace(/\/$/, '') !== here;
        } catch {
          return false;
        }
      }) || candidates[0];
    if (!pick) return null;
    pick.setAttribute('data-aud', 'bookbtn');
    return {
      sel: '[data-aud="bookbtn"]',
      text: (pick.textContent || '').trim().slice(0, 40),
      href: pick.getAttribute('href') ? new URL(pick.getAttribute('href'), location.href).href : null,
    };
  }, { intent: INTENT_SOURCES });
}

// Whether a real calendar is on screen right now.
//
// The page collects; calendar-evidence.mjs decides. It used to decide here, by
// counting elements whose class contained the word calendar, which is true of
// every icon font glyph ever shipped.
function calendarOnPage(page, bookingSrc) {
  return page
    .evaluate(
      ({ bookingSrc, collectSrc }) => new Function('return ' + collectSrc)()(bookingSrc),
      { bookingSrc, collectSrc: COLLECT_CALENDAR_SRC }
    )
    .then((raw) => judgeCalendar(raw).hasCalendar);
}

// Is there anything on this page at all?
//
// Read on the landing page and nowhere else. Two independent signals, because
// parking pages vary: the registrar's own markers, and a page that simply has
// nothing on it. The emptiness test needs almost no words AND almost no links,
// since a real business page has hundreds of characters and a nav even when it
// is one page long.
//
// `innerText` is the rendered text, which is the right question — but it is
// empty for content still behind a fade-in, and half the web animates its hero
// in. `textContent` reads the DOM regardless of what has painted yet. A parked
// page has neither, so taking the larger of the two keeps the check that
// matters and drops a whole class of false "empty" on sites that were merely
// mid-animation.
async function landingShell(page) {
  return page
    .evaluate(() => {
      const PARKED =
        /LANDER_SYSTEM|ap:\s*["']parking["']|sedoparking|parkingcrew|bodis\.com|afternic|dan\.com|hugedomains|domain (is )?for sale|buy this domain|this domain is parked|future home of/i;
      const squash = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const rendered = squash(document.body ? document.body.innerText : '');
      const inDom = squash(document.body ? document.body.textContent : '');
      return {
        textLength: Math.max(rendered.length, inDom.length),
        renderedLength: rendered.length,
        links: document.querySelectorAll('a[href]').length,
        parked: PARKED.test(document.documentElement.innerHTML || ''),
        title: document.title || '',
      };
    })
    // Erring toward "not empty" costs a video that might have been fine.
    // Erring the other way throws away a paid probe of a real website.
    .catch(() => ({ textLength: 999, renderedLength: 999, links: 999, parked: false, title: '' }));
}

async function visitPage(page, href, target, holdMs) {
  let url;
  try {
    url = new URL(href, target);
    if (!sameSite(url, new URL(target))) return null;
  } catch {
    return null;
  }

  try {
    const resp = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(holdMs);
    await dismissOverlays(page);
    const data = await page.evaluate(
      ({ promiseSrc, bookingSrc, collectSrc }) => {
        const vis = (el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
        };
        const mark = (el, name) => {
          if (!el) return null;
          el.setAttribute('data-aud', name);
          return `[data-aud="${name}"]`;
        };
        const clean = (el) => (el.textContent || '').replace(/\s+/g, ' ').replace(/^[^\w+(]+/, '').trim();
        // A search box is a form and is not the one anybody fills in to reach you.
    // It is usually the first form in the markup too, sitting in the header, so
    // taking forms[0] pointed the "this is what they fill in" box at the search
    // field and told sites with no contact form at all that theirs was right
    // there on the page.
    //
    // Judged on what it is for rather than how it looks: the search role, a
    // search action, or a single lonely text input named the way search inputs
    // are named. A real enquiry form asks for more than one thing.
    const isSearch = (f) => {
      if (f.getAttribute('role') === 'search') return true;
      const hay = `${f.getAttribute('action') || ''} ${f.className || ''} ${f.id || ''}`.toLowerCase();
      if (/(^|[^a-z])search([^a-z]|$)|\/\?s=|[?&]s=|[?&]q=/.test(hay)) return true;
      const fields = [...f.querySelectorAll('input,textarea,select')].filter(
        (el) => !['hidden', 'submit', 'button', 'image'].includes((el.type || '').toLowerCase())
      );
      if (fields.length > 1) return false;
      return fields.some((el) => {
        if ((el.type || '').toLowerCase() === 'search') return true;
        const n = `${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
        return /^(s|q)$/.test((el.name || '').trim()) || /search|find|look up/.test(n);
      });
    };
    const forms = [...document.querySelectorAll('form')].filter((f) => vis(f) && !isSearch(f));
        const mail = [...document.querySelectorAll('a[href^="mailto:"]')].filter(vis);
        // What the form actually asks a stranger to type. Hidden inputs,
        // honeypots and the submit button are not questions.
        const fields = forms.length
          ? [...forms[0].querySelectorAll('input,textarea,select')].filter(
              (el) => vis(el) && !['hidden', 'submit', 'button', 'image'].includes((el.type || '').toLowerCase())
            ).length
          : 0;
        const booking = new RegExp(bookingSrc, 'i');
        const refs = [...document.querySelectorAll('a[href],script[src],iframe[src]')].map(
          (el) => el.getAttribute('href') || el.getAttribute('src') || ''
        );
        // A real booking path lets someone pick a time. A form with a "Time"
        // text box is a request: they type when they'd like and wait for a
        // human. Both sit behind a "Book Now" button, and only one of them is
        // actually booking, so the difference has to be measured rather than
        // assumed from the button's label.
        // Collected here, judged in calendar-evidence.mjs. Counting elements
        // whose class contains the word calendar is how a 0x0 icon-font span
        // made every page of a therapy site report a booking calendar.
        const calendarRaw = new Function('return ' + collectSrc)()(bookingSrc);

        // A booking control that leads somewhere we did not follow. Its
        // presence means the flow continues past this page, so the absence of
        // a calendar HERE proves nothing about whether one exists. Links back
        // to this same page (a nav item pointing at itself) do not count.
        const here = location.pathname.replace(/\/$/, '');
        const furtherStep = [...document.querySelectorAll('a,button')].some((el) => {
          if (!/\b(book|schedule|reserve)\b/i.test((el.textContent || '').trim())) return false;
          const href = el.getAttribute('href');
          if (!href) return true; // a scripted button: another step, unfollowed
          try {
            return new URL(href, location.href).pathname.replace(/\/$/, '') !== here;
          } catch {
            return false;
          }
        });

        // The one unambiguous signal that a "booking" is really a request:
        // the form asks the visitor to type when they would like. A calendar
        // never needs to ask, because the times on offer are the ones shown.
        // Inferring it from the absence of a date picker was not safe, since
        // some booking flows put the calendar a step further on.
        // Checks the fields themselves as well as the form's text. Wix renders
        // its labels outside the <form> element, so reading innerText alone
        // missed a literal "Time" box sitting in the middle of the form.
        const timeRe = /\b(time|date|when|preferred)\b/i;
        const asksForTime =
          forms.length > 0 &&
          (timeRe.test(forms[0].innerText || '') ||
            [...forms[0].querySelectorAll('input,textarea,select')].some((el) =>
              timeRe.test(
                `${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${el.getAttribute('aria-label') || ''} ${
                  el.getAttribute('title') || ''
                }`
              )
            ));

        // A scheduler iframe that is on the page but has not painted anything.
        // The booking page loads, the calendar never appears, and the owner
        // does not see it because their browser has it cached. This is the one
        // finding a recording proves better than any description, which is why
        // it is worth having even though it needs a rendered page to judge.
        const deadEmbed = [...document.querySelectorAll('iframe')].some((fr) => {
          const src = fr.getAttribute('src') || '';
          if (!/calendly|acuity|squareup|setmore|vagaro|mindbody|booksy|fresha|janeapp|cliniko|picktime|youcanbook|simplybook|tidycal|savvycal|cal\.com|hubspot/i.test(src)) return false;
          const r = fr.getBoundingClientRect();
          return r.height < 120 || r.width < 120;
        });

        // The page-by-page scan: the same template-filler, hours and reviews
        // checks the landing page gets, run on every visited page. Mirrors of
        // the runChecks patterns on purpose — hours live on the contact page
        // and reviews on their own page more often than either lives on the
        // home page, and judging the whole site from one page was how the
        // absence findings got things wrong.
        const scanText = ((document.body && document.body.innerText) || '').slice(0, 60000);
        const scanLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
          .map((s) => s.textContent || '').join(' ');
        const scan = {
          chars: scanText.length,
          // Same visible-element rule as the landing page: filler that only
          // exists in the markup is not claimed.
          placeholder: (() => {
            const RE = /lorem ipsum[^.\n]{0,40}|your (?:text|title|content|paragraph) here|\[insert [^\]\n]{0,30}\]?/i;
            if (!RE.test(scanText)) return null;
            const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
              const m = (node.nodeValue || '').match(RE);
              if (!m) continue;
              const el = node.parentElement;
              if (!el) continue;
              const st = getComputedStyle(el);
              if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
              const r = el.getBoundingClientRect();
              if (r.width < 5 || r.height < 5) continue;
              if (r.right < 0 || r.left > innerWidth) continue;
              return m[0].trim().slice(0, 60);
            }
            return null;
          })(),
          hasHours: /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b[^.\n]{0,30}\d{1,2}([.:]\d{2})?\s*(am|pm|[-–])/i.test(scanText)
            || /(opening|business|office|clinic|salon|studio|trading)\s+hours/i.test(scanText)
            || /by appointment/i.test(scanText)
            || /openinghours/i.test(scanLd),
          hasReviews: /testimonial|reviews|★|⭐|5[- ]star|what (our|my) clients/i.test(scanText)
            || !!document.querySelector('[class*="testimonial" i], [id*="testimonial" i], [class*="review" i], iframe[src*="trustpilot" i], iframe[src*="review" i]')
            || /aggregaterating|"review"/i.test(scanLd),
        };

        return {
          scan,
          title: (document.title || '').trim(),
          deadEmbed,
          calendarRaw,
          // A sign-in wall standing between someone and the times. Judged on a
          // password field plus sign-in wording, so a booking form that merely
          // mentions "account" does not trip it.
          behindLogin:
            !!document.querySelector('input[type="password"]') &&
            /sign\s?in|log\s?in|create an account|register|member login/i.test(
              ((document.body && document.body.innerText) || '').slice(0, 4000)
            ),
          asksForTime,
          furtherStep,
          form: forms.length
            ? {
                sel: mark(forms[0], 'pageform'),
                fields,
                asksAboutJob: [...forms[0].querySelectorAll('input,select,textarea')].some((el) => {
                  const hay = [
                    el.name, el.id, el.placeholder, el.getAttribute('aria-label'),
                    (el.closest('label') || {}).textContent,
                  ].join(' ').toLowerCase();
                  return /address|suburb|postcode|zip|street|service|job|project|work|property|type|describe|detail|message|comment|enquir|inquir|how can we|what do you need/.test(hay);
                }),
              }
            : null,
          email: mail.length ? { text: clean(mail[0]), sel: mark(mail[0], 'pageemail') } : null,
          replyPromise: new RegExp(promiseSrc, 'i').test((document.body && document.body.innerText) || ''),
          booking: refs.some((u) => booking.test(u)),
        };
      },
      { promiseSrc: REPLY_PROMISE.source, bookingSrc: BOOKING.source, collectSrc: COLLECT_CALENDAR_SRC }
    );
    // The decision, taken outside the page where it can be tested.
    data.hasCalendar = judgeCalendar(data.calendarRaw || {}).hasCalendar;

    // If no calendar was visible, follow the booking control rather than
    // concluding from its absence. A flow can put the calendar a step further
    // on, and guessing produced a false "there is no way to book you" on a
    // site with a Book Now button.
    // Checked from outside the page, because the error lives in the captcha's
    // own iframe and in-page script cannot read across into it.
    const captchaBroken = await captchaBrokenOn(page).catch(() => false);

    let clicked = null;
    if (!data.hasCalendar) {
      // Wix and similar hydrate their nav after first paint, so a control that
      // is not in the DOM at 1.5s is there by 3s. Looking too early found
      // nothing and was indistinguishable from there being nothing to find.
      await page.waitForTimeout(1500);
      const ctrl = await findBookingControl(page);
      if (ctrl) {
        try {
          // Navigate when it is a plain link. Clicking one tears down the
          // execution context mid-call, which threw, and the throw was being
          // swallowed so the follow-through looked like it had simply found
          // nothing. Only genuinely scripted controls get clicked.
          if (ctrl.href) {
            await page.goto(ctrl.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
          } else {
            await page.click(ctrl.sel, { timeout: 8000 });
          }
          await page.waitForTimeout(2800);
          data.hasCalendar = await calendarOnPage(page, BOOKING.source);
          clicked = { text: ctrl.text, landedOn: page.url() };
        } catch (e) {
          // Recorded, not hidden. Silence here previously read as "no booking
          // control on the page", which is a different and much stronger claim
          // than "we could not follow it".
          clicked = { text: ctrl.text, failed: String(e.message).slice(0, 80) };
        }
      }
    }
    return { ...data, captchaBroken, href: url.href, status: resp ? resp.status() : null, clicked };
  } catch {
    return null;
  }
}

// One level deep, and only pages that bear on the enquiry path. Reading the
// landing page alone was the root of most of the wrong claims: the form lives
// on /contact, the booking widget lives on /book, and judging either from the
// home page is guessing. Capped, because this runs per prospect and an
// unbounded crawl on a large site would take minutes.

// The checks an owner cannot run by looking at their own screen: how long it
// took, whether it is served securely, whether it overflows sideways on a
// phone, whether images are actually loading. These are the findings worth
// sending, as opposed to observations about how their site is laid out.
async function runChecks(page, target, patterns) {
  const nav = await page.evaluate(({ BOOKING, FOLLOWUP, REPLY_PROMISE }) => {
    const booking = new RegExp(BOOKING, 'i');
    const followup = new RegExp(FOLLOWUP, 'i');
    const promise = new RegExp(REPLY_PROMISE, 'i');
    // Every URL the page references, plus inline script text, since booking
    // widgets are as often injected by a snippet as linked directly.
    const refs = [...document.querySelectorAll('a[href],script[src],iframe[src],link[href]')]
      .map((el) => el.getAttribute('href') || el.getAttribute('src') || '')
      .concat([...document.querySelectorAll('script:not([src])')].map((s) => (s.textContent || '').slice(0, 4000)));
    const bookingHit = refs.find((u) => booking.test(u)) || null;
    const bookingVendors = [...new Set(
      refs.filter((u) => booking.test(u)).map((u) => (u.match(booking) || [''])[0].toLowerCase())
    )];
    const bookingLink = [...document.querySelectorAll('a[href]')].find((a) => booking.test(a.getAttribute('href') || ''));
    if (bookingLink) bookingLink.setAttribute('data-aud', 'booking');

    // Already on GoHighLevel. Worth knowing because it changes the pitch:
    // fixes inside a platform Ary already works in are the easy kind, and
    // saying so is what turns a list of problems into a comfortable yes.
    const onGhl = refs.some((u) => /leadconnectorhq|msgsndr|gohighlevel/i.test(u));

    const n = performance.getEntriesByType('navigation')[0];
    const imgs = [...document.images];
    // Template filler still sitting in the copy. The tightest possible
    // patterns on purpose: "coming soon" is a real thing businesses write,
    // "lorem ipsum" and "your text here" never are. The snippet rides along
    // so the video can quote the exact words on screen.
    const bodyText = (document.body?.innerText || '').slice(0, 60000);
    // Walked node by node and only claimed when the words sit in an element a
    // person can actually see. Ary's rule: template filler that only lives in
    // the markup — a hidden slide, a collapsed section, an unused template
    // block — is an AI-saw-it-in-the-code claim, and those get argued with.
    // If the match is not visibly on the page, it is not a finding.
    const placeholderText = (() => {
      const RE = /lorem ipsum[^.\n]{0,40}|your (?:text|title|content|paragraph) here|\[insert [^\]\n]{0,30}\]?/i;
      if (!RE.test(bodyText)) return null;
      const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const m = (node.nodeValue || '').match(RE);
        if (!m) continue;
        const el = node.parentElement;
        if (!el) continue;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 5 || r.height < 5) continue;
        // Carousel clones and parked slides sit fully outside the horizontal
        // band of the page; nobody reads those either.
        if (r.right < 0 || r.left > innerWidth) continue;
        return m[0].trim().slice(0, 60);
      }
      return null;
    })();
    // Hours and reviews are absence checks, so they look everywhere this page
    // can show them: the rendered text, schema markup, and the containers the
    // usual review tools inject. Generous on purpose — anything that might be
    // hours or a review counts as present, because the cost of wrongly muting
    // the finding is nothing and the cost of wrongly raising it is the reply.
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => s.textContent || '').join(' ');
    const hasHours = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b[^.\n]{0,30}\d{1,2}([.:]\d{2})?\s*(am|pm|[-–])/i.test(bodyText)
      || /(opening|business|office|clinic|salon|studio|trading)\s+hours/i.test(bodyText)
      || /by appointment/i.test(bodyText)
      || /openinghours/i.test(ld);
    const hasReviews = /testimonial|reviews|★|⭐|5[- ]star|what (our|my) clients/i.test(bodyText)
      || !!document.querySelector('[class*="testimonial" i], [id*="testimonial" i], [class*="review" i], iframe[src*="trustpilot" i], iframe[src*="review" i]')
      || /aggregaterating|"review"/i.test(ld);
    // An Instagram feed widget that has stopped painting. These die when the
    // connection token expires and nobody gets told; an empty strip sits where
    // the posts were. Only Instagram-specific embed hosts count, so a generic
    // widget can never trip a claim about "your Instagram feed".
    const deadFeed = [...document.querySelectorAll('iframe')].some((fr) => {
      const src = fr.getAttribute('src') || '';
      if (!/instagram\.com|lightwidget|snapwidget|behold\.so|juicer\.io/i.test(src)) return false;
      const r = fr.getBoundingClientRect();
      return r.height < 80 || r.width < 80;
    });
    // A form whose submit opens the visitor's own mail program instead of
    // sending. On phones without a configured mail app the button does
    // nothing at all, and the owner never finds out.
    const mailtoForm = [...document.querySelectorAll('form')].some((f) => /^mailto:/i.test(f.getAttribute('action') || ''));
    return {
      deadFeed,
      mailtoForm,
      placeholderText,
      bodyChars: bodyText.length,
      hasHours,
      hasReviews,
      onGhl,
      // loadEventEnd is relative to the start of navigation, so it is already
      // the elapsed time. 0 means the load event has not fired yet.
      loadMs: n && n.loadEventEnd > 0 ? Math.round(n.loadEventEnd) : null,
      // An image is only broken if it was actually asked to load something and
      // failed. Lazy-loaded images have no src yet, only a data-src, and report
      // complete with a natural width of zero, which counted ten perfectly good
      // Squarespace images on awakenananda.com as broken. Scrolling the page
      // loads them and the count drops to nought.
      ...(() => {
        const broken = imgs.filter((i) => {
          const src = i.getAttribute('src');
          if (!src || /^data:|^blob:/.test(src)) return false;
          if (i.getAttribute('data-src') && !i.currentSrc) return false;
          return i.complete && i.naturalWidth === 0;
        });
        // One of them is tagged so the walkthrough can point the camera at it.
        // This finding used to be narrated over whatever happened to be on
        // screen, which is talking about a gap without ever showing it.
        let sel = null;
        if (broken[0]) {
          broken[0].setAttribute('data-aud', 'brokenimg');
          sel = '[data-aud="brokenimg"]';
        }
        // When every broken image comes from the same outside host, the cause
        // is that host rather than the site. suzyshypnotherapy.com.au loads all
        // five of its blog thumbnails from via.placeholder.com, a free
        // placeholder service that has since gone away, so the images did not
        // break one at a time: they all went at once and nobody was told.
        // Worth separating, because "your images are broken" and "the service
        // you were loading them from no longer exists" are different problems
        // with different fixes.
        const hosts = new Set();
        for (const i of broken) {
          try {
            const h = new URL(i.currentSrc || i.src, location.href).hostname.replace(/^www\./, '');
            if (h && h !== location.hostname.replace(/^www\./, '')) hosts.add(h);
          } catch {}
        }
        return {
          brokenImages: broken.length,
          brokenImageSel: sel,
          // Only when it is ALL of them and there are several: one stray
          // hotlink is not a dead service.
          deadImageHost: hosts.size === 1 && broken.length >= 3 ? [...hosts][0] : null,
        };
      })(),
      hasH1: !!document.querySelector('h1'),
      // A map that never painted. Same shape as the dead calendar embed: the
      // box is there, the map is not, and the owner's browser has it cached so
      // they see it working every time they look.
      deadMap: [...document.querySelectorAll('iframe')].some((fr) => {
        const src = fr.getAttribute('src') || '';
        if (!/google\.com\/maps|maps\.google|openstreetmap|mapbox|bing\.com\/maps/i.test(src)) return false;
        const r = fr.getBoundingClientRect();
        return r.height < 80 || r.width < 80;
      }),
      // What a link to this site looks like when it is pasted into a text or a
      // DM. Without these it arrives as a bare URL with no picture and no
      // description, which matters for businesses that get passed between
      // friends. Checked by pasting your own link into a message to yourself.
      noLinkPreview: (() => {
        const has = (sel) => {
          const el = document.querySelector(sel);
          return !!el && !!(el.getAttribute('content') || '').trim();
        };
        const image = has('meta[property="og:image"]') || has('meta[name="twitter:image"]');
        const title = has('meta[property="og:title"]') || has('meta[name="twitter:title"]');
        return !image && !title;
      })(),
      // A free download that hands the file straight over. The whole point of a
      // lead magnet is the email address, and a direct link to the PDF gives
      // the guide away and keeps nothing. Exact: the link text offers something
      // free and the destination is a file, so there is no form in between.
      openLeadMagnet: (() => {
        const OFFER = /free|guide|checklist|ebook|e-book|workbook|template|worksheet|download|cheat\s*sheet|toolkit|starter|planner/i;
        const FILE = /\.pdf($|[?#])|\.docx?($|[?#])|drive\.google\.com\/file|dropbox\.com\/s\/|\.zip($|[?#])/i;
        // A page already asking for an email is not giving the guide away for
        // nothing, whatever a direct file link looks like from outside.
        // centreforlifetherapies.com links straight to a workbook PDF and also
        // runs three forms with two email fields: the link may be the download
        // people are sent to after signing up, or a leak beside a working
        // signup, and nothing visible from here separates those. The claim only
        // holds where there is no email capture at all, so that is where it is
        // made. Saying it to someone who does collect emails is the kind of
        // wrong that ends the conversation, and the finding is worth far less
        // than the credibility it would spend.
        const capturesEmail =
          document.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i]') !== null;
        if (capturesEmail) return null;
        for (const a of document.querySelectorAll('a[href]')) {
          const label = (a.innerText || '').replace(/\s+/g, ' ').trim();
          if (!label || label.length > 60 || !OFFER.test(label)) continue;
          if (FILE.test(a.href)) return label.slice(0, 40);
        }
        return null;
      })(),
      // Markup that predates phones. font, center and marquee were dropped from
      // the standard long ago, and a layout built from nested tables is the
      // clearest sign a site has not been rebuilt this decade. Judged on tags,
      // not on taste.
      ancientMarkup: (() => {
        const legacy = document.querySelectorAll('font, center, marquee, frameset, blink').length;
        const layoutTables = [...document.querySelectorAll('table')].filter(
          (t) => t.querySelector('table') || /width|cellpadding|cellspacing|align/i.test([...t.attributes].map((x) => x.name).join(' '))
        ).length;
        return legacy >= 3 || layoutTables >= 2 ? { legacy, layoutTables } : null;
      })(),
      // Every action button on the page, and how many distinct places they
      // actually go. Ary's third most common catch: several offers, one
      // destination, so the page promises choices it does not have. Confirmed
      // by clicking two of them and landing in the same place.
      ctaTargets: (() => {
        const ACTION = /\b(book|schedule|apply|start|get started|enquire|inquire|request|contact|consult|appointment|reserve|sign up|join)\b/i;
        const seen = new Map();
        for (const a of document.querySelectorAll('a[href]')) {
          const label = (a.textContent || '').replace(/\s+/g, ' ').trim();
          if (!label || label.length > 42 || !ACTION.test(label)) continue;
          const href = a.href;
          if (!href || /^(javascript|mailto|tel):/i.test(href)) continue;
          if (!seen.has(label.toLowerCase())) seen.set(label.toLowerCase(), href.split('#')[0]);
        }
        const labels = [...seen.keys()];
        const targets = [...new Set(seen.values())];
        return { labels: labels.length, targets: targets.length, sample: labels.slice(0, 3) };
      })(),
      // A date on the page that has already passed. The webinar still
      // advertised for last year, with its Register button pointing at a
      // deleted page. Only explicit day-month-year, so nothing is inferred.
      expiredDate: (() => {
        const text = ((document.body && document.body.innerText) || '').slice(0, 40000);
        const MONTHS = 'january|february|march|april|may|june|july|august|september|october|november|december';
        const re = new RegExp('(' + MONTHS + ')\s+([0-9]{1,2}),?\s+(20[0-9]{2})', 'gi');
        const now = new Date();
        let m;
        let worst = null;
        while ((m = re.exec(text))) {
          const d = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
          if (isNaN(d)) continue;
          // Well past, not last week, so a recent blog date is never flagged.
          if (d < new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())) {
            if (!worst || d < worst.date) worst = { date: d, text: m[0] };
          }
        }
        return worst ? worst.text : null;
      })(),
      // The number on the page differing from the number it dials. Ary's
      // sharpest catch and the one owners are most surprised by, because it
      // looks completely fine until you tap it. Only the case where both the
      // text and the href are inside the same link, which is exact and cannot
      // false-positive: an icon-only link has no digits to compare.
      phoneMismatch: (() => {
        // Call tracking swaps the dialled number on purpose, so a mismatch on a
        // site running one is the tool working, not a fault. Saying otherwise
        // tells someone their deliberate setup is broken, which is worse than
        // saying nothing.
        const TRACKING = /callrail|calltrackingmetrics|invoca|marchex|dialogtech|whatconverts|ringba|callsource|convirza|phonewagon|retreaver/i;
        const scripts = [...document.querySelectorAll('script[src],link[href]')]
          .map((el) => el.getAttribute('src') || el.getAttribute('href') || '')
          .join(' ');
        if (TRACKING.test(scripts) || TRACKING.test(document.documentElement.innerHTML.slice(0, 200000))) return null;
        const digits = (v) => String(v || '').replace(/[^0-9]/g, '').replace(/^1(?=[0-9]{10})/, '');
        for (const a of document.querySelectorAll('a[href^="tel:"]')) {
          const dials = digits(a.getAttribute('href'));
          if (dials.length < 7) continue;
          // innerText, not textContent. mtnroofing.com has an inline SVG with a
          // <style> block inside its phone link, and textContent hands back the
          // stylesheet: ".st0{display:none;} .st1" read as a phone number and
          // flagged a mismatch on a link whose number was perfectly correct.
          // innerText is rendered text, so a display:none style block is not in
          // it.
          const visible = (a.innerText || '').replace(/\s+/g, ' ').trim();
          // And the visible text has to actually look like a phone number,
          // rather than merely containing digits somewhere.
          const shape = visible.match(/\+?[0-9][0-9().\-\s]{6,20}[0-9]/);
          if (!shape) continue;
          const shown = digits(shape[0]);
          // A number written with its country code and the same number written
          // with a leading trunk zero are one phone number, and they share no
          // leading digits at all. wellbeinghq.com.au dials +61 421 802 272 and
          // displays 0421 802 272, which is correct on both counts, and a
          // straight string compare called it a fault — on the highest-weighted
          // finding there is. Same in the Philippines, where +63 945 778 5062
          // and 0945 778 5062 are the same number.
          //
          // So the comparison is on the significant tail rather than the whole
          // string. Nine digits is the national number in every country worth
          // caring about here, and two different phones agreeing on their last
          // nine digits is not a thing that happens. The transposed-digit case
          // this check exists for still fails it: 0409942101 against 0409429101
          // differs inside those nine.
          const sameNumber =
            shown === dials ||
            (shown.length >= 9 && dials.length >= 9 && shown.slice(-9) === dials.slice(-9));
          if (shown.length >= 7 && !sameNumber) {
            return {
              shown: shape[0].replace(/\s+/g, ' ').trim().slice(0, 24),
              dials: (a.getAttribute('href') || '').replace(/^tel:/i, '').trim().slice(0, 24),
            };
          }
        }
        return null;
      })(),
      // An address that cannot receive mail. The footer with a doubled .com is
      // the real case this came from. Only outright malformed, never "you have
      // two addresses", because info@ and bookings@ side by side is normal.
      badEmail: (() => {
        const seen = new Set();
        for (const a of document.querySelectorAll('a[href^="mailto:"]')) {
          const v = (a.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0].trim();
          if (!v || seen.has(v)) continue;
          seen.add(v);
          const ok = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(v);
          const doubledTld = /(\.[a-z]{2,})\1$/i.test(v);
          if (!ok || doubledTld) return v.slice(0, 48);
        }
        return null;
      })(),
      // Whether this business sells by quote rather than by appointment. A
      // roofer, an HVAC company or a plumber does not take bookings and never
      // will: the first step is a quote, an estimate, a callback or a site
      // visit. Telling one of them there is no way to book is describing a
      // fault they do not have, in an industry where it is obviously not one,
      // and it discredits everything else said in the video.
      quoteLed: /request\s+(a\s+)?(quote|estimate|callback|service)|free\s+(quote|estimate|inspection|assessment)|get\s+(a\s+)?(quote|estimate)|schedule\s+(an?\s+)?(estimate|inspection|assessment)|quote\s+form|estimate\s+form/i
        .test(document.body.innerText || ''),
      // Search checks. Only things the owner can confirm for themselves in
      // under a minute, because an SEO claim they cannot check reads as
      // consultant noise and costs more than saying nothing.
      //
      // noindex is the one worth finding. It is a single line that tells Google
      // not to list the site at all, it is usually left behind after a rebuild,
      // and nobody notices because the site looks perfectly fine to them.
      noindex: (() => {
        const tags = [...document.querySelectorAll('meta[name="robots"],meta[name="googlebot"]')];
        return tags.some((t) => /noindex/i.test(t.getAttribute('content') || ''));
      })(),
      metaDescription: (() => {
        const m = document.querySelector('meta[name="description"]');
        const v = (m && m.getAttribute('content') || '').trim();
        return v.length >= 50 ? v.slice(0, 200) : null;
      })(),
      // Google reads this to know it is a local business rather than a page
      // about one, which is what the map results are drawn from.
      hasLocalSchema: (() => {
        const blocks = [...document.querySelectorAll('script[type="application/ld+json"]')];
        return blocks.some((b) => /"@type"\s*:\s*"(LocalBusiness|Organization|ProfessionalService|HealthAndBeautyBusiness|MedicalBusiness|DaySpa|HealthClub|Dentist|Physician|SportsActivityLocation|HomeAndConstructionBusiness|RoofingContractor|BeautySalon)"/i.test(b.textContent || ''));
      })(),
      // A street address anywhere on the page. Local results lean on it, and
      // its absence is visible to the owner the moment they look.
      hasAddress: /\d+\s+[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z.'-]+){0,4}\s+(?:st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|way|hwy|highway|pde|parade|cres|crescent|ct|court|pl|place|ste|suite|unit|level)\b/i
        .test(document.body.innerText || ''),
      booking: bookingHit ? { vendor: (bookingHit.match(booking) || [''])[0], sel: bookingLink ? '[data-aud="booking"]' : null } : null,
      // A footer still claiming a year long past is the cheapest signal a
      // visitor has that nobody is home. Owners never notice it because they
      // wrote it once.
      bookingVendors,
      copyrightYear: (() => {
        const years = [...(document.body.innerText || '').matchAll(/(?:©|\(c\)|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)]
          .map((m) => parseInt(m[1], 10))
          .filter((y) => y >= 1995 && y <= new Date().getFullYear() + 1);
        return years.length ? Math.max(...years) : null;
      })(),
      followupTool: (refs.find((u) => followup.test(u)) || '').match(followup)?.[0] || null,
      replyPromise: promise.test(document.body.innerText || ''),
      // Active mixed content only: scripts, stylesheets and iframes served
      // over http are blocked outright by the browser, so the page is really
      // missing them. Images are NOT counted, because browsers silently
      // upgrade those to https and the picture loads fine. Counting them
      // graded a working logo on maryannjohnson.com as this site's single
      // biggest problem, which is exactly the kind of invented fault that
      // makes the rest of the audit worthless.
      blockedRefs: [
        ...document.querySelectorAll('script[src],iframe[src],link[rel="stylesheet"][href]'),
      ].filter((el) => /^http:\/\//i.test(el.getAttribute('src') || el.getAttribute('href') || '')).length,
    };
  }, patterns);

  const finalUrl = page.url();
  const insecure = finalUrl.startsWith('http://');

  return {
    loadMs: nav.loadMs,
    brokenImages: nav.brokenImages,
    brokenImageSel: nav.brokenImageSel,
    deadImageHost: nav.deadImageHost,
    hasH1: nav.hasH1,
    booking: nav.booking,
    followupTool: nav.followupTool,
    replyPromise: nav.replyPromise,
    copyrightYear: nav.copyrightYear,
    quoteLed: nav.quoteLed,
    deadMap: nav.deadMap,
    noLinkPreview: nav.noLinkPreview,
    openLeadMagnet: nav.openLeadMagnet,
    ancientMarkup: nav.ancientMarkup,
    ctaTargets: nav.ctaTargets,
    expiredDate: nav.expiredDate,
    phoneMismatch: nav.phoneMismatch,
    badEmail: nav.badEmail,
    // Two schedulers linked from one site. Owners often do not know the old
    // one is still reachable, and a visitor landing on it books into nothing.
    bookingVendors: nav.bookingVendors,
    // Search. This return is an explicit list, not a spread, so anything read
    // in the page and not named here is collected and silently dropped. These
    // four were, and the checks that depend on them simply never fired.
    noindex: nav.noindex,
    metaDescription: nav.metaDescription,
    hasLocalSchema: nav.hasLocalSchema,
    hasAddress: nav.hasAddress,
    insecure,
    // Only meaningful on an https page; on an http page the whole thing is
    // insecure and that is the finding already being reported.
    mixedContent: !insecure && nav.blockedRefs > 0,
    finalUrl,
  };
}

// Booking tools, by the domains they load from. Detecting these is reliable in
// one direction only: finding calendly means they can be booked online,
// but not finding it does not prove they cannot be. It does prove there is no
// way to book from the website, which is the thing that actually matters here.
// Extended with the tools Ary has actually found in the wild. pureglowellness
// had Moxie and Aesthetic Record both live and neither was in this list, so the
// two-schedulers check could not have fired on the very site it came from.
// `.as.me` is Acuity's short host. Without it sabinelehnhardt.as.me was not
// recognised as a booking tool at all, which is how a site with a live Acuity
// calendar reached the request-form branch in the first place.
const BOOKING = /calendly|acuityscheduling|\.as\.me|squareup\.com\/appointments|setmore|vagaro|mindbodyonline|booksy|schedulicity|simplybook|fresha|gettimely|janeapp|cliniko|appointlet|youcanbook\.me|picktime|bookeo|checkfront|square\.site\/book|moxie\.life|moxiesuite|aestheticrecord|zenoti|blvd\.co|boulevard\.io|glossgenius|noterro|practicebetter|simplepractice|healthengine|hotdoc|tidycal|savvycal|(?:\/\/|\.)cal\.com|koalendar|hubspot\.com\/meetings|meetings\.hubspot|book\.stripe\.com/i;

// Email and CRM tooling. Reported only when present, never as an absence:
// plenty of businesses follow up from a CRM, a phone, or a shared inbox that
// leaves no trace in the page source. "I could not see a mailing tool" is not
// the same as "you do not follow up", and only one of those is safe to say.
const FOLLOWUP =
  /mailchimp|list-manage\.com|klaviyo|hubspot|convertkit|activehosted|activecampaign|constantcontact|getdrip|omnisend|mailerlite|sendinblue|brevo/i;

// Something that tells a visitor when they will hear back. Its absence IS
// observable: we read the page and no such promise was on it.
// rpvchiro.com says "We will call you within 24 business hours to schedule an
// appointment" and was told nothing on the page says when anyone will hear
// back. It missed on both halves at once.
//
// The verb list had no way of promising contact by phone, only by writing:
// reply, respond, hear back. A clinic that rings people back was invisible to
// it. "call you" and "contact you" are there now, in that direction only —
// "call us" is an instruction to the visitor, not a promise to them, and the
// same page carries a cancellation policy asking exactly that.
//
// The bare hours branch also demanded the unit immediately after the number,
// so "within 24 hours" matched and "within 24 business hours" did not, which is
// the more careful way to write it and the more common one on a clinic site.
// Business and working are allowed between them, and any number rather than
// only 24 or 48.
const REPLY_PROMISE =
  /\b(reply|replies|respond|response|get back to you|hear back|hear from us|answer|call you|contact you|be in touch|follow up with you)\b[^.!?]{0,40}\bwithin\b[^.!?]{0,25}\b(\d+|one|two|a few)\b|\bwithin\s+(\d+)\s*(?:business|working)?\s*(?:hours|hrs|days)\b|\bsame\s+day\s+(reply|response)\b/i;

const goesToContactPage = (findings) =>
  findings.some((f) => f.key === 'form-on-contact-page' || f.key.startsWith('contact-page-'));

// What the walkthrough would take at pace 1, in ms. Counts only the beats that
// are actually performed, which is the spoken findings rather than every
// finding recorded. Counting all of them made the estimate too long, so the
// pace came out too fast and the picture finished before the voice.
function naturalMs(facts, findings) {
  const { real, opener, clean } = spoken(findings);
  const beats = real.length + (opener ? 1 : 0) + (clean ? 1 : 0);
  const steps = Math.min(7, Math.max(3, Math.round(facts.pageHeight / 800)));
  // The enquiry-path detour now runs on every site that has one, so it counts
  // toward the estimate whether or not anything about it was wrong.
  const contactDetour = facts.contactPage && !facts.form ? 2000 + 1800 + 2400 + 900 : facts.form ? 2400 : 0;
  return (
    2500 + // initial settle
    2200 + // title card
    1500 * steps +
    1400 + // scroll back to top
    contactDetour +
    2400 * beats +
    (real.some((f) => f.key === 'mobile-overflow') ? 3200 : 0) + // the phone-width beat
    (real.some((f) => f.key === 'booking-is-a-form') ? 2000 + 2400 + 2400 : 0) + // following the booking button
    (real.some((f) => f.key === 'captcha-broken') ? 2200 : 0) + // going to the page with the broken captcha
    1000 // tail
  );
}

// Measured in a real mobile context, not by resizing a desktop one. Site
// builders like Wix serve a different layout based on the user agent, so a
// desktop UA at 390px wide renders the DESKTOP layout squeezed into a phone
// viewport and reports a huge overflow that no actual phone would ever see.
// That false positive led both of the first two prospect audits with "your
// layout runs 590 pixels wider than the screen, fix that one first", on two
// sites that are perfectly fine on a phone. Emulating the device properly
// reports 0 for both.
const IPHONE = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

async function mobileOverflowPx(browser, target) {
  const ctx = await browser.newContext(IPHONE);
  const p = await ctx.newPage();
  try {
    await p.goto(target, { waitUntil: 'load', timeout: 45000 });
    await p.waitForTimeout(1800);
    return await p.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  } catch {
    return 0;
  } finally {
    await ctx.close().catch(() => {});
  }
}


// Checks internal links and reports the ones that are actually gone.
//
// This is the check an owner cannot run for themselves without clicking every
// link on their own site, which is why it is worth saying out loud.
//
// Only 404 and 410 count. Plenty of sites answer a bot with 403, or refuse
// HEAD, or time out under load, and none of that means a visitor gets nothing.
// Claiming a working page is broken is the one mistake that ends the
// conversation the moment they check.
async function deadLinks(links, target, cap = 25) {
  let home;
  try {
    home = new URL(target);
  } catch {
    return [];
  }
  const bare = (h) => h.replace(/^www\./, '');
  const seen = new Set();
  const queue = [];
  for (const l of links || []) {
    let u;
    try {
      u = new URL(l.href);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol)) continue;
    if (bare(u.hostname) !== bare(home.hostname)) continue;
    const key = u.pathname.replace(/\/$/, '') + u.search;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    // The path is kept as well as the text. Many of these links are images or
    // icons with no text at all, and "one of your links is dead" is not
    // something anyone can act on or verify.
    queue.push({ href: u.href, path: u.pathname, text: (l.text || '').trim().slice(0, 40), isImage: !!l.isImage, atRatio: l.atRatio, nav: !!l.nav });
    if (queue.length >= cap) break;
  }

  const dead = [];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      try {
        let res = await fetch(item.href, {
          method: 'HEAD',
          redirect: 'follow',
          headers: { 'user-agent': UA },
          signal: AbortSignal.timeout(12000),
        });
        // Some servers do not implement HEAD. Ask properly before judging.
        if (res.status === 405 || res.status === 501) {
          res = await fetch(item.href, {
            method: 'GET',
            redirect: 'follow',
            headers: { 'user-agent': UA },
            signal: AbortSignal.timeout(15000),
          });
        }
        if (res.status === 404 || res.status === 410) {
          dead.push({ ...item, status: res.status });
        }
      } catch {
        // Timeouts and network errors say nothing reliable about the page.
      }
    }
  });
  await Promise.all(workers);
  return dead;
}

// Load time from one sample is not worth saying out loud. The same site
// measured 2.1s on one run and 7.2s on the next, and the narration states the
// figure as a fact. Three cold loads in fresh contexts, median taken, so a
// single slow round trip cannot be reported as how the site always behaves.
// Fresh contexts rather than reloads because a reload hits the cache and would
// understate it in the other direction.
async function medianLoadMs(browser, target, samples = 3) {
  const times = [];
  for (let i = 0; i < samples; i += 1) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, userAgent: UA });
    const p = await ctx.newPage();
    try {
      await p.goto(target, { waitUntil: 'load', timeout: 45000 });
      const t = await p.evaluate(() => {
        const n = performance.getEntriesByType('navigation')[0];
        return n && n.loadEventEnd > 0 ? Math.round(n.loadEventEnd) : null;
      });
      if (Number.isFinite(t)) times.push(t);
    } catch {
      // A sample that fails tells us nothing about speed; the other two stand.
    } finally {
      await ctx.close().catch(() => {});
    }
  }
  if (!times.length) return null;
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

// Pass one. No video, so it is cheap to run and its only job is to decide what
// is true about the site.
export async function probe(targetUrl) {
  const target = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
  const browser = await chromium.launch(LAUNCH);
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, userAgent: UA });
  const page = await context.newPage();

  // Things that are actually broken, collected while the page loads. These are
  // invisible to a raw HTML fetch, which is exactly the gap this service fills
  // for the audit skill: a script that fails to load or a captcha with a bad
  // site key stops a form working, and nobody can see that from the markup.
  //
  // Note what this cannot catch: a form that fails when you press submit. The
  // form is never submitted, because that lands a fake enquiry in a real
  // business's inbox, so a submit-time failure stays invisible and must not be
  // guessed at.
  // Only things a visitor would actually notice missing. Analytics beacons,
  // tracking pixels and ad endpoints fail or 404 constantly on perfectly
  // healthy sites, and counting them told askkatiep.com that twenty things on
  // her page were broken when a plain load of it fails nothing at all.
  const VISIBLE_TYPES = new Set(['script', 'stylesheet', 'image', 'font', 'media', 'document']);
  const NOISE = /googletagmanager|google-analytics|doubleclick|facebook\.(com|net)|hotjar|clarity\.ms|segment|mixpanel|\/markup\/ad|adservice|\/collect|\/pixel|\/beacon/i;
  const broken = { console: [], failed: [], badStatus: [] };
  const counts = (r) => VISIBLE_TYPES.has(r.resourceType()) && !NOISE.test(r.url());

  page.on('console', (m) => {
    if (m.type() === 'error') broken.console.push(String(m.text()).slice(0, 160));
  });
  page.on('requestfailed', (r) => {
    if (counts(r)) broken.failed.push(String(r.url()).slice(0, 140));
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && counts(r.request())) {
      broken.badStatus.push(`${r.status()} ${String(r.url()).slice(0, 120)}`);
    }
  });

  try {
    // `load` rather than `domcontentloaded` so the timing check measures what a
    // visitor waits for, images and all.
    const resp = await page.goto(target, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(2000);
    const overlays = await sweepOverlays(page);
    await page.waitForTimeout(400);
    // Snapshot before the crawl. The listeners stay attached for the whole run,
    // so without this the totals accumulate across every page visited and get
    // reported as though they all happened on the landing page.
    const brokenOnLanding = {
      console: broken.console.length,
      failed: broken.failed.length + broken.badStatus.length,
      detail: [...broken.badStatus, ...broken.failed].slice(0, 3),
    };
    const facts = await readFacts(page);
    const checks = await runChecks(page, target, {
      BOOKING: BOOKING.source,
      FOLLOWUP: FOLLOWUP.source,
      REPLY_PROMISE: REPLY_PROMISE.source,
    });
    // One level deep, over the pages that bear on the enquiry path.
    // Everything that must be judged about the LANDING page is measured here,
    // before the crawl below moves this same `page` object off it.
    //
    // This is where a 20-credit probe was being thrown away. The emptiness
    // test used to run after the crawl, so it judged whichever sub-page the
    // crawl happened to finish on. A thin /contact or /book page — a form and
    // two links, which is completely normal — read as "this site is empty",
    // the whole probe was discarded, and the prospect was recorded as
    // impossible to verify.
    //
    // Measured on 2026-08-09: three sites marked empty had 5,900, 10,100 and
    // 5,400 characters of visible text on their landing pages. Every one was a
    // real business with a real website, and every one cost 20 credits to
    // learn nothing about.
    const landing = await landingShell(page);
    // Same reason: a captcha belongs to the page that carries the form, and
    // after the crawl this would be asking the wrong page.
    checks.captchaBroken = await captchaBrokenOn(page).catch(() => false);

    const pages = [];
    for (const p of pickPages(facts.links, target)) {
      const data = await visitPage(page, p.href, target, 1500);
      if (data) pages.push({ ...p, ...data });
    }
    // Fold the per-page scans into the site-wide answers, so "on the site"
    // means every page visited rather than the home page alone. The two
    // absences can only be muted by a subpage, never raised by one, and
    // template filler found anywhere counts wherever it was found — with the
    // page named, so the video can say where.
    const scans = pages.map((p) => ({ kind: p.kind, scan: p.scan })).filter((s) => s.scan);
    checks.hasHours = checks.hasHours || scans.some((s) => s.scan.hasHours);
    checks.hasReviews = checks.hasReviews || scans.some((s) => s.scan.hasReviews);
    checks.bodyChars = Math.max(checks.bodyChars || 0, ...scans.map((s) => s.scan.chars || 0), 0);
    if (!checks.placeholderText) {
      const hit = scans.find((s) => s.scan.placeholder);
      if (hit) {
        checks.placeholderText = hit.scan.placeholder;
        checks.placeholderPage = hit.kind;
      }
    }
    // How many pages the audit actually looked at, counting the landing page.
    // The watch page says "checked page by page"; this is the number that
    // makes it true, and the report can cite it.
    checks.pagesChecked = 1 + pages.length;
    // Replaces the single-sample figure from runChecks with a median of three.
    //
    // Both of these open their own browser contexts, and a browser that has died
    // under a heavy page answers "Target page, context or browser has been
    // closed" to the next one. ilroofers.com failed exactly there, twice, with
    // the whole page already measured and only these two refinements left.
    //
    // Losing a refinement is fine: loadMs already holds a single-sample figure
    // from runChecks, and an unknown mobile overflow simply is not claimed. What
    // is not fine is losing the audit over one of them, so neither can throw.
    checks.loadMs = (await medianLoadMs(browser, target).catch(() => null)) ?? checks.loadMs;
    // Whether this site sits on the other side of the planet from the machine
    // measuring it. The renderer runs in us-east1, so every request to an
    // Australian or New Zealand site carries a transpacific round trip that the
    // site's actual visitors never pay, and the number that comes back is our
    // distance from them rather than their speed.
    //
    // Judged on the domain, which is the only signal available before anything
    // is claimed. A .com.au serving Australians is the ordinary case and the one
    // worth protecting.
    try {
      checks.farFromRenderer = /\.(au|nz)$/i.test(new URL(target).hostname);
    } catch {
      checks.farFromRenderer = false;
    }
    checks.mobileOverflowPx = await mobileOverflowPx(browser, target).catch(() => checks.mobileOverflowPx);
    // Nav links first, so menu items win the cap and keep their nav flag
    // through the dedupe: a dead dropdown item is worth more than a dead
    // footer link, and the checker takes whichever form of a path it sees
    // first.
    checks.deadLinks = await deadLinks([...(facts.navLinks || []), ...facts.links], target).catch(() => []);
    // The captcha check moved above the crawl, where `page` is still the
    // landing page. A captcha configured with the wrong key renders its own
    // error in place of the widget, so it is readable without submitting
    // anything — but only on the page that carries the form.
    checks.consoleErrors = brokenOnLanding.console;
    checks.failedRequests = brokenOnLanding.failed;
    checks.brokenDetail = brokenOnLanding.detail;
    // A page we were not allowed to see cannot be audited. leahyiannis.com
    // answered 403 and the audit read the Cloudflare block page as the site:
    // it took "Forbidden" for the business name and reported no contact form,
    // no email and no contact page, none of which was a fact about her site.
    // Blocked is not the same as broken, and only one of them is safe to say.
    const status = resp ? resp.status() : 0;
    const BLOCK_TITLE =
      /^(forbidden|access denied|not found|error|attention required|just a moment|site not found|404|403|502|503|blocked)/i;

    // A page can also load perfectly and simply not be a website.
    // milesstovall.com answers 200 and renders white: it is a parked domain,
    // and the audit reported no form, no button and no way to make contact.
    // Every one of those was true of the placeholder and none of them was a
    // fact about a business. Same failure as the 403 above, without the status
    // code that made it obvious.
    //
    // Two independent signals, because parking pages vary: the registrar's own
    // markers, and a page that simply has nothing on it. The emptiness test
    // needs both almost no words AND almost no links, since a real business
    // page has hundreds of characters and a nav even when it is one page long.
    //
    // Erring toward refusing costs a video that might have been fine. Erring
    // the other way sends a prospect ninety seconds about a blank page, which
    // is the one mistake that cannot be walked back.
    const shell = landing;
    const emptyShell = shell.textLength < 120 && shell.links < 3;

    // A link-in-bio page is not a website, and auditing one produces a video
    // about somebody else's product. linktr.ee/as_elitecoaching got a full
    // audit: no button above the fold, no search description, no contact form.
    // Every one of those is true of Linktree itself and none of it is theirs to
    // fix or ours to comment on.
    //
    // Judged on the host rather than the page, because these are deliberately
    // clean, fast pages that pass every emptiness test: real text, plenty of
    // links, nothing parked about them.
    const LINK_IN_BIO =
      /(^|\.)(linktr\.ee|lnk\.bio|bio\.link|beacons\.ai|campsite\.bio|solo\.to|allmylinks\.com|milkshake\.app|taplink\.cc|stan\.store|koji\.to|shorby\.com|linkin\.bio|flowcode\.com|linkpop\.com|withkoji\.com)$/i;
    let host = '';
    try {
      host = new URL(target).hostname.replace(/^www\./, '');
    } catch {}
    checks.blocked =
      status >= 400 || BLOCK_TITLE.test(facts.title || '')
        ? { status, title: facts.title || null, reason: 'blocked' }
        : LINK_IN_BIO.test(host)
          ? { status, title: facts.title || null, reason: 'link-in-bio', host }
          : shell.parked
            ? { status, title: facts.title || null, reason: 'parked' }
            : emptyShell
              ? { status, title: facts.title || null, reason: 'empty' }
              : null;
    const findings = checks.blocked ? [] : deriveFindings(facts, pages, checks);
    return { target, facts, checks, pages, findings, overlays, blocked: checks.blocked, naturalSeconds: naturalMs(facts, findings) / 1000 };
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

// On-screen text for findings with nothing on the page to point at. Short,
// because it is read in a couple of seconds while the narration says the longer
// version out loud.
const SILENT_BEAT = {
  noindex: 'Your code tells Google not to list this site.',
  'no-local-schema': 'Nothing tells Google this is a local business.',
  'no-address': 'No address anywhere on the site.',
  'dead-links': (d) => `${d} links go to a page that is not there.`,
  'dead-link-one': (d) => {
    // Carries the address now, because the spoken line stopped reading it out:
    // a URL said aloud is a stream of slashes nobody can write down, and on
    // screen it is the one place they can actually read it.
    const [text, , path] = String(d || '').split('|');
    const what = text || 'One link';
    return path ? `${what} points at ${path}, which is not there.` : `${what} goes to a page that is not there.`;
  },
  'stale-copyright': (d) => `The footer still says ${d}.`,
  'stale-stack': (d) => `Still running ${d}, years out of date.`,
  'no-meta-description': 'No description set, so Google picks a random line.',
  'booking-is-a-form': 'The booking button leads to a form, not a calendar.',
  'placeholder-text': (d) => {
    const [snippet, where] = String(d || '').split('|');
    return where
      ? `Template text on the ${where} page: "${snippet}"`
      : `Template text still on the page: "${snippet}"`;
  },
  'social-stub': (d) => `The ${d} icon links to ${d} itself, not your page.`,
  'default-title': (d) => `The browser tab still says "${d}".`,
  'nav-dead-link': (d) => {
    const [text, path] = String(d || '').split('|');
    const what = text ? `"${text}" in the menu` : 'A menu item';
    return path ? `${what} points at ${path}, which is not there.` : `${what} goes nowhere.`;
  },
  'no-hours': 'No opening hours anywhere on the site.',
  'no-reviews': 'No reviews or testimonials on the site.',
  'social-feed-dead': 'The Instagram feed on the page never loads.',
  'mailto-form': 'The form opens their mail app instead of sending.',
};

// Pass two. Records, stretching every hold so the walkthrough runs for about
// `targetSeconds` (the measured length of the narration). Clamped because a
// very long script should not leave the page sitting motionless for a minute,
// and a very short one should not make the walkthrough unreadably fast.
// `cues` maps each spoken segment to the second it begins. When present, each
// beat waits for its own line instead of the whole walkthrough being stretched
// to the same total length. Matching totals was never enough: both ended
// together while the middle drifted, so a form was described while the video
// was still somewhere else.
export async function walkthrough(target, facts0, findings, targetSeconds, cues = [], ownFindings = []) {
  // pace stretches every hold so the walkthrough fills the narration's length.
  // That is the right thing to do when there are no cues and the only tool is
  // matching totals. It is the wrong thing to do once cues exist, and the two
  // actively fight: awaitCue can only ever wait, never catch up, so a beat
  // stretched to 2.65 times its natural length overruns its own line and every
  // beat after it inherits the lateness. The video and the audio still ended
  // together, which is what made this look fixed when it was not.
  //
  // With cues, run at natural speed and let the waiting fill the time. The
  // pauses then land between beats, where the narration is moving from one
  // point to the next, instead of being smeared across every hold.
  const pace = cues && cues.length
    ? 1
    : targetSeconds
      ? Math.min(3, Math.max(0.6, (targetSeconds * 1000) / naturalMs(facts0, findings)))
      : 1;

  const cueAt = new Map((cues || []).map((c) => [c.key, c.start]));
  // How long each spoken line lasts, taken from the gap to the next cue. A
  // beat used to show its card for a fixed 2.4 seconds and then clear it, so
  // the rest of that line played over a bare page: measured as fifty seconds
  // of near-total stillness across the middle of the video. Holding the card
  // for the whole line means whatever is being said is on screen while it is
  // being said, which is the entire point.
  const cueOrder = (cues || []).slice().sort((a, b) => a.start - b.start);
  //
  // Measured from now to the next line, not from one cue to the next. The
  // difference is what lets a late beat catch up: a beat whose own work ran
  // long, following a link to the contact page say, gets a correspondingly
  // shorter hold and the one after it starts on time. Computed cue-to-cue it
  // could only ever stay late, which is how a four second debt at the top of
  // the video became nine by the middle.
  const holdForCue = (key, fallback) => {
    const i = cueOrder.findIndex((c) => c.key === key);
    // Connectors are skipped when looking for the deadline. They are a bridge
    // between two problems rather than a subject of their own, so nothing on
    // screen belongs to them: a box that closed when one began would leave the
    // page bare for the second or two it speaks, and the highlight for the
    // point still being made would come down early.
    const next = i === -1 ? null : cueOrder.slice(i + 1).find((c) => !String(c.key).startsWith('connector-'));
    if (!next || !t0) return fallback;
    // A short clear gap before the next point so the cards do not run into
    // each other, a floor so a card never merely blinks, and a ceiling so one
    // long line cannot freeze the picture.
    //
    // The floor only applies while the beat is on time. It used to apply always,
    // and that is where the video's overrun came from: awaitCue can wait but
    // never skip, so once a beat ran long every following one was late, and each
    // late beat still claimed its 700ms whether or not its line had already been
    // said. Eight beats behind by a little became eight seconds of video with
    // nothing left to play over it, measured at 8.0s on
    // alisonhewittnaturaltherapies.com and 9.3s on melissamorenobarnett.
    //
    // Behind, the card still shows, just briefly, and the walkthrough closes the
    // gap instead of widening it. The narration is the clock; the pictures catch
    // up to it.
    const remaining = next.start * 1000 - (Date.now() - t0) - 400;
    if (remaining <= 0) return 140;
    const hold = Math.max(700, Math.min(remaining, 18000));
    // Never hold past the end of the narration.
    //
    // Every budget in the walkthrough carries a floor, and a floor can only
    // ever push a beat later. Individually they are a few hundred milliseconds;
    // together, across a tour, a detour and eight beats, they ran the picture
    // seven seconds past the last word. Measured as 8.0s of silence on
    // alisonhewittnaturaltherapies.com, 9.3s on melissamorenobarnett.
    //
    // This is the backstop rather than a fix for any one of them: whatever the
    // floors ask for, no beat may hold beyond the audio it is meant to sit
    // under. The closing drift already ends there, so this makes the beats
    // agree with it.
    if (Number(targetSeconds) > 0) {
      const leftOfNarration = Number(targetSeconds) * 1000 - (Date.now() - t0);
      if (leftOfNarration <= 0) return 140;
      return Math.min(hold, leftOfNarration);
    }
    return hold;
  };
  // When the recording began, and when the narration should begin. They are
  // not the same instant: the video starts on a blank frame and a page load,
  // and the first spoken word should land on their site rather than on that.
  // The gap between them is handed back as leadInSec so the mux delays the
  // audio by exactly that much.
  //
  // Both of these used to be missing. t0 was declared 0 and never assigned, so
  // awaitCue returned immediately on its !t0 guard and every cue was ignored,
  // and leadInSec was always 0. startedAt was never declared at all, and only
  // escaped being a ReferenceError because the falsy t0 short-circuited before
  // reaching it. The whole sync mechanism was dead, which left pace as the only
  // thing aligning the two: the video and the audio ended together while
  // everything in between drifted, so a form got described a few seconds before
  // or after it was on screen.
  // Reassigned to the recording's true start the moment the page exists.
  // Declared here only so awaitCue can close over it.
  //
  // It used to be set at this line and never again, which is before mkdtemp,
  // the browser launch, the context and the page. The video does not start
  // until the page exists, so leadInSec carried the whole browser startup —
  // most of a second, more on a cold container — and the mux delayed the audio
  // by exactly that much. Every word in every render landed late by the time
  // Chromium took to boot, before any beat had a chance to be on time.
  let startedAt = Date.now();
  let t0 = 0;
  // Holds until the narration reaches this segment. Never rushes a beat that
  // is already late, and never waits on a key it has no timing for.
  // Every beat, when its line was due and when the picture actually got there.
  // Guessing at sync from scene detection and freeze detection gave three
  // different answers; this is the only measurement that settles it.
  const beats = [];
  // leadMs starts a beat early. Beats that only draw a box can land exactly on
  // their line; beats that have to load another page cannot, because the
  // loading happens after the cue and pushes everything behind it. Giving those
  // a head start means the page is already there when the line arrives.
  const awaitCue = async (page, key, leadMs = 0, record = true) => {
    if (!cueAt.has(key) || !t0) return;
    const dueMs = cueAt.get(key) * 1000 - leadMs - (Date.now() - t0);
    if (dueMs > 0) await page.waitForTimeout(Math.min(dueMs, 20000));
    if (!record) return;
    const dueAt = Math.round(cueAt.get(key) * 10) / 10;
    const shownAt = Math.round((Date.now() - t0) / 100) / 10;
    beats.push({
      key,
      dueAt,
      shownAt,
      // How far behind its line the picture was, in seconds. The server already
      // reports a worst-drift header off this field and it was never being
      // written, so the number it published was NaN on every render since the
      // header was added.
      lateBy: Math.round((shownAt - dueAt) * 10) / 10,
    });
  };

  const dir = await mkdtemp(path.join(tmpdir(), 'aud-'));
  const browser = await chromium.launch(LAUNCH);
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir, size: { width: 1920, height: 1080 } },
    userAgent: UA,
  });
  const page = await context.newPage();
  // The recording's zero. Playwright starts the video when the page is
  // created, so this is the instant leadInSec and the wall-clock span are
  // measured from.
  startedAt = Date.now();

  try {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Not paced. This is the page settling, not a beat, and multiplying it by
    // pace was most of a ten second silence at the top of the video before
    // anybody said anything.
    await page.waitForTimeout(1600);

    // Installed before anything is filmed and left running for the whole take,
    // so a popup on a timer is closed the moment it opens rather than sitting
    // over the rest of the video.
    await installOverlayWatcher(page);

    // Re-read so the data-aud tags exist on THIS page instance. The findings
    // are not recomputed; they were settled in the probe and the script is
    // already spoken. This only supplies fresh selectors to point at.
    // Falls back to the facts the probe already measured. A throw here would
    // reach the catch and delete the recording; these only supply fresh
    // selectors to point at, so stale ones are far better than no video.
    const facts = await readFacts(page).catch(() => facts0 || {});
    const baseHold = 2400 * pace;
    const { real, opener, clean: nothingMeasured } = spoken(findings);
    // Mirrors narrate.mjs: one of Ary's findings means the site is not clean,
    // so the "Nothing broken worth flagging." card below stays off.
    const ownSaid = (ownFindings || []).filter((o) => String(o?.text || '').trim()).length;
    const clean = nothingMeasured && ownSaid === 0;
    // Whether the cue list is per-segment. When narration is rendered as one
    // clip there is a single cue, and every beat is meant to play back to
    // back on its own hold.
    const perSegmentCues = cueAt.size > 1;

    // The narration starts here. Everything before this is page load, which the
    // lead-in silence covers.
    t0 = Date.now();

    // The opening has to fit in the time the narration spends introducing
    // itself, and it did not. A title card plus a full scroll down the page
    // plus a scroll back took about nine seconds, while the first thing the
    // script actually points at came up at around five. awaitCue can only
    // ever wait, never catch up, so that four second debt was inherited by
    // every beat after it and grew to nine.
    //
    // So the opening is budgeted now rather than fixed: however long there is
    // until the first cued line, that is what the title card and the scroll
    // tour get, split between them. On a script that gets to the point fast it
    // is a quick glance down the page; on a slower one it is the leisurely
    // version it always used to be.
    const firstCue = cueOrder.find((c) => c.key !== 'intro');
    // Eighty percent, not all of it. Smooth scrolling keeps animating after the
    // timeout returns and each overlay sweep costs a few hundred milliseconds,
    // so spending the whole budget on timers overran it every time.
    const openingBudgetMs = firstCue ? Math.max(1400, (firstCue.start * 1000 - 600) * 0.8) : 9000;

    const titleMs = Math.min(2200 * pace, openingBudgetMs * 0.28);
    await note(page, facts.title ? facts.title.slice(0, 70) : target, titleMs);

    const tourMs = Math.max(600, openingBudgetMs - titleMs - 700);
    // How far the page can actually travel, which is its height less the one
    // screenful already showing. The tour used to step through the full height
    // instead, so its last stop was always exactly one viewport past the end
    // and got clamped to the same place as the stop before it. On a tall page
    // that wasted one step out of seven and nobody noticed. On a short one it
    // was most of the tour: zentasticmassage.com.au is 1636px against an 800px
    // window, so two steps meant scrolling to 818 and then to 1636, and 1636
    // clamps to 836. The page jumped almost to the bottom, sat still, and
    // snapped back, which reads as not having scrolled at all.
    const extent = await page.evaluate(
      () => Math.max(0, document.body.scrollHeight - window.innerHeight),
    ).catch(() => 0);
    // Steps come from the distance there is to cover, not the height of the
    // document, for the same reason.
    const steps = Math.min(7, Math.max(2, Math.round(extent / 800)));
    const stepMs = Math.max(220, tourMs / steps);
    if (extent > 40) {
      for (let i = 1; i <= steps; i += 1) {
        // Recomputed per step rather than measured once: sites that load
        // sections as you approach them grow while the tour is running, and a
        // target worked out from the opening height would stop short of a page
        // that has since become twice as long.
        // A JS redirect or meta-refresh during the tour destroys the execution
        // context. Losing the scroll step is nothing; losing the render after
        // the audio is already paid for is what used to happen.
        await page.evaluate(({ n, of }) => {
          const max = Math.max(0, ((document.body && document.body.scrollHeight) || 0) - window.innerHeight);
          window.scrollTo({ top: (max / of) * n, behavior: 'smooth' });
        }, { n: i, of: steps }).catch(() => {});
        await page.waitForTimeout(stepMs);
        // Some appear on scroll depth rather than a timer.
        if (i === 1 || i === Math.ceil(steps / 2)) await dismissOverlays(page);
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    } else {
      // A page with nothing below the fold. Scrolling it would be a no-op that
      // still spent the tour's whole budget, so the time goes back to the beats
      // that follow instead of being burned holding still.
      await dismissOverlays(page);
    }
    await page.waitForTimeout(Math.min(1400 * pace, 700));

    // One approving beat, matching the narration's single opening compliment.
    if (opener) await awaitCue(page, `good:${opener.key}`);
    const openHold = opener ? holdForCue(`good:${opener.key}`, baseHold) : baseHold;
    if (opener?.key === 'cta' && facts.cta) await callout(page, facts.cta.sel, `Main action: "${facts.cta.text}"`, openHold);
    else if (opener?.key === 'form' && facts.form) await callout(page, facts.form.sel, 'Contact form', openHold);
    else if (opener?.key === 'phone' && facts.phone) await callout(page, facts.phone.sel, 'Phone is tappable', openHold);
    else if (opener) await note(page, 'The basics are in place.', openHold);

    // The enquiry path is the story, so it is walked whether or not anything
    // is wrong with it: follow the contact link, show the form someone is
    // being asked to fill in. Doing this only when there was a fault made a
    // clean site's video a title card and one callout.
    let onContactPage = false;
    // Which spoken finding this walk belongs under, if any. The captcha counts
    // too: the broken widget is on the contact page, so that is its line.
    const CONTACT_KEYS = ['captcha-broken', 'contact-page-no-form', 'contact-page-email-only', 'form-on-contact-page', 'long-form'];
    const contactBeatKey = CONTACT_KEYS.find((k) => cueAt.has(k) && real.some((f) => f.key === k));
    let detourDone = false;

    // Deferred when its line comes later than another beat's.
    //
    // The walk used to run here unconditionally, before any finding was
    // performed, and it navigates to another page and back. On amydalecoaching
    // the cta line was due at 9.3s and the walk sat in front of it, so the
    // picture reached the top of the home page at 24.4s: fifteen seconds after
    // the narration said there was no button on it. Measured, not guessed.
    //
    // So it now happens where its own line falls. If a contact finding is
    // spoken, the beat loop calls this immediately before that beat and
    // everything due earlier goes first. If the contact page is only ever a
    // compliment, there is no beat to hang it on and it runs here as before.
    const runContactDetour = async () => {
      if (detourDone) return;
      detourDone = true;
      // Three seconds of head start: a goto, a settle and an overlay sweep.
      // Not recorded in the beat table, because the loop awaits this same cue
      // straight afterwards and two readings for one key is how
      // contact-page-no-form came to appear twice in amydalecoaching's log,
      // once at -3 and once at +2.9, describing the same moment.
      if (contactBeatKey) await awaitCue(page, contactBeatKey, 3000, false);
      // This walk is the longest unbroken stretch of the video and every hold
      // in it was a fixed number, adding up to about eight seconds that no cue
      // knew about. On a site where the walk IS the opening beat, everything
      // after it started ten seconds late and stayed there. Budgeted against
      // the next spoken line now, the same as every other beat.
      // Whatever line comes next from where we are, rather than the line after
      // contactCue. On tranquilmm.com the contact page IS the opening
      // compliment, so it is a `good` finding and never appears in `real`,
      // contactCue came back undefined, and the walk fell back to its old
      // fixed eight seconds. Everything after it was ten seconds late.
      const walkBudget = (() => {
        if (!t0) return 8000;
        const elapsed = Date.now() - t0;
        const next = cueOrder.find((c) => c.start * 1000 > elapsed + 300);
        const want = next ? Math.max(3200, next.start * 1000 - elapsed - 400) : 8000;
        // Bounded by what is left of the narration, for the same reason the
        // holds are. This walk carries the largest floor in the file, 3.2s, and
        // on a script that gets to the point quickly it was claiming time the
        // audio did not have.
        if (Number(targetSeconds) > 0) {
          return Math.max(600, Math.min(want, Number(targetSeconds) * 1000 - elapsed));
        }
        return want;
      })();
      const slice = (fraction, floor) => Math.max(floor, walkBudget * fraction);

      await callout(page, facts.contactPage.sel, `Following "${facts.contactPage.text}"`, slice(0.2, 700));
      // visitPage follows the booking control on the way, so the recording
      // shows the real path a visitor takes rather than a description of it.
      const contact = await visitPage(page, facts.contactPage.href, target, slice(0.2, 700));
      onContactPage = !!contact;
      if (contact?.clicked && !contact.clicked.failed) {
        await note(page, `Following "${contact.clicked.text}" is where that leads:`, slice(0.2, 700));
      }
      if (contact?.hasCalendar) {
        await note(page, 'They can pick a time here, which is the right way round.', slice(0.35, 900));
      } else if (contact?.form) {
        const n = contact.form.fields;
        await callout(page, contact.form.sel, n ? `This is what they fill in: ${n} fields` : 'This is what they fill in', slice(0.35, 900));
      }
    };

    if (facts.contactPage && !facts.form) {
      // Only run it here when no spoken finding will call it. With one, the
      // beat loop runs it in the right place instead, after anything due
      // earlier has had its turn.
      if (!contactBeatKey) await runContactDetour();
    } else if (facts.form) {
      await callout(page, facts.form.sel, 'This is what they fill in', baseHold);
    }

    // The booking path gets its own beat, driven by the finding rather than by
    // whether the home page happens to have a form. It was previously nested
    // in the no-form branch, so a site with a contact form on its home page
    // (which achievewellnesscenters.com has) got the Book Now button boxed and
    // never followed. The probe clicked it and the video did not, so the
    // narration described a page the viewer never saw.
    if (real.some((f) => f.key === 'booking-is-a-form')) {
      await awaitCue(page, 'booking-is-a-form');
      const ctrl = await findBookingControl(page).catch(() => null);
      if (ctrl) {
        await callout(page, ctrl.sel, `Following "${ctrl.text}"`, 2000 * pace);
        try {
          if (ctrl.href) await page.goto(ctrl.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
          else await page.click(ctrl.sel, { timeout: 8000 });
          await page.waitForTimeout(2400 * pace);
          await dismissOverlays(page);
          onContactPage = true;
          const bookingForm = await page.evaluate(() => {
            const vis = (el) => {
              const r = el.getBoundingClientRect();
              const s = getComputedStyle(el);
              return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
            };
            const f = [...document.querySelectorAll('form')].filter(vis)[0];
            if (!f) return null;
            f.setAttribute('data-aud', 'bookform');
            const fields = [...f.querySelectorAll('input,textarea,select')].filter(
              (el) => vis(el) && !['hidden', 'submit', 'button', 'image'].includes((el.type || '').toLowerCase())
            ).length;
            return { sel: '[data-aud="bookform"]', fields };
          });
          if (bookingForm) {
            // Neutral wording. The scare quotes around "booking" contradicted the
            // narration, which now treats a request form as a deliberate way of
            // screening people rather than as a fault.
            await callout(page, bookingForm.sel, `Requests arrive here: ${bookingForm.fields} fields, no calendar`, baseHold);
          } else {
            await note(page, 'No calendar here, just a form to fill in.', baseHold);
          }
        } catch {
          await note(page, 'That link does not lead to a calendar.', baseHold);
        }
      }
    }

    // Back to the landing page. The remaining beats are about the site as a
    // whole, and narrating "on a phone your layout overflows" over a shot of
    // the contact page would be pointing at the wrong thing.
    if (onContactPage) {
      // goBack rather than a fresh goto. The landing page is in the
      // back-forward cache, so this is close to instant where a reload was
      // costing a second or two of dead time that every beat after it
      // inherited. Falls back to a real navigation if there is no history to
      // go back to.
      const back = await page.goBack({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null);
      if (!back) {
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      }
      await page.waitForTimeout(Math.min(900 * pace, 600));
    }

    // Then only what is actually wrong. Nothing here is shown unless the voice
    // is saying it, so the picture and the script cannot disagree.
    // Beats that load another page before they can show anything. Given a head
    // start so the page is already there when the line arrives, rather than the
    // load happening after the cue and pushing everything behind it.
    const NAV_LEAD = {
      'captcha-broken': 4000,
      'booking-is-a-form': 4000,
      'contact-page-no-form': 3500,
      'quote-form-thin': 3500,
      // Needs its head start for the same reason the others do: it may have to
      // come back from a subpage and scroll to the top before the line lands,
      // and without the lead that travel happens after the cue and pushes every
      // beat behind it late.
      cta: 2600,
    };
    // Everything else gets a smaller head start, because arriving a little
    // early is the right way to be wrong. Seeing the thing and then hearing
    // about it reads as pointing; hearing about it and then seeing it is the
    // drift being complained about. There is also unmeasurable work in every
    // beat, the evaluate calls that draw and clear a card, and a lead absorbs
    // it instead of letting it accumulate.
    const DEFAULT_LEAD = 1800;
    // Ary's own findings, in the order she wrote them and before anything
    // measured. She cannot write a CSS selector, so `where` says roughly where
    // to look and the camera goes there: top, middle, bottom, or the contact
    // page. Anything else, or nothing, and the page simply drifts under the
    // line the way it does for a finding with nowhere to point.
    for (let i = 0; i < (ownFindings || []).length; i += 1) {
      const own = ownFindings[i];
      const key = `own-${i}`;
      if (!cueAt.has(key)) continue;
      await awaitCue(page, key, 1200);
      const hold = holdForCue(key, baseHold);
      const where = String(own?.where || '').toLowerCase();
      if (where === 'contact' && facts.contactPage?.href) {
        await visitPage(page, facts.contactPage.href, target, 700);
        onContactPage = true;
      } else if (where === 'top' || where === 'middle' || where === 'bottom') {
        await page.evaluate((w) => {
          const max = Math.max(0, ((document.body && document.body.scrollHeight) || 0) - window.innerHeight);
          const y = w === 'top' ? 0 : w === 'bottom' ? max : Math.round(max / 2);
          window.scrollTo({ top: y, behavior: 'smooth' });
        }, where).catch(() => {});
        await page.waitForTimeout(700);
      }
      // Still when she said where to look, because the frame is then the point.
      // Drifting when she did not, so the page is not frozen under the line.
      await note(page, String(own?.text || '').slice(0, 120), hold, {
        still: where === 'top' || where === 'middle' || where === 'bottom' || where === 'contact',
      });
    }

    for (const f of real) {
      // A beat with no cue was never spoken. Her findings take the three
      // speaking slots first, so with one own finding the third measured one
      // is cut from the script but the camera performed it anyway: scrolling
      // to the footer, or switching to phone width for six silent seconds,
      // under narration that had moved on. The video ended mid-beat.
      if (perSegmentCues && !cueAt.has(f.key)) continue;
      // The walk to the contact page happens here, immediately before the line
      // it belongs to, so beats due earlier are not stuck behind a navigation.
      if (contactBeatKey && f.key === contactBeatKey && facts.contactPage && !facts.form) {
        await runContactDetour();
      }
      await awaitCue(page, f.key, NAV_LEAD[f.key] ?? DEFAULT_LEAD);
      // This finding's own airtime, not a fixed beat.
      const hold = holdForCue(f.key, baseHold);
      switch (f.key) {
        case 'phone-mismatch': {
          // Box the number itself. The claim is about that exact element, so
          // pointing at it is the difference between a statement and proof.
          const sel = await page.evaluate(() => {
            const a = document.querySelector('a[href^="tel:"]');
            if (!a) return null;
            a.setAttribute('data-aud', 'tel');
            return '[data-aud="tel"]';
          }).catch(() => null);
          const [shown, dials] = String(f.detail || '').split('|');
          if (sel) await callout(page, sel, `Shows ${shown}, dials ${dials}`, hold);
          else await note(page, `Shows ${shown}, dials ${dials}`, hold);
          break;
        }
        case 'map-not-loading':
          await note(page, 'The map never loads. Empty box where directions go.', hold);
          break;
        case 'booking-behind-login':
          await note(page, 'Booking asks people to sign in before showing any times.', hold);
          break;
        case 'no-link-preview':
          await note(page, 'Shared in a text, this arrives as a bare link.', hold);
          break;
        case 'calendar-not-loading':
          await note(page, 'The calendar never loads. Empty space where the times go.', hold);
          break;
        case 'lead-magnet-open':
          await note(page, `"${f.detail}" downloads without asking for an email.`, hold);
          break;
        // The one finding whose subject is at the very bottom of the page. It
        // used to fall through to a plain card, so the video said "your footer
        // still says 2019" over the middle of the page and never went near the
        // footer. Scroll to it and put the box on the line: this is a claim the
        // owner can check against their own screen in a second, which is
        // exactly the kind worth showing rather than asserting.
        case 'stale-copyright':
          if (facts.copyrightSel) {
            await callout(page, facts.copyrightSel, `Still says ${f.detail}`, hold);
          } else {
            // No element to point at, but the footer is at the bottom by
            // definition, so at least go there before saying so.
            await page.evaluate(() => {
              const max = Math.max(0, ((document.body && document.body.scrollHeight) || 0) - window.innerHeight);
              window.scrollTo({ top: max, behavior: 'smooth' });
            }).catch(() => {});
            await page.waitForTimeout(600);
            // Still, for the same reason as the CTA line: it has just travelled
            // to the footer, which is the thing being talked about.
            await note(page, `The footer still says ${f.detail}.`, hold, { still: true });
          }
          break;
        case 'ctas-collapse':
          await note(page, `All ${f.detail} buttons go to the same page.`, hold);
          break;
        case 'expired-date':
          await note(page, `Still showing ${f.detail}.`, hold);
          break;
        case 'bad-email':
          await note(page, `${f.detail} can't receive mail.`, hold);
          break;
        case 'two-schedulers':
          await note(page, `Two booking systems are linked: ${f.detail}.`, hold);
          break;
        case 'quote-form-thin':
          await note(page, 'The quote form asks nothing about the job itself.', hold);
          break;
        case 'no-booking':
          await note(page, 'No way to book a time from the site.', hold);
          break;
        case 'long-form':
          await note(page, `${f.detail} fields to fill in before they can send it.`, hold);
          break;
        case 'cta': {
          // This is the one claim tied to a specific shot. It is about the top
          // of the landing page, and it was narrated over whatever the previous
          // beat happened to leave on screen: a subpage the captcha beat had
          // navigated to and never came back from, or the middle of the landing
          // page after the tour scrolled it. Either way the viewer is looking
          // at a perfectly good button while being told there is nothing to
          // click, which reads as the video being wrong about their site.
          //
          // So the camera is put back where the measurement was taken. Instant
          // scroll rather than smooth: this is a cut between beats, not a move
          // the viewer is meant to follow, and a smooth scroll would still be
          // travelling while the line is read.
          if (onContactPage) {
            const back = await page.goBack({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => null);
            if (!back) {
              await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
            }
            await dismissOverlays(page);
            onContactPage = false;
          }
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' })).catch(() => {});
          await page.waitForTimeout(300);
          // Still: the claim is about the top of the page and the camera has
          // just been put there to prove it. Drifting off would narrate the
          // absence of a button over a part of the page nobody measured.
          await note(page, 'Nothing above the fold says what to do next.', hold, { still: true });
          break;
        }
        case 'no-contact':
          await note(page, 'No form, no email link, no contact page.', hold);
          break;
        case 'contact-page-no-form':
          await note(page, 'No form on the contact page.', hold);
          break;
        case 'captcha-broken': {
          // Already awaited above, but this one navigates too, so if we are
          // still on the landing page there is a load to get out of the way.
          
          // Go and film it. Describing a red error box is far weaker than
          // showing one, and this is the finding most likely to get a reply.
          if (f.href) {
            await page.goto(f.href, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
            await page.waitForTimeout(2200 * pace);
            await dismissOverlays(page);
            onContactPage = true;
          }
          const box = await page
            .evaluate(() => {
              const frame = document.querySelector('iframe[src*="recaptcha"]');
              const host = frame ? frame.closest('div') || frame : null;
              if (!host) return null;
              host.setAttribute('data-aud', 'captcha');
              return '[data-aud="captcha"]';
            })
            .catch(() => null);
          if (box) await callout(page, box, 'Nobody can send this form', hold);
          else await note(page, 'The spam check on this form is erroring, so it cannot be sent.', hold);
          break;
        }
        case 'insecure':
          await note(page, 'Served over http, so browsers mark it "Not secure".', hold);
          break;
        case 'mixed-content':
          await note(page, 'Some assets load over http, which breaks the padlock.', hold);
          break;
        case 'mobile-overflow':
          // Show it rather than assert it. Sideways scroll on a phone is
          // obvious on camera and impossible to argue with.
          await note(page, 'This is what it does at phone width:', 1600 * pace);
          await page.setViewportSize({ width: 390, height: 844 }).catch(() => {});
          await page.waitForTimeout(1600 * pace);
          await note(page, `Content runs about ${f.detail}px past the screen, so it scrolls sideways.`, hold);
          await page.setViewportSize({ width: 1920, height: 1080 }).catch(() => {});
          await page.waitForTimeout(600 * pace);
          break;
        case 'viewport':
          await note(page, 'No mobile viewport tag, so it will not scale on a phone.', hold);
          break;
        // Both of these are shown, not asserted. A gap where a picture should
        // be is obvious on camera and impossible to argue with, and this was
        // narrated over whatever the last beat left on screen — describing a
        // blank box without ever going to look at one.
        case 'broken-images': {
          const shown = facts.brokenImageSel
            ? await callout(page, facts.brokenImageSel, `${f.detail} images are failing to load`, hold)
            : false;
          if (!shown) await note(page, `${f.detail} images are failing to load.`, hold);
          break;
        }
        case 'dead-image-host': {
          const [count, host] = String(f.detail || '').split('|');
          const shown = facts.brokenImageSel
            ? await callout(page, facts.brokenImageSel, `Loaded from ${host}, which is not answering`, hold)
            : false;
          if (!shown) await note(page, `${count} images load from ${host}, which is not answering.`, hold);
          break;
        }
        case 'no-title':
          await note(page, 'The page has no title, so search results and tabs show the URL.', hold);
          break;
        // Boxed on screen when the filler is on the page being filmed: the
        // whole point of this finding is that it is visibly there, so the
        // camera goes and points at it. Found on a subpage, it falls through
        // to the card, which names the page instead.
        case 'placeholder-text': {
          const [snippet, wherePage] = String(f.detail || '').split('|');
          let sel = null;
          if (!wherePage && snippet) {
            sel = await page.evaluate((sn) => {
              const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
              let node;
              while ((node = walker.nextNode())) {
                if (!(node.nodeValue || '').includes(sn)) continue;
                const el = node.parentElement;
                if (!el) continue;
                const s = getComputedStyle(el);
                if (s.display === 'none' || s.visibility === 'hidden') continue;
                const r = el.getBoundingClientRect();
                if (r.width < 5 || r.height < 5) continue;
                el.setAttribute('data-aud', 'filler');
                return '[data-aud="filler"]';
              }
              return null;
            }, snippet).catch(() => null);
          }
          if (sel) await callout(page, sel, `Template text: "${snippet}"`, hold);
          else {
            const card = SILENT_BEAT['placeholder-text'];
            await note(page, card(f.detail), hold);
          }
          break;
        }
        // Everything the narration says but has nothing on the page to point
        // at. Without this the video sat on a still frame through those lines,
        // which is the literal form of talking about something and not showing
        // it: nine of the twenty three spoken findings had no beat, so a site
        // whose faults happened to be in that nine got fifty seconds of a
        // motionless page while the audio kept going.
        //
        // A card is a weak beat and deliberately so. Boxing an element that
        // does not exist is not possible, and inventing something to point at
        // would be worse than saying it plainly on screen.
        default: {
          const card = SILENT_BEAT[f.key];
          if (card) await note(page, typeof card === 'function' ? card(f.detail) : card, hold);
          break;
        }
      }
    }

    if (clean) {
      await awaitCue(page, 'clean');
      // Its own hold. `hold` belongs to the beat loop above and does not exist
      // out here, and this block only runs on a site with nothing wrong with
      // it, so the ReferenceError sat unnoticed until insightsminneapolis.com
      // came back clean and lost a finished render to it.
      await note(page, 'Nothing broken worth flagging.', holdForCue('clean', baseHold));
    }

    // The last three spoken segments are the sign-off, and none of them points
    // at anything on the page, so the walkthrough used to simply stop and the
    // mux froze the final frame for as long as they took. On a site with few
    // findings that was twenty seconds of a still image, which reads as a
    // broken recording rather than a deliberate ending.
    //
    // Instead: wait for each of them and drift slowly back up the page. It is
    // their site still moving under a line about what else we do, which is a
    // gentler place to end than a frozen screenshot.
    // Absolute positions, not scrollBy. The previous version scrolled up by a
    // fixed amount, and the walkthrough leaves the page at the top, so every
    // one of these was a no-op and the frame stayed frozen for the entire
    // sign-off: freezedetect measured 26 seconds of stillness to the end.
    // One scroll per segment left the page still between them: a jump, then
    // fifteen seconds of nothing until the next cue. Drift instead, a small
    // step every few hundred milliseconds, so the page is always moving under
    // the sign-off. Slow enough to read, which is the point of ending on their
    // own site rather than on a card.
    // Every segment that can appear after the last finding. question-one and
    // thread were added to the script and not here, so a video that closed on
    // the singular question had its last cue read as `offers`: the drift stopped
    // while the final line was still being spoken, and the picture froze on the
    // end of it. Anything missing from this list ends the walkthrough early.
    // Hand-kept mirror of the closing keys in narrate.mjs. 'offers-site' was
    // missing, so a video whose findings were all site faults ended the
    // walkthrough with eleven seconds of narration still playing over a
    // frozen frame.
    const closing = ['thread', 'hatch', 'ghl', 'clean', 'outro', 'offers', 'offers-site', 'question', 'question-one', 'question-booking', 'question-mind'].filter((k) => cueAt.has(k));
    if (closing.length) {
      const lastCue = Math.max(...closing.map((k) => cueAt.get(k)));
      // Run until the narration actually ends, which is a number we already
      // have: targetSeconds is the measured length of the finished audio, and
      // t0 is the instant it starts.
      //
      // It used to be worked out from the last cue instead, and a cue is when a
      // line BEGINS. Two seconds past the start of a four second sign-off ends
      // the walkthrough while she is still talking, and every line added to the
      // script since made that guess worse. The mux pads whichever track is
      // shorter, so the error never showed up as a crash, only as a video that
      // froze early or ran on into silence.
      const audioEndsMs = Number(targetSeconds) > 0 ? Number(targetSeconds) * 1000 : (lastCue + 2) * 1000;
      const untilMs = audioEndsMs + 400;
      // The sign-off travels to the bottom of the page and ends there.
      //
      // It used to sweep down and back over a span capped at 2600px, which on
      // centreforlifetherapies.com meant a 6175px page was toured to about a
      // third and the footer at 6870 was never on screen at any point in the
      // video. Whether the footer gets seen was also left to chance in the
      // other direction: the beat that scrolls to it only runs when the stale
      // year is one of the three problems spoken, and on a site with three
      // worse problems it is cut, so the page below the halfway mark was simply
      // never shown.
      //
      // Ending at the bottom fixes both without depending on the findings. The
      // whole page gets seen in every video, the last thing on screen is their
      // footer rather than a frame frozen wherever the previous beat stopped,
      // and there is no cap to outgrow.
      //
      // Recomputed each step: a page that loads sections on approach grows
      // while this is running, and a target fixed at the start would stop short
      // of a footer that has since moved down.
      const STEP_MS = 260;
      const startY = await page.evaluate(() => window.scrollY).catch(() => 0);
      let travelled = 0;
      while (t0 && Date.now() - t0 < untilMs) {
        const phase = Math.min(1, (Date.now() - t0) / untilMs);
        // Eased rather than linear, so it sets off gently and settles onto the
        // footer instead of arriving at full speed and stopping dead.
        const eased = 0.5 - Math.cos(phase * Math.PI) / 2;
        await page.evaluate(({ from, t }) => {
          const max = Math.max(0, ((document.body && document.body.scrollHeight) || 0) - window.innerHeight);
          window.scrollTo({ top: Math.round(from + (max - from) * t), behavior: 'smooth' });
        }, { from: startY, t: eased }).catch(() => {});
        await page.waitForTimeout(STEP_MS);
        travelled += 1;
        if (travelled > 400) break; // never spin forever on a stuck clock
      }
      // Settle on the bottom rather than snapping back to the top. Returning
      // there threw away the travel this drift just did and ended the video on
      // the same hero image it opened with, which is the one frame the viewer
      // has already had a good look at.
      await page.evaluate(() => {
        const max = Math.max(0, ((document.body && document.body.scrollHeight) || 0) - window.innerHeight);
        window.scrollTo({ top: max, behavior: 'smooth' });
      }).catch(() => {});
      await page.waitForTimeout(350 * pace);
    }

    // Both of these used to be about a second each, and they sit after the
    // narration has already finished. With the mux adding its own 1.2s tail on
    // top, the video held for over three seconds on a page nobody was talking
    // about. Enough to let the last scroll settle, and no more.
    await page.waitForTimeout(350 * pace);
    // Ask Playwright which file belongs to this page rather than scanning the
    // directory for a .webm. The scan picked whatever was there, so a leftover
    // recording of a different site could come back labelled as this one.
    const videoPath = await page.video().path();
    // How long the recording actually ran on the wall clock, page creation to
    // close. The webm's own duration is not this number: Playwright stamps
    // frames with a clock that runs slow, so a 71 second take can come back
    // labelled 80. Every cue was measured against the wall, so the mux uses
    // this to squeeze the file's timeline back onto it — without that, a beat
    // that landed on its line still plays seconds late by the middle of the
    // video, and the beat table swears nothing is wrong.
    const recWallSec = (Date.now() - startedAt) / 1000;
    // Closing is not part of the take. A throw here used to land in the catch
    // below, which deletes the directory, so a completed recording could be
    // destroyed by the browser being awkward on the way out.
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    return {
      videoPath,
      dir,
      pace,
      recWallSec,
      leadInSec: t0 ? (t0 - startedAt) / 1000 : 0,
      // How long the walkthrough itself ran, measured from the first spoken
      // word rather than from the start of the recording. Compared against the
      // narration's own length this says whether the pictures outlasted the
      // words, which the total video length cannot: that also carries the page
      // load before anybody speaks.
      walkSec: t0 ? (Date.now() - t0) / 1000 : 0,
      beats: beats.map((b) => ({ ...b, lateBy: Math.round((b.shownAt - b.dueAt) * 10) / 10 })),
    };
  } catch (e) {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

// ── Evidence screenshots ─────────────────────────────────────────────────
//
// A picture of what a visitor sees, which is the one thing this service could
// not previously produce. Everything else here measures: it reads the DOM after
// the scripts have run and reports geometry. That is a good place to look and
// it is not proof of what was seen — findings.mjs records the bill for
// confusing the two, three videos telling owners there was nothing above the
// fold to click while a Book button sat on screen.
//
// Deliberately narrow. This does not crawl, does not decide what is wrong, and
// does not click anything. It opens a page, waits a bounded time, and takes a
// photograph.
//
// Overlays are NOT swept before capture, unlike the video path. A popup that
// covers the page is exactly what a visitor gets, so dismissing it first would
// photograph a page nobody sees. If one appears naturally it is in the frame
// and recorded; if it does not, nothing invents one.

// Long enough for hydration and for an embedded booking widget to draw itself,
// short enough that a third-party script which never resolves cannot hold the
// request open. The video path uses 2000ms + a 400ms settle for the same job.
const SHOT_SETTLE_MS = 2600;
const SHOT_NAV_TIMEOUT_MS = 30000;

const BLOCKED_TITLE =
  /^(forbidden|access denied|not found|error|attention required|just a moment|site not found|404|403|502|503|blocked|checking your browser)/i;

async function shootOne(context, url, viewport) {
  const page = await context.newPage();
  const capturedAt = new Date().toISOString();
  try {
    const resp = await page.goto(url, { waitUntil: 'load', timeout: SHOT_NAV_TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SHOT_SETTLE_MS);

    const status = resp ? resp.status() : null;
    const seen = await page.evaluate(() => {
      const vis = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
      };
      // Did something naturally cover the page? Recorded, never dismissed.
      const overlay = [...document.querySelectorAll('div,section,aside,dialog,[role="dialog"]')].some((el) => {
        if (!vis(el)) return false;
        const s = getComputedStyle(el);
        if (s.position !== 'fixed' && s.position !== 'sticky') return false;
        const r = el.getBoundingClientRect();
        return r.width * r.height > window.innerWidth * window.innerHeight * 0.25;
      });
      return {
        title: (document.title || '').trim().slice(0, 160),
        textLength: (document.body?.innerText || '').trim().length,
        links: document.querySelectorAll('a[href]').length,
        overlay,
      };
    }).catch(() => ({ title: '', textLength: 0, links: 0, overlay: false }));

    // The same three signals the probe uses: a refusing status, a title that
    // announces a wall, or a page with nothing on it. A page nobody could see
    // cannot support a claim about how it looks, so this is recorded on the
    // artifact rather than thrown away.
    const blocked = Boolean(
      (status && status >= 400)
      || BLOCKED_TITLE.test(seen.title)
      || (seen.textLength < 120 && seen.links < 3)
    );

    // The first viewport only. A full-page capture of a long marketing site is
    // a picture of something no visitor ever sees at once, and the claims this
    // supports — buried, competing, below the fold — are all about what is on
    // screen before anybody scrolls.
    const png = await page.screenshot({ fullPage: false, type: 'png' }).catch(() => null);

    return {
      url,
      viewport,
      capturedAt,
      status,
      blocked,
      overlay: seen.overlay,
      title: seen.title,
      png,
      error: png ? null : 'the screenshot could not be taken',
    };
  } finally {
    await page.close().catch(() => {});
  }
}

// Photograph the given pages at the given viewports.
//
// `pages` is decided by the caller, not here. Screenshotting a whole site is
// how visual verification turns into an uncontrolled cost, so the choice of
// what is worth a picture belongs with whoever knows which claim needs proving.
export async function screenshots(urls = [], { viewports = ['desktop', 'mobile'] } = {}) {
  const targets = [...new Set(urls.filter(Boolean))].slice(0, 4);
  if (!targets.length) return [];

  const browser = await chromium.launch(LAUNCH);
  const out = [];
  try {
    if (viewports.includes('desktop')) {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, userAgent: UA });
      try {
        for (const url of targets) out.push(await shootOne(ctx, url, 'desktop'));
      } finally {
        await ctx.close().catch(() => {});
      }
    }
    if (viewports.includes('mobile')) {
      // A real device context, not a resized desktop one. Wix and friends serve
      // a different layout by user agent, so a desktop UA at 390px reports a
      // phone problem that no phone has.
      const ctx = await browser.newContext(IPHONE);
      try {
        for (const url of targets) out.push(await shootOne(ctx, url, 'mobile'));
      } finally {
        await ctx.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return out;
}
