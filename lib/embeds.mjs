// Provider registry for page embeds.
//
// Pure on purpose: no DOM, no fetch, no platform globals. The editor and the
// public route both import this, so the allowlist cannot drift between what
// you can insert and what a client is allowed to load. Same reason
// lib/columns.mjs exists.
//
// Two flags carry all the safety:
//
//   toEmbedUrl === null  the URL is recognised but cannot be framed (X). It
//                        never becomes a block; a pasted link stays text.
//   publicSafe === false the block renders live in the app, but on a public
//                        /p/<token> page it stays the fallback link. Anything
//                        the user can point at freely lives here.
//
// Nothing in this file emits HTML. Callers build the iframe from embedUrl, so
// a provider can never smuggle markup into a page body.

const enc = encodeURIComponent;

// Each provider carries exactly one of `aspect` (known shape) or `height`
// (content height varies, so the frame scrolls internally). A sandboxed
// cross-origin frame cannot tell us how tall it is, so social posts get a
// fixed height rather than fitting their caption.
const PROVIDERS = [
  {
    id: 'loom',
    label: 'Loom',
    aspect: '16/9',
    publicSafe: true,
    allowFullscreen: true,
    test: (u) => /(^|\.)loom\.com$/.test(u.hostname) && /^\/(share|embed)\/[\w-]+/.test(u.pathname),
    toEmbedUrl: (u) => {
      const id = u.pathname.split('/')[2];
      return id ? `https://www.loom.com/embed/${enc(id)}` : null;
    },
  },
  {
    id: 'googledocs',
    label: 'Google Docs',
    aspect: '4/3',
    publicSafe: true,
    test: (u) =>
      u.hostname === 'docs.google.com' &&
      /^\/(document|spreadsheets|presentation)\/d\/[\w-]+/.test(u.pathname),
    // /preview is the read-only view Google serves for framing. Swapping the
    // trailing /edit for it keeps the document id untouched.
    toEmbedUrl: (u) => {
      const m = u.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/);
      return m ? `https://docs.google.com/${m[1]}/d/${m[2]}/preview` : null;
    },
  },
  {
    id: 'googlemaps',
    label: 'Google Maps',
    aspect: '4/3',
    publicSafe: true,
    test: (u) =>
      /(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname.startsWith('/maps'),
    // A URL copied from Share -> Embed a map is already an iframe src and is
    // used as-is. An ordinary maps link is handed to the classic q= endpoint,
    // which renders without an API key.
    toEmbedUrl: (u) =>
      u.pathname.startsWith('/maps/embed')
        ? u.href
        : `https://maps.google.com/maps?q=${enc(u.href)}&output=embed`,
  },
  {
    id: 'figma',
    label: 'Figma',
    aspect: '16/9',
    publicSafe: true,
    allowFullscreen: true,
    test: (u) =>
      /(^|\.)figma\.com$/.test(u.hostname) &&
      /^\/(file|design|proto|board|slides)\//.test(u.pathname),
    toEmbedUrl: (u) => `https://www.figma.com/embed?embed_host=bloomtrack&url=${enc(u.href)}`,
  },
  {
    id: 'calendly',
    label: 'Calendly',
    height: 700,
    publicSafe: true,
    test: (u) => /(^|\.)calendly\.com$/.test(u.hostname) && u.pathname.length > 1,
    toEmbedUrl: (u) => u.href,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    height: 640,
    publicSafe: true,
    test: (u) =>
      /(^|\.)instagram\.com$/.test(u.hostname) && /^\/(p|reel|tv)\/[\w-]+/.test(u.pathname),
    // Public posts only. A private account renders Instagram's own error
    // inside the frame, which is why the fallback link always stays visible.
    toEmbedUrl: (u) => {
      const m = u.pathname.match(/^\/(p|reel|tv)\/([\w-]+)/);
      return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed` : null;
    },
  },
  // Video before post: a watch/videos URL is also a facebook.com URL, and the
  // first match wins.
  {
    id: 'facebookvideo',
    label: 'Facebook video',
    aspect: '16/9',
    publicSafe: true,
    allowFullscreen: true,
    test: (u) =>
      /(^|\.)facebook\.com$/.test(u.hostname) &&
      (u.pathname.startsWith('/watch') || /\/videos?\//.test(u.pathname)),
    toEmbedUrl: (u) => `https://www.facebook.com/plugins/video.php?href=${enc(u.href)}`,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    height: 640,
    publicSafe: true,
    // /share/ is excluded on purpose: those are unresolved short links, and
    // handing one to post.php produces a frame that claims the post is gone.
    // They are expanded before insert, so one reaching here is already wrong.
    test: (u) =>
      /(^|\.)facebook\.com$/.test(u.hostname) &&
      u.pathname.length > 1 &&
      !u.pathname.startsWith('/share/'),
    toEmbedUrl: (u) =>
      `https://www.facebook.com/plugins/post.php?href=${enc(u.href)}&show_text=true&width=500`,
  },
  {
    id: 'x',
    label: 'X',
    aspect: '16/9',
    publicSafe: false,
    // Recognised so it reads as a known link, never framed. Embedding a post
    // means loading platform.twitter.com's script, which cannot be sandboxed
    // and would undo the point of this design.
    test: (u) =>
      /(^|\.)(x|twitter)\.com$/.test(u.hostname) && /\/status\/\d+/.test(u.pathname),
    toEmbedUrl: null,
  },
  {
    id: 'generic',
    label: 'Embed',
    aspect: '16/9',
    publicSafe: false,
    test: () => true,
    toEmbedUrl: (u) => u.href,
  },
];

export { PROVIDERS };

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || null;
}

