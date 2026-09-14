// Outbound mail for BloomOps, behind one small interface so nothing else in
// the app knows how an email leaves the Worker.
//
//   const mailer = createMailer(env);
//   await mailer.send({ to, subject, text, html });
//
// Transports
//   resend   POST https://api.resend.com/emails with the API key as a bearer
//            token. This is Resend's documented REST call; the Node SDK is not
//            installed because the call is one fetch and the SDK carries a
//            React Email peer dependency the Worker has no use for.
//   r2-dev   Development only. Writes the message as JSON into the local R2
//            simulation under dev-mail/<sha256(recipient)>.json so a local
//            smoke test can read a magic link back with `wrangler r2 object
//            get --local`. Refused in every other environment.
//   none     Sending fails. Sign-in reports the deployment as unconfigured
//            before any email-dependent work happens.
//
// Nothing here logs a message body, a recipient, or a link. Errors carry the
// transport's status and error name only.

import { isDevelopment, mailConfig } from './auth-config.mjs';

export const RESEND_API_URL = 'https://api.resend.com/emails';

export class MailError extends Error {
  constructor(message, { status = 0, name = 'mail_error' } = {}) {
    super(message);
    this.name = 'MailError';
    this.status = status;
    this.errorName = name;
  }
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function devMailKey(recipient) {
  return sha256Hex(String(recipient).trim().toLowerCase()).then((h) => `dev-mail/${h}.json`);
}

function validMessage(message) {
  const to = String(message?.to || '').trim();
  const subject = String(message?.subject || '').trim();
  if (!to || !subject || (!message.text && !message.html)) {
    throw new MailError('A message needs a recipient, a subject, and a body.', { name: 'invalid_message' });
  }
  return { to, subject, text: message.text ? String(message.text) : undefined, html: message.html ? String(message.html) : undefined };
}

export function createMailer(env = {}, { fetch: fetchImpl = globalThis.fetch, r2 = env.FILES } = {}) {
  const config = mailConfig(env);

  if (config.transport === 'resend') {
    return {
      transport: 'resend',
      ready: true,
      from: config.from,
      async send(message) {
        const m = validMessage(message);
        let res;
        try {
          res = await fetchImpl(RESEND_API_URL, {
            method: 'POST',
            headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
            body: JSON.stringify({ from: config.from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
          });
        } catch (err) {
          throw new MailError('Resend could not be reached.', { name: 'network_error' });
        }
        if (!res.ok) {
          let name = 'application_error';
          try {
            const body = await res.json();
            if (body && typeof body.name === 'string') name = body.name;
          } catch {}
          throw new MailError(`Resend refused the message (${res.status}).`, { status: res.status, name });
        }
        let id = null;
        try {
          id = (await res.json())?.id || null;
        } catch {}
        return { id };
      },
    };
  }

  if (config.transport === 'r2-dev') {
    if (!isDevelopment(env)) throw new MailError('r2-dev is a development-only transport.', { name: 'transport_forbidden' });
    if (!r2 || typeof r2.put !== 'function') throw new MailError('r2-dev needs the FILES binding.', { name: 'transport_unavailable' });
    return {
      transport: 'r2-dev',
      ready: true,
      from: config.from,
      async send(message) {
        const m = validMessage(message);
        const key = await devMailKey(m.to);
        await r2.put(key, JSON.stringify({ from: config.from, ...m, sentAt: new Date().toISOString() }), {
          httpMetadata: { contentType: 'application/json' },
        });
        return { id: key };
      },
    };
  }

  return {
    transport: 'none',
    ready: false,
    from: config.from,
    async send() {
      throw new MailError('No mail transport is configured on this deployment.', { name: 'transport_unconfigured' });
    },
  };
}

// ── templates ────────────────────────────────────────────────────────────
//
// Plain, short, professional. A person who did not ask for the message can
// ignore it safely, and nothing in it reveals who else uses the workspace.

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function layout(title, paragraphs, { url, action }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#2b2b2b">${p}</p>`).join('');
  const logoUrl = new URL('/brand/bloomsi-lockup-charcoal.png', url).href;
  return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#faf7f3;font-family:Helvetica,Arial,sans-serif">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #eee5dc;border-radius:12px;padding:32px">
<img src="${escapeHtml(logoUrl)}" alt="Bloomsi" width="156" style="display:block;width:156px;max-width:48%;height:auto;margin:0 0 18px">
<h1 style="margin:0 0 20px;font-size:20px;font-weight:600;color:#1f1f1f">${escapeHtml(title)}</h1>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1f1f1f;color:#ffffff;text-decoration:none;font-size:15px;padding:12px 20px;border-radius:8px">${escapeHtml(action)}</a></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#7a746e">If the button does not work, copy this link into your browser:<br>${escapeHtml(url)}</p>
</div></body></html>`;
}

export function magicLinkEmail({ url, expiresMinutes = 15 }) {
  const subject = 'Your Bloomsi sign-in link';
  const text = [
    'Use this link to sign in to Bloomsi:',
    url,
    '',
    `The link works once and expires in ${expiresMinutes} minutes. If you did not ask to sign in, you can ignore this email.`,
  ].join('\n');
  const html = layout(
    'Sign in to Bloomsi',
    [
      'Use the button below to sign in. The link works once and expires in ' + escapeHtml(String(expiresMinutes)) + ' minutes.',
      'If you did not ask to sign in, you can ignore this email.',
    ],
    { url, action: 'Sign in' },
  );
  return { subject, text, html };
}

export function invitationEmail({ url, workspaceName, roleLabel, inviterName, expiresDays = 7 }) {
  const who = inviterName ? `${inviterName} has invited you` : 'You have been invited';
  const subject = `You're invited to ${workspaceName} on Bloomsi`;
  const text = [
    `${who} to join ${workspaceName} on Bloomsi as ${roleLabel}.`,
    '',
    'Accept the invitation here:',
    url,
    '',
    `The invitation expires in ${expiresDays} days. If you were not expecting it, you can ignore this email.`,
  ].join('\n');
  const html = layout(
    `Join ${workspaceName}`,
    [
      `${escapeHtml(who)} to join <strong>${escapeHtml(workspaceName)}</strong> on Bloomsi as ${escapeHtml(roleLabel)}.`,
      `The invitation expires in ${escapeHtml(String(expiresDays))} days. If you were not expecting it, you can ignore this email.`,
    ],
    { url, action: 'Accept invitation' },
  );
  return { subject, text, html };
}
