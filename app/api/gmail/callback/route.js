import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { exchangeCode, profile, startWatch } from '@/lib/gmail.mjs';
import { saveConnection, getAccount, recordWatch, accessTokenFor } from '@/lib/gmail-store.mjs';
import { readState, redirectUri } from '../connect/route';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Where Google sends the person back.
//
// Deliberately does the whole setup here rather than leaving a half-connected
// mailbox for a cron to finish: exchange the code, learn which address they
// actually consented with, store it, and start the watch. A connection that is
// authorised but not watching looks connected and silently receives nothing,
// which is the worst of the possible states.

function env() {
  try { const { env: e } = getRequestContext(); if (e) return e; } catch {}
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

const page = (title, body, tone = 'ok') => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
   <title>${title}</title>
   <style>
     :root{color-scheme:light dark}
     body{font:16px/1.6 system-ui,sans-serif;max-width:32rem;margin:12vh auto;padding:0 1.5rem}
     h1{font-size:1.4rem;margin:0 0 .5rem}
     p{margin:.5rem 0;opacity:.85}
     .tone{display:inline-block;width:.6rem;height:.6rem;border-radius:50%;margin-right:.5rem;
           background:${tone === 'ok' ? '#1E9A66' : '#C25680'}}
     a{color:inherit}
   </style>
   <h1><span class="tone"></span>${title}</h1>${body}
   <p><a href="/">Back to Leads That Bloom</a></p>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
);

export async function GET(req) {
  const url = new URL(req.url);
  const e = env();

  const denied = url.searchParams.get('error');
  if (denied) {
    return page('Gmail was not connected', `<p>Google said: ${denied}. Nothing changed, and you can try again whenever.</p>`, 'bad');
  }

  const code = url.searchParams.get('code');
  const state = await readState(e.LTB_SESSION_SECRET, url.searchParams.get('state'));
  if (!code || !state?.ws) {
    return page('That link did not check out', '<p>The sign-in did not carry a valid workspace, so nothing was connected. Start again from Settings.</p>', 'bad');
  }
  // A consent link left in a browser for a week should not still work.
  if (Date.now() - Number(state.at || 0) > 30 * 60_000) {
    return page('That link expired', '<p>Connection links are good for thirty minutes. Start again from Settings.</p>', 'bad');
  }

  const db = getDb();
  let tokens;
  try {
    tokens = await exchangeCode({
      code,
      clientId: e.GOOGLE_CLIENT_ID,
      clientSecret: e.GOOGLE_CLIENT_SECRET,
      redirectUri: redirectUri(e, req),
    });
  } catch (err) {
    return page('Google would not complete the sign-in', `<p>${String(err.message).slice(0, 200)}</p>`, 'bad');
  }

  // Which mailbox did they actually consent with? Asked rather than assumed:
  // hardcoding an address would make this work for exactly one person.
  let me;
  try { me = await profile(tokens.access_token); } catch (err) {
    return page('Connected, but Gmail would not say who', `<p>${String(err.message).slice(0, 200)}</p>`, 'bad');
  }

  await saveConnection(db, e, {
    workspace: state.ws,
    emailAddress: me.emailAddress,
    tokens,
    historyId: me.historyId ? String(me.historyId) : null,
  });

  // Start listening straight away.
  const topic = e.GMAIL_PUBSUB_TOPIC;
  let watching = false;
  let watchNote = '';
  if (topic) {
    try {
      const account = await getAccount(db, state.ws, me.emailAddress);
      const token = await accessTokenFor(db, e, account);
      const w = await startWatch(token, { topicName: topic });
      await recordWatch(db, account.id, w);
      watching = true;
    } catch (err) {
      watchNote = String(err.message).slice(0, 200);
    }
  } else {
    watchNote = 'GMAIL_PUBSUB_TOPIC is not set on this deployment.';
  }

  return page(
    watching ? 'Gmail is connected' : 'Gmail is connected, but not listening yet',
    watching
      ? `<p>Reading <strong>${me.emailAddress}</strong>. Replies from prospects will now show up in Today on their own, without anybody pressing anything.</p>
         <p>Leads That Bloom can read this mailbox, and can send from it when you switch automatic sending on. Both are off until you do. It cannot change or delete anything in it.</p>`
      : `<p>Reading <strong>${me.emailAddress}</strong>, but the mailbox watch did not start: ${watchNote}</p>
         <p>Replies will still be picked up by the hourly catch-up, just not instantly.</p>`,
    watching ? 'ok' : 'bad'
  );
}
