'use client';

import { useEffect, useState } from 'react';
import { buildSkills } from '../lib/skill-templates.mjs';
import { makeZip } from '../lib/zip.mjs';
import InfoTip from './InfoTip';
import { IconTile } from './Icons';

// Personalized skill downloads. The user fills in their brand, who they
// help, their app URL, and an optional Google Sheet. Each skill is built
// from those inputs and packed into a real .skill (a zip) in the browser.
// No server, no copy-paste, and the file already knows their details.

function downloadSkill(skill) {
  const zip = makeZip([{ name: `${skill.folder}/SKILL.md`, data: skill.md }]);
  const blob = new Blob([zip], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${skill.filename}.skill`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Cute per-skill icons, Lucide-style strokes on the rose tile. Inline so
// there's no icon-library dependency; currentColor picks up the tile text.
function SkillIcon({ id }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    // Lead sweep — magnifier with a little sparkle
    sweep: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5 L20.5 20.5" />
        <path d="M9 8 l.9 1.6 L11.5 10.5 l-1.6.9 L9 13 l-.9-1.6 L6.5 10.5 l1.6-.9 Z" strokeWidth="1.4" />
      </>
    ),
    // Lead prescreen — shield with a check
    prescreen: (
      <>
        <path d="M12 3.5 L19 6 v5.5 c0 4.4 -3 7.5 -7 9 c-4 -1.5 -7 -4.6 -7 -9 V6 Z" />
        <path d="M9 11.5 l2 2 l4 -4" />
      </>
    ),
    // DM follow-up sweep — chat bubble with a heart
    followup: (
      <>
        <path d="M4 6.5 a2.5 2.5 0 0 1 2.5 -2.5 h11 a2.5 2.5 0 0 1 2.5 2.5 v7 a2.5 2.5 0 0 1 -2.5 2.5 H10 l-4.5 4 v-4 H6.5 A2.5 2.5 0 0 1 4 13.5 Z" />
        <path d="M12 12.6 c-1.8 -1.1 -2.7 -2.4 -2 -3.4 c.6 -.8 1.7 -.5 2 .2 c.3 -.7 1.4 -1 2 -.2 c.7 1 -.2 2.3 -2 3.4 Z" strokeWidth="1.4" />
      </>
    ),
    // Social prospect engine — megaphone with sparkle
    'social-prospect': (
      <>
        <path d="M4 10 v4 a1.5 1.5 0 0 0 1.5 1.5 H8 l7 4 V4.5 l-7 4 H5.5 A1.5 1.5 0 0 0 4 10 Z" />
        <path d="M18.5 6.5 l.7 1.3 l1.3.7 l-1.3.7 l-.7 1.3 l-.7 -1.3 l-1.3 -.7 l1.3 -.7 Z" strokeWidth="1.4" />
        <path d="M8 15.5 v3.5" />
      </>
    ),
    // Email follow-up sweep — paper plane
    'email-followup': (
      <>
        <path d="M21 3.5 L3.5 10.5 l6.5 2.5 L12.5 19.5 Z" />
        <path d="M10 13 L21 3.5" />
      </>
    ),
    // Website prospect engine — globe
    'website-prospect': (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M3.5 12 h17" />
        <path d="M12 3.5 c2.6 2.3 3.9 5.2 3.9 8.5 s-1.3 6.2 -3.9 8.5 c-2.6 -2.3 -3.9 -5.2 -3.9 -8.5 s1.3 -6.2 3.9 -8.5 Z" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true" {...common}>
      {paths[id] || <circle cx="12" cy="12" r="8.5" />}
    </svg>
  );
}

export default function SkillStudio() {
  const [profile, setProfile] = useState({ brand: '', who: '', appUrl: '', sheetUrl: '', senderEmail: '', countries: '' });
  const [loaded, setLoaded] = useState(false);

  // Prefill from what the app already knows, so the fields start useful.
  useEffect(() => {
    let alive = true;
    (async () => {
      let brand = '';
      try { brand = localStorage.getItem('ltb_name') || ''; } catch {}
      let who = '';
      try {
        const s = (await (await fetch('/api/settings')).json()).settings || {};
        who = s.positioning || s.offer || '';
      } catch {}
      if (!alive) return;
      setProfile((p) => ({
        ...p,
        brand: p.brand || brand,
        who: p.who || who,
        appUrl: p.appUrl || (typeof window !== 'undefined' ? window.location.origin : ''),
      }));
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, []);

  const skills = buildSkills(profile);
  function set(k, v) { setProfile((p) => ({ ...p, [k]: v })); }

  const field = 'w-full bg-input border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-rose';
  const label = 'block text-[12px] font-medium text-ink-2 mb-1';

  return (
    <div className="canvas-work mb-6">
      <div className="glass-panel p-4">
        <div className="flex items-center gap-2.5 mb-1">
          <IconTile name="inbox-in" tone="violet" size={28} radius={8} />
          <div className="font-semibold text-bright">
            Download your skills
            <InfoTip title="What is a .skill file?">
              A .skill file is a set of instructions Claude can follow, like a runbook you hand an employee. You upload it once in Claude (works in Cowork and Claude Code), then trigger it by name or put it on a daily schedule. These three are pre-written for this app, and the fields below bake your own details into them before download.
            </InfoTip>
          </div>
        </div>
        <p className="text-[13px] text-ink-3 mb-4">
          Fill these in once. Each skill file is built with your details already inside, so you install it and it just works. Your app URL is what an agent opens to read and write your leads.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 mb-4">
          <div>
            <label className={label}>Your brand or name</label>
            <input value={profile.brand} onChange={(e) => set('brand', e.target.value)} placeholder="e.g. Bloomwired" className={field} />
          </div>
          <div>
            <label className={label}>App URL (what the agent opens)</label>
            <input value={profile.appUrl} onChange={(e) => set('appUrl', e.target.value)} placeholder="https://leadsthatbloom.com" className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Who you help, in one line</label>
            <input value={profile.who} onChange={(e) => set('who', e.target.value)} placeholder="e.g. spa and clinic owners who never post" className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Google Sheet link (optional)</label>
            <input value={profile.sheetUrl} onChange={(e) => set('sheetUrl', e.target.value)} placeholder="Paste a sheet link if you keep raw leads there" className={field} />
          </div>
          <div>
            <label className={label}>Sending Gmail (for the email-lane skills)</label>
            <input value={profile.senderEmail} onChange={(e) => set('senderEmail', e.target.value)} placeholder="e.g. hello@yourbrand.com" className={field} />
          </div>
          <div>
            <label className={label}>
              Follow-up countries (optional)
              <InfoTip title="Why filter by country?">
                Timezone batching. If you leave this blank, the email follow-up sweep processes every due prospect. Type country codes like AU,NZ and the sweep only touches those. So you can schedule one run per timezone group and every email lands at their morning inbox time, not the middle of their night.
              </InfoTip>
            </label>
            <input value={profile.countries} onChange={(e) => set('countries', e.target.value)} placeholder="Blank = all · e.g. AU,NZ" className={field} />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {skills.map((s) => (
            <div key={s.id} className="border border-line rounded-[12px] p-3 bg-hover-wash-soft flex flex-col">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-8 h-8 shrink-0 rounded-[8px] bg-rose-tint border border-rose-line text-rose-text flex items-center justify-center">
                  <SkillIcon id={s.id} />
                </span>
                <div className="font-medium text-ink text-[13px]">{s.name}</div>
              </div>
              <p className="text-[12px] text-ink-3 leading-snug flex-1 mb-2">{s.blurb}</p>
              <button
                onClick={() => downloadSkill(s)}
                className="text-[13px] font-medium px-3 py-1.5 rounded-[8px] btn-bloom transition"
              >
                Download .skill
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={() => skills.forEach((s, i) => setTimeout(() => downloadSkill(s), i * 250))}
          className="mt-3 text-[13px] font-medium px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition"
        >
          Download all {skills.length}
        </button>
        {!loaded && <span className="ml-2 text-[12px] text-ink-3">Loading your details…</span>}

        <div className="mt-4 pt-4 border-t border-line">
          <div className="font-medium text-ink text-[13px] mb-3">Install and run, step by step</div>
          <ol className="space-y-4 list-none">
            {[
              ['Download', 'Grab a skill above. It lands in your Downloads folder as a .skill file.'],
              ['Install in Claude', 'Open Claude (desktop app or claude.ai) → Settings → Capabilities or Skills → upload the file.', 'skills-upload'],
              ['Test it once', 'Start a chat and type the trigger, like "run the lead sweep". The skill takes over and reports back.'],
              ['Put it on a schedule', 'In Cowork, create a scheduled task, pick a daily time, and tell it to run that skill. Morning runs mean the inbox is stocked before you sit down.', 'cowork-schedule'],
            ].map(([title, text, shot], i) => (
              <li key={title} className="flex gap-2.5">
                <span className="w-[20px] h-[20px] shrink-0 rounded-full bg-rose-tint text-rose-text text-[11px] font-semibold flex items-center justify-center mt-px">{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-ink text-[13px]">{title}</span>
                  <span className="block text-[13px] text-ink-2 leading-snug mt-0.5">{text}</span>
                  {shot && (
                    <img
                      src={`/guide/${shot}.png`}
                      alt={shot === 'skills-upload' ? 'Where skills live in Claude settings' : 'Setting up a daily schedule in Cowork'}
                      loading="lazy"
                      className="block mt-2.5 w-full max-w-[680px] rounded-[12px] border border-line shadow-card"
                    />
                  )}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-[12px] text-ink-3 mt-3">
            You need a Claude Pro or Max plan for Cowork schedules. Running a skill by hand in a chat works on any paid plan.
          </p>
        </div>
      </div>
    </div>
  );
}
