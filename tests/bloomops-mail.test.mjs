// Outbound mail and auth configuration: Resend is called the documented
// way with the key only in the Authorization header, the development-only
// transport cannot be enabled elsewhere, templates never leak, and the
// configuration resolver fails closed outside development.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MailError, RESEND_API_URL, createMailer, devMailKey, invitationEmail, magicLinkEmail } from '../lib/bloomops/mail.mjs';
import {
  MAGIC_LINK_TTL_SECONDS,
  SESSION_COOKIE_NAMES,
  SESSION_MAX_AGE_SECONDS,
  authSecret,
  authStatus,
  isAuthConfigurationError,
  mailConfig,
  resolveAppUrl,
  trustedOrigins,
} from '../lib/bloomops/auth-config.mjs';

test('the resend transport posts to the documented endpoint with the bearer key and nothing else secret', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ id: 'email_123' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const mailer = createMailer({ BLOOMOPS_ENV: 'staging', BLOOMOPS_RESEND_API_KEY: 're_test_key', BLOOMOPS_MAIL_FROM: 'BloomOps <team@example.com>' }, { fetch: fetchImpl });
  assert.equal(mailer.transport, 'resend');
  assert.equal(mailer.ready, true);
  const result = await mailer.send({ to: 'person@example.com', subject: 'Hi', text: 'Hello', html: '<p>Hello</p>' });
  assert.deepEqual(result, { id: 'email_123' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, RESEND_API_URL);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer re_test_key');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), { from: 'BloomOps <team@example.com>', to: ['person@example.com'], subject: 'Hi', text: 'Hello', html: '<p>Hello</p>' });
  assert.ok(!calls[0].init.body.includes('re_test_key'), 'the key is never in the body');
});

test('resend errors carry status and error name, never the message body or key', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ statusCode: 422, name: 'validation_error', message: 'Invalid `to`' }), { status: 422 });
  const mailer = createMailer({ BLOOMOPS_ENV: 'staging', BLOOMOPS_RESEND_API_KEY: 're_test_key' }, { fetch: fetchImpl });
  await assert.rejects(
    () => mailer.send({ to: 'x@example.com', subject: 's', text: 'secret-body' }),
    (err) => err instanceof MailError && err.status === 422 && err.errorName === 'validation_error' && !err.message.includes('secret-body') && !err.message.includes('re_test_key'),
  );
  const down = createMailer({ BLOOMOPS_ENV: 'staging', BLOOMOPS_RESEND_API_KEY: 're_test_key' }, { fetch: async () => { throw new Error('ECONNRESET'); } });
  await assert.rejects(() => down.send({ to: 'x@example.com', subject: 's', text: 'b' }), (err) => err.errorName === 'network_error');
  await assert.rejects(() => mailer.send({ to: '', subject: 's', text: 'b' }), (err) => err.errorName === 'invalid_message');
});

test('the r2-dev transport only exists in development and writes to the local bucket', async () => {
  const store = new Map();
  const r2 = { put: async (key, value) => { store.set(key, value); } };
  const mailer = createMailer({ BLOOMOPS_ENV: 'development', BLOOMOPS_MAIL_TRANSPORT: 'r2-dev', FILES: r2 });
  assert.equal(mailer.transport, 'r2-dev');
  await mailer.send({ to: 'Dev@Example.com', subject: 'Link', text: 'http://localhost:8787/x' });
  const key = await devMailKey('dev@example.com');
  assert.match(key, /^dev-mail\/[0-9a-f]{64}\.json$/);
  assert.ok(store.has(key), 'keyed by the hashed recipient so a smoke test can find it');
  assert.equal(JSON.parse(store.get(key)).to, 'Dev@Example.com');
  assert.throws(() => createMailer({ BLOOMOPS_ENV: 'staging', BLOOMOPS_MAIL_TRANSPORT: 'r2-dev', FILES: r2 }), /only allowed when BLOOMOPS_ENV is development/);
  assert.throws(() => createMailer({ BLOOMOPS_ENV: 'production', BLOOMOPS_MAIL_TRANSPORT: 'r2-dev', FILES: r2 }), /development/);
  assert.throws(() => createMailer({ BLOOMOPS_MAIL_TRANSPORT: 'r2-dev', FILES: r2 }), /development/, 'an unset environment is not development');
});

test('without a key or transport the mailer is not ready and says so', async () => {
  const mailer = createMailer({ BLOOMOPS_ENV: 'staging' });
  assert.equal(mailer.transport, 'none');
  assert.equal(mailer.ready, false);
  await assert.rejects(() => mailer.send({ to: 'x@example.com', subject: 's', text: 'b' }), /No mail transport/);
  const namedButKeyless = mailConfig({ BLOOMOPS_ENV: 'staging', BLOOMOPS_MAIL_TRANSPORT: 'resend' });
  assert.equal(namedButKeyless.transport, 'none', 'resend named without a key is "not ready", never a crash');
  assert.equal(namedButKeyless.missingKey, true);
  assert.equal(createMailer({ BLOOMOPS_ENV: 'staging', BLOOMOPS_MAIL_TRANSPORT: 'resend' }).ready, false);
  assert.throws(() => mailConfig({ BLOOMOPS_MAIL_TRANSPORT: 'pigeon' }), /must be one of/);
});