export function isPublicSafe(id) {
  const p = getProvider(id);
  return Boolean(p && p.publicSafe && p.toEmbedUrl);
}

// Parse and validate. Returns null for anything we refuse to embed at all, so
// callers never have to repeat the scheme/host checks.
//
// selfHost is passed in rather than read from a global because this module
// stays pure — and because framing our own origin is the one case where the
// sandbox's allow-same-origin would actually be dangerous.
export function matchEmbed(rawUrl, selfHost) {
  let u;
  try {
    u = new URL(String(rawUrl || '').trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (selfHost && u.hostname === String(selfHost).toLowerCase()) return null;

  const provider = PROVIDERS.find((p) => p.test(u));
  if (!provider) return null;

  return {
    provider: provider.id,
    url: u.href,
    embedUrl: provider.toEmbedUrl ? provider.toEmbedUrl(u) : null,
    aspect: provider.aspect || null,
    height: provider.height || null,
  };
}

// Rebuild an embed URL from a stored provider + url pair. The renderers call
// this rather than trusting anything persisted, so a hand-edited body cannot
// put an arbitrary src on the page.
export function embedUrlFor(providerId, rawUrl, selfHost) {
  const provider = getProvider(providerId);
  if (!provider || !provider.toEmbedUrl) return null;
  const match = matchEmbed(rawUrl, selfHost);
  // The stored provider has to still agree with what the URL parses as.
  if (!match || match.provider !== providerId) return null;
  return match.embedUrl;
}

// Facebook's Share button hands out facebook.com/share/p/<code> links, and the
// post plugin cannot resolve them — it needs the canonical permalink. These
// have to be swapped for the real URL before they become a block, or the embed
// renders "This post is no longer available" for a post that is public and
// fine. Callers send these to /api/embed/resolve first.
const FB_SHARE = /^https:\/\/(www\.)?facebook\.com\/share\/[pvrg]\/[\w-]+\/?$/i;

export function isFacebookShare(rawUrl) {
  return FB_SHARE.test(String(rawUrl || '').trim());
}

// The canonical URL Facebook reports carries a slug the plugin does not need.
// Reducing it to /<pageId>/posts/<postId>/ is the form verified to embed.
export function canonicalFacebookPost(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!/(^|\.)facebook\.com$/.test(u.hostname)) return null;
    const withSlug = u.pathname.match(/^\/(\d+)\/posts\/[^/]+\/(\d+)\/?$/);
    if (withSlug) return `https://www.facebook.com/${withSlug[1]}/posts/${withSlug[2]}/`;
    const plain = u.pathname.match(/^\/(\d+)\/posts\/(\d+)\/?$/);
    if (plain) return `https://www.facebook.com/${plain[1]}/posts/${plain[2]}/`;
    return u.href;
  } catch {
    return null;
  }
}

// Short, readable stand-in for the raw URL — used as the fallback link's text
// and as the caption under a rendered embed.
export function embedLabel(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const path = u.pathname.length > 1 ? u.pathname : '';
    const s = (u.hostname + path).replace(/^www\./, '');
    return s.length > 58 ? s.slice(0, 57) + '…' : s;
  } catch {
    return String(rawUrl || '');
  }
}
