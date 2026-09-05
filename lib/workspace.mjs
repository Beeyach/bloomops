import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { verifySession, SESSION_COOKIE } from './session.mjs';
import { DEFAULT_ENGINE_SETTINGS } from './engine-prompts.mjs';

// Every data route resolves the caller's workspace from their signed session
// cookie and scopes all queries to it. Middleware already blocks cookieless
// requests, but routes re-verify here (defense in depth) — the workspace
// string decides which rows a request can ever see or touch, so it must come
// from the signed token, never from anything the client can set.
export async function getWorkspace(req) {
  let env = {};
  try {
    env = getCloudflareContext().env || {};
  } catch {}
  const cookie = req.cookies && req.cookies.get(SESSION_COOKIE);
  if (!cookie) return null;
  return verifySession(env, cookie.value); // { workspace, role } | null
}

export function unauthorized() {
  return NextResponse.json({ error: 'Not authenticated. Enter your access code.' }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: 'Your access code cannot make this change.' }, { status: 403 });
}

// The Hive: everything a workspace has told the product about itself.
//
// Four copies of this read had grown across the codebase, each with its own
// idea of what happens when the row is missing or the JSON is broken. Since
// every AI prompt is about to start reading its offer and its rules from here,
// they need to be reading the same thing.
export async function loadEngineSettings(db, workspace) {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'engine'`)
    .bind(workspace)
    .first();
  let stored = {};
  if (row?.value) { try { stored = JSON.parse(row.value); } catch {} }
  return { ...DEFAULT_ENGINE_SETTINGS, ...stored };
}
