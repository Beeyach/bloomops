// Records a walkthrough video of a prospect's site, pausing on things worth
// talking about, so the capture is done before you ever hit record.
//
//   node record.mjs https://theirsite.com
//
// Output (in ./out): a .webm walkthrough and a findings.json.
// The intended workflow is the hybrid one: play the video back and record
// yourself talking over it. Your voice is the part that converts; this only
// removes the tedious scrolling-and-pointing.
//
// Deliberately standalone — its own package.json, nothing added to the app's
// dependencies, so the Cloudflare build is untouched.
//
// Every finding here is read off the LIVE rendered DOM. Nothing is asserted
// that was not actually checked, because "you have no contact form" is a bad
// thing to be wrong about in a cold email.

import { chromium } from 'playwright';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node record.mjs https://theirsite.com');
  process.exit(1);
}
const target = url.startsWith('http') ? url : `https://${url}`;
const outDir = path.join(process.cwd(), 'out');

// Draws a labelled outline over an element and holds so it reads on camera.
async function callout(page, selector, text, holdMs = 2200) {
  const ok = await page.evaluate(
    ({ selector, text }) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const r = el.getBoundingClientRect();
      const box = document.createElement('div');
      box.className = '__aud';
      box.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;border:3px solid #E5457F;border-radius:10px;box-shadow:0 0 0 9999px rgba(0,0,0,.42);z-index:2147483647;pointer-events:none;transition:opacity .25s`;
      const tag = document.createElement('div');
      tag.className = '__aud';
      tag.textContent = text;
      tag.style.cssText = `position:fixed;left:${r.left - 6}px;top:${Math.max(8, r.top - 44)}px;background:#E5457F;color:#fff;font:600 15px/1.3 system-ui,sans-serif;padding:7px 12px;border-radius:8px;z-index:2147483647;pointer-events:none;max-width:520px`;
      document.body.append(box, tag);
      return true;
    },
    { selector, text }
  );
  if (ok) {
    await page.waitForTimeout(holdMs);
    await page.evaluate(() => document.querySelectorAll('.__aud').forEach((n) => n.remove()));
  }
  return ok;
}

// A full-frame note, for findings that are about an absence (nothing to box).
async function note(page, text, holdMs = 2400) {
  await page.evaluate((text) => {
    const d = document.createElement('div');
    d.className = '__aud';
    d.textContent = text;
    d.style.cssText = `position:fixed;inset:auto 0 44px 0;margin:0 auto;width:max-content;max-width:80%;background:#E5457F;color:#fff;font:600 17px/1.4 system-ui,sans-serif;padding:12px 20px;border-radius:12px;z-index:2147483647;pointer-events:none;box-shadow:0 10px 30px rgba(0,0,0,.4)`;
    document.body.append(d);
  }, text);
  await page.waitForTimeout(holdMs);
  await page.evaluate(() => document.querySelectorAll('.__aud').forEach((n) => n.remove()));
}

