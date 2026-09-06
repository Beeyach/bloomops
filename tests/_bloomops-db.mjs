// A real SQLite database wearing D1's interface, built from the committed
// BloomOps migrations, for the A3 authentication and membership tests.
//
// The property under test is the database plus Better Auth plus the
// membership code, so a hand-written fake would prove nothing. This runs the
// actual migration SQL and answers the actual calls drizzle-orm's D1 driver
// makes (bind, all, run, first, raw, batch), so the same code path that runs
// on Cloudflare runs here.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { createAuth } from '../lib/bloomops/auth.mjs';

export function migrationFiles() {
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
  return journal.entries.map((e) => ({ tag: e.tag, url: new URL(`../drizzle/${e.tag}.sql`, import.meta.url) }));
}

export function freshSqlite() {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  for (const { url } of migrationFiles()) {
    for (const chunk of readFileSync(url, 'utf8').split('--> statement-breakpoint')) {
      const stmt = chunk.trim();
      if (stmt) raw.exec(stmt);
    }
  }
  return raw;
}

const returnsRows = (sql) => /^\s*(select|with|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql);

export function d1Binding(raw) {
  const statement = (sql, params) => ({
    bind: (...next) => statement(sql, next),
    async run() {
      const stmt = raw.prepare(sql);
      if (returnsRows(sql)) {
        const results = stmt.all(...params);
        return { success: true, results, meta: { changes: results.length, last_row_id: 0 } };
      }
      const r = stmt.run(...params);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    async all() {
      const results = raw.prepare(sql).all(...params);
      return { success: true, results, meta: { changes: 0 } };
    },
    async first(column) {
      const row = raw.prepare(sql).all(...params)[0];
      if (!row) return null;
      return column ? row[column] : row;
    },
    async raw() {
      const stmt = raw.prepare(sql);
      stmt.setReturnArrays(true);
      return stmt.all(...params);
    },
  });
  return {
    prepare: (sql) => statement(sql, []),
    // D1 applies a batch as one implicit transaction: every statement
    // commits or none does. The double has to do the same, or a test that
    // asserts "the record cannot exist without its activity event" would
    // pass against a double that simply left the first insert behind.
    async batch(statements) {
      raw.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.all());
        raw.exec('COMMIT');
        return out;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(sql) {
      raw.exec(sql);
      return { count: 1, duration: 0 };
    },
  };
}

export function testDb() {
  const raw = freshSqlite();
  const d1 = d1Binding(raw);
  return { raw, d1, db: drizzle(d1, { schema }) };
}

export const run = (raw, sql, ...params) => raw.prepare(sql).run(...params);
export const one = (raw, sql, ...params) => raw.prepare(sql).get(...params);
export const all = (raw, sql, ...params) => raw.prepare(sql).all(...params);

export const APP_URL = 'http://localhost:3000';
export const TEST_SECRET = 'bloomops-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz';

export function testEnv(d1, overrides = {}) {
  return {
    BLOOMOPS_ENV: 'development',
    BLOOMOPS_APP_URL: APP_URL,
    BLOOMOPS_AUTH_SECRET: TEST_SECRET,
    DB: d1,
    ...overrides,
  };
}

// A mailer that keeps every message in memory. What the auth code hands it
// is exactly what Resend would receive.
export function memoryMailer({ ready = true } = {}) {
  const sent = [];
  return {
    transport: 'memory',
    ready,
    from: 'BloomOps <test@example.com>',
    sent,
    async send(message) {
      if (!ready) throw new Error('mailer disabled');
      sent.push(message);
      return { id: `mem_${sent.length}` };
    },
  };
}

// Everything an authentication test needs: the database, a Better Auth
// instance wired to it, the captured mail, and request helpers.
export function testAuth({ now = () => new Date(), env: envOverrides = {}, mailer = memoryMailer() } = {}) {
  const { raw, d1, db } = testDb();
  const env = testEnv(d1, envOverrides);
  const auth = createAuth({ env, db, mailer, now });

  async function requestMagicLink(email, { next = '/', origin = APP_URL } = {}) {
    return auth.handler(new Request(`${APP_URL}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ email, callbackURL: next, newUserCallbackURL: next, errorCallbackURL: '/sign-in' }),
    }));
  }

  async function follow(url) {
    return auth.handler(new Request(url, { method: 'GET', redirect: 'manual' }));
  }

  const cookieOf = (res) => {
    const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    return set.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
  };

  // Request, deliver, click: the whole happy path, returning the cookie.
  async function signIn(email, options) {
    const before = mailer.sent.length;
    const res = await requestMagicLink(email, options);
    if (res.status !== 200) throw new Error(`magic link request failed: ${res.status}`);
    const mail = mailer.sent[before];
    if (!mail) throw new Error('no magic link email was delivered');
    const link = mail.text.match(/https?:\/\/\S+/)[0];
    const verified = await follow(link);
    return { cookie: cookieOf(verified), response: verified, link };
  }

  async function session(cookie) {
    return auth.api.getSession({ headers: new Headers({ cookie }) });
  }

  return { raw, d1, db, env, auth, mailer, requestMagicLink, follow, cookieOf, signIn, session };
}
