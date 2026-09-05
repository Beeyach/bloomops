// Which build this is. One module, imported by the server route and the
// client badge alike, reading values inlined at build time — so the two can
// only disagree when the browser is running an older bundle than the server,
// which is exactly the situation worth surfacing.
const sha = process.env.NEXT_PUBLIC_LTB_SHA || 'dev';
const builtAt = process.env.NEXT_PUBLIC_LTB_BUILT_AT || null;
const branch = process.env.NEXT_PUBLIC_LTB_BRANCH || 'local';
// package.json's version, stamped in next.config.js. "1.0.0" is worn as
// "1.0" — the trailing .0 is noise until there is a real patch release.
const rawVersion = process.env.NEXT_PUBLIC_LTB_VERSION || '0.0.0';
const version = rawVersion.replace(/\.0$/, '');

export const VERSION = {
  version,
  sha,
  builtAt,
  branch,
  environment: branch === 'main' ? 'Production' : branch === 'local' ? 'Local' : 'Preview',
  // Human-readable release: the build date as a number a person can say out
  // loud. "LTB 2026.08.18" tells Ary more than a hash ever will.
  release: builtAt ? `LTB ${builtAt.slice(0, 10).replace(/-/g, '.')}` : 'LTB dev',
};

export const versionLine = () => `${VERSION.release} · ${VERSION.sha} · ${VERSION.environment}`;
