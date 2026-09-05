/** @type {import('next').NextConfig} */
// Build identity, stamped here because this file runs exactly once per build.
// Cloudflare Workers Builds exposes the commit as WORKERS_CI_COMMIT_SHA at build
// time; locally there is no such thing, and saying 'dev' beats inventing one.
// NEXT_PUBLIC_ values are inlined into BOTH the server and client bundles, so
// the UI badge and /api/version cannot disagree with each other, only with a
// stale browser tab, which is precisely the case they exist to catch.
const buildSha =
  String(process.env.WORKERS_CI_COMMIT_SHA || process.env.CF_PAGES_COMMIT_SHA || '').slice(0, 7) || 'dev';
const builtAt = new Date().toISOString();
// The human version people actually say out loud ("v1.0") lives in
// package.json. Bump it there when shipping a user-visible change; everything
// else here stays automatic.
const pkgVersion = require('./package.json').version;
const nextConfig = {
  env: {
    NEXT_PUBLIC_LTB_SHA: buildSha,
    NEXT_PUBLIC_LTB_BUILT_AT: builtAt,
    NEXT_PUBLIC_LTB_BRANCH: process.env.WORKERS_CI_BRANCH || process.env.CF_PAGES_BRANCH || 'local',
    NEXT_PUBLIC_LTB_VERSION: pkgVersion,
  },
  // Cloudflare D1 and R2 arrive as Worker bindings through
  // getCloudflareContext() from @opennextjs/cloudflare. No externals needed.
};

// In `next dev`, expose the bindings declared in wrangler.jsonc (local D1 and
// R2 simulated by wrangler, never remote resources) through
// getCloudflareContext(), so the same helper works locally. This is a no-op in
// the production build, which OpenNext runs through the Worker itself.
if (process.env.NODE_ENV === 'development') {
  (async () => {
    try {
      const { initOpenNextCloudflareForDev } = await import('@opennextjs/cloudflare');
      await initOpenNextCloudflareForDev();
    } catch {
      // optional in dev; ignore if the adapter is not installed yet
    }
  })();
}

module.exports = nextConfig;