test('templates are plain, escape names, and carry the link exactly once in text', () => {
  const magic = magicLinkEmail({ url: 'https://app.example/api/auth/magic-link/verify?token=abc&callbackURL=%2F', expiresMinutes: 15 });
  assert.equal(magic.subject, 'Your BloomOps sign-in link');
  assert.equal(magic.text.match(/https:\/\/app\.example\S+/g).length, 1);
  assert.match(magic.text, /15 minutes/);
  assert.match(magic.html, /href="https:\/\/app\.example\/api\/auth\/magic-link\/verify\?token=abc&amp;callbackURL=%2F"/);
  const invite = invitationEmail({ url: 'https://app.example/invite/tok', workspaceName: 'Ellen <script>', roleLabel: 'Team Member', inviterName: 'Ary & Co' });
  assert.match(invite.subject, /Ellen <script>/, 'subjects are plain text');
  assert.match(invite.html, /Ellen &lt;script&gt;/);
  assert.match(invite.html, /Ary &amp; Co has invited you/);
  assert.doesNotMatch(invite.html, /<script>/);
  assert.match(invite.text, /Ary & Co has invited you to join Ellen <script> on BloomOps as Team Member/);
});

test('app URL resolution: development uses the loopback request, deployed environments only configuration, https only', () => {
  assert.equal(resolveAppUrl({ BLOOMOPS_ENV: 'development' }, 'http://localhost:8787/api/auth/x'), 'http://localhost:8787');
  assert.equal(resolveAppUrl({ BLOOMOPS_ENV: 'development' }, 'http://127.0.0.1:3000/'), 'http://127.0.0.1:3000');
  assert.equal(resolveAppUrl({ BLOOMOPS_ENV: 'development', BLOOMOPS_APP_URL: 'http://localhost:8787' }, 'https://evil.example/'), 'http://localhost:8787', 'a non-loopback host is ignored even in development');
  assert.equal(resolveAppUrl({ BLOOMOPS_ENV: 'development' }), 'http://localhost:3000');
  assert.equal(resolveAppUrl({ BLOOMOPS_ENV: 'staging', BLOOMOPS_APP_URL: 'https://staging.example/path' }, 'https://attacker.example/'), 'https://staging.example');
  assert.throws(() => resolveAppUrl({ BLOOMOPS_ENV: 'staging' }, 'https://staging.example/'), /BLOOMOPS_APP_URL is not configured/);
  assert.throws(() => resolveAppUrl({ BLOOMOPS_ENV: 'production', BLOOMOPS_APP_URL: 'http://insecure.example' }), /https/);
  assert.throws(() => resolveAppUrl({ BLOOMOPS_APP_URL: 'http://localhost:3000' }, 'http://localhost:3000/'), /https/, 'an unset environment is not development');
  assert.deepEqual(trustedOrigins({ BLOOMOPS_TRUSTED_ORIGINS: 'https://a.example, https://b.example/x, junk, https://a.example' }, 'https://app.example'), ['https://app.example', 'https://a.example', 'https://b.example']);
  assert.deepEqual(trustedOrigins({ BLOOMOPS_ENV: 'development' }, 'http://127.0.0.1:8787'), ['http://127.0.0.1:8787', 'http://localhost:8787', 'http://[::1]:8787'], 'loopback siblings are trusted in development only');
  assert.deepEqual(trustedOrigins({ BLOOMOPS_ENV: 'staging' }, 'https://staging.example'), ['https://staging.example']);
  assert.deepEqual(trustedOrigins({ BLOOMOPS_ENV: 'development' }, 'http://dev.example:3000'), ['http://dev.example:3000'], 'a non-loopback development origin gains nothing');
});

test('the auth secret fails closed outside development', () => {
  assert.equal(authSecret({ BLOOMOPS_ENV: 'staging', BLOOMOPS_AUTH_SECRET: 'x'.repeat(32) }), 'x'.repeat(32));
  assert.throws(() => authSecret({ BLOOMOPS_ENV: 'staging' }), (err) => isAuthConfigurationError(err) && /BLOOMOPS_AUTH_SECRET is not configured/.test(err.message));
  assert.throws(() => resolveAppUrl({ BLOOMOPS_ENV: 'staging' }), (err) => isAuthConfigurationError(err));
  assert.throws(() => authSecret({ BLOOMOPS_ENV: 'production', BLOOMOPS_AUTH_SECRET: 'short' }), /at least 32/);
  assert.throws(() => authSecret({}), /not configured/);
  const dev = authSecret({ BLOOMOPS_ENV: 'development' });
  assert.ok(dev.length >= 32);
  assert.throws(() => authSecret({ BLOOMOPS_ENV: 'staging', BLOOMOPS_AUTH_SECRET: dev }), undefined, 'the development fallback is never a deployed secret');
});

test('health status carries booleans and names only', () => {
  const status = authStatus({ BLOOMOPS_ENV: 'staging', BLOOMOPS_APP_URL: 'https://s.example', BLOOMOPS_AUTH_SECRET: 'y'.repeat(40), BLOOMOPS_RESEND_API_KEY: 're_secret' });
  assert.deepEqual(status, { configured: true, mail: 'resend' });
  assert.deepEqual(authStatus({ BLOOMOPS_ENV: 'staging' }), { configured: false, mail: 'none' });
  assert.ok(!JSON.stringify(status).includes('re_secret'));
  assert.deepEqual(SESSION_COOKIE_NAMES, ['__Secure-bloomops.session_token', 'bloomops.session_token']);
  assert.equal(SESSION_MAX_AGE_SECONDS, 30 * 24 * 60 * 60);
  assert.equal(MAGIC_LINK_TTL_SECONDS, 15 * 60);
});