(async () => {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  console.log(`Loading ${target} …`);
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500); // let the hero settle and fonts swap

  // ── Read the facts off the live page ───────────────────────────────────
  const facts = await page.evaluate(() => {
    const vis = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const tel = [...document.querySelectorAll('a[href^="tel:"]')].filter(vis);
    const mail = [...document.querySelectorAll('a[href^="mailto:"]')].filter(vis);
    const forms = [...document.querySelectorAll('form')].filter(vis);
    const foldH = window.innerHeight;
    // A CTA above the fold: a link/button in the first screen whose text reads
    // like an action rather than navigation.
    // Word-boundaried on purpose. A bare substring match called the nav link
    // "Playbook" a call to action because it contains "book" — the video would
    // then box a nav item and announce it as the main action.
    const ctaWords =
      /\b(book|booking|call|quote|contact|get\s+started|schedule|enquire|enquiry|inquire|inquiry|request|buy|shop|order|get\s+a\s+quote|free\s+quote)\b/i;
    const cta = [...document.querySelectorAll('a,button')].filter(
      (el) => vis(el) && el.getBoundingClientRect().top < foldH && ctaWords.test(el.textContent || '')
    );
    // Tag the exact element we found and select by that tag. Deriving a
    // selector from tag/class was unsafe: an element with no id or class
    // collapsed to "a", so the callout would box the first link on the page
    // instead of the thing actually found — pointing confidently at the wrong
    // element in a video someone sends a client.
    const mark = (el, name) => {
      if (!el) return null;
      el.setAttribute('data-aud', name);
      return `[data-aud="${name}"]`;
    };
    // Icon fonts and markup put glyphs and newlines inside the label.
    const clean = (el) => (el.textContent || '').replace(/\s+/g, ' ').replace(/^[^\w+(]+/, '').trim();

    // "No tel: link" does not establish that a phone number is displayed, and
    // "no form on this page" does not establish there is no way to get in
    // touch. Reporting either as such states something the visitor can
    // disprove by looking at the page you are describing.
    const phoneInText = ((document.body.innerText || '').match(/\+?\d[\d\s().-]{6,}\d/g) || [])
      .map((s) => s.trim())
      .find((s) => {
        const digits = s.replace(/\D/g, '');
        return digits.length >= 7 && digits.length <= 15;
      }) || null;
    const contactPage = [...document.querySelectorAll('a[href]')]
      .filter(vis)
      .find(
        (a) =>
          /\b(contact|get in touch|reach us|enquiries|inquiries)\b/i.test(a.textContent || '') ||
          /\/(contact|get-in-touch|enquir|inquir)/i.test(a.getAttribute('href') || '')
      );

    return {
      title: document.title || '',
      hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
      phone: tel.length ? { text: clean(tel[0]), sel: mark(tel[0], 'phone') } : null,
      phoneInText,
      email: mail.length ? { text: clean(mail[0]), sel: mark(mail[0], 'email') } : null,
      form: forms.length ? { sel: mark(forms[0], 'form') } : null,
      contactPage: contactPage ? { text: clean(contactPage).slice(0, 40), sel: mark(contactPage, 'contactpage') } : null,
      cta: cta.length ? { text: clean(cta[0]).slice(0, 60), sel: mark(cta[0], 'cta') } : null,
      pageHeight: document.body.scrollHeight,
    };
  });

  // ── Walk the page, pausing so it reads on camera ───────────────────────
  await note(page, facts.title ? facts.title.slice(0, 70) : target, 2000);

  const steps = Math.min(7, Math.max(3, Math.round(facts.pageHeight / 800)));
  for (let i = 1; i <= steps; i += 1) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), (facts.pageHeight / steps) * i);
    await page.waitForTimeout(1500);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1400);

  // ── Call out what was actually found (or actually absent) ──────────────
  const findings = [];
  if (facts.cta) {
    await callout(page, facts.cta.sel, `Main action above the fold: "${facts.cta.text}"`);
    findings.push({ ok: true, item: 'CTA above the fold', detail: facts.cta.text });
  } else {
    await note(page, 'Nothing above the fold tells a visitor what to do next.');
    findings.push({ ok: false, item: 'No CTA above the fold' });
  }

  if (facts.phone) {
    await callout(page, facts.phone.sel, 'Phone is tappable');
    findings.push({ ok: true, item: 'Tappable phone', detail: facts.phone.text });
  } else if (facts.phoneInText) {
    await note(page, `Phone "${facts.phoneInText}" is plain text — a phone visitor cannot tap to call.`);
    findings.push({ ok: false, item: 'Phone shown but not tappable', detail: facts.phoneInText });
  } else {
    await note(page, 'No phone number on this page.');
    findings.push({ ok: false, item: 'No phone number on the page' });
  }

  if (facts.form) {
    await callout(page, facts.form.sel, 'Contact form is here');
    findings.push({ ok: true, item: 'Contact form present' });
  } else if (facts.email) {
    await callout(page, facts.email.sel, 'Email link, but no form');
    findings.push({ ok: false, item: 'No form, email only', detail: facts.email.text });
  } else if (facts.contactPage) {
    await callout(page, facts.contactPage.sel, 'Contact is a separate page, no form here');
    findings.push({ ok: false, item: 'No form on this page, contact is a click away', detail: facts.contactPage.text });
  } else {
    await note(page, 'No form, no email link, and no contact page.');
    findings.push({ ok: false, item: 'No form, email link, or contact page' });
  }

  if (!facts.hasViewportMeta) {
    await note(page, 'No mobile viewport tag, so this will not scale properly on a phone.');
    findings.push({ ok: false, item: 'Missing viewport meta' });
  }

  await page.waitForTimeout(900);
  // Ask Playwright for THIS page's video path before closing. Scanning the
  // directory for a .webm was wrong: on a second run it matched a video left
  // from a previous site and renamed that one, so the file was labelled with a
  // prospect whose site it did not show. The findings were right and the video
  // was somebody else's — the worst possible way to be wrong.
  const videoPath = await page.video().path();
  await context.close(); // finalises the video file
  await browser.close();

  const host = new URL(target).hostname.replace(/^www\./, '').replace(/\./g, '-');
  const videoName = `${host}.webm`;
  await rename(videoPath, path.join(outDir, videoName));
  await writeFile(
    path.join(outDir, `${host}.findings.json`),
    JSON.stringify({ url: target, checkedAt: new Date().toISOString(), facts, findings }, null, 2)
  );

  console.log(`\nVideo:    out/${videoName}`);
  console.log(`Findings: out/${host}.findings.json`);
  console.log(`\n${findings.length} checks:`);
  findings.forEach((f) => console.log(`  ${f.ok ? '✓' : '✗'} ${f.item}${f.detail ? ` — ${f.detail}` : ''}`));
})().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
