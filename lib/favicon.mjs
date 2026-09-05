// Prospect favicons, derived from the `domain` column. The domain field is
// hand-entered and messy — full URLs, paths, stray spaces, www prefixes — so
// the host is extracted defensively and anything that doesn't look like a
// real host yields null (no icon) rather than a broken image.

export function faviconHost(domain) {
  if (!domain) return null;
  let d = String(domain).trim().toLowerCase();
  if (!d) return null;
  // Strip protocol, path, query, port — keep the bare host.
  d = d.replace(/^https?:\/\//, '');
  d = d.split(/[/?#]/)[0];
  d = d.split(':')[0];
  d = d.replace(/^www\./, '');
  // A real host has at least one dot and no spaces ("pending", "n/a", and
  // other placeholder values people type into the field all fail this).
  if (!d.includes('.') || /\s/.test(d)) return null;
  return d;
}

// Google's favicon service: cached, sized, and quietly returns a neutral
// globe when a site has no icon — no CORS or 404 noise. sz=32 renders crisp
// at the 16px display size on retina screens.
export function faviconUrl(domain, size = 32) {
  const host = faviconHost(domain);
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}
