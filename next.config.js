/** @type {import('next').NextConfig} */
// Build identity, stamped here because this file runs exactly once per build.
// Cloudflare Pages exposes the commit as CF_PAGES_COMMIT_SHA at build time;
// locally there is no such thing, and saying 'dev' beats inventing one.
// NEXT_PUBLIC_ values are inlined into BOTH the server and client bundles, so
// the UI badge and /api/version cannot disagree with each other — only with a
// stale browser tab, which is precisely the case they exist to catch.
const buildSha = String(process.env.CF_PAGES_COMMIT_SHA || '').slice(0, 7) || 'dev';
const builtAt = new Date().toISOString();
// The human version people actually say out loud ("v1.0") lives in
// package.json. Bump it there when shipping a user-visible change; everything
// else here stays automatic.
const pkgVersion = require('./package.json').version;
const nextConfig = {
  env: {
    NEXT_PUBLIC_LTB_SHA: buildSha,
    NEXT_PUBLIC_LTB_BUILT_AT: builtAt,
    NEXT_PUBLIC_LTB_BRANCH: process.env.CF_PAGES_BRANCH || 'local',
    NEXT_PUBLIC_LTB_VERSION: pkgVersion,
  },
  // better-sqlite3 is gone — we use Cloudflare D1 via @cloudflare/next-on-pages.
  // No special externals needed; D1 is provided by the runtime binding.
};

// In dev (`next dev`), wire up D1 from wrangler so the same getRequestContext
// helper works locally. This is a no-op in the actual Pages build.
if (process.env.NODE_ENV === 'development') {
  // setupDevPlatform reads wrangler.toml and exposes the bindings via
  // getRequestContext during `next dev`.
  // We import lazily so a missing dep doesn't break production builds.
  (async () => {
    try {
      const { setupDevPlatform } = await import('@cloudflare/next-on-pages/next-dev');
      await setupDevPlatform();
    } catch {
      // optional in dev; ignore if not installed yet
    }
  })();
}

module.exports = nextConfig;
