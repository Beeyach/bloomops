// The related-profiles actor returns richer data than the profile scraper,
// but under its own field names — and its published docs list the fields in
// prose rather than as a JSON schema. So this normalizer accepts every
// spelling those fields plausibly ship under and hands back exactly the shape
// scoreProfile() already expects. Anything it cannot find stays null, so the
// checklist reports "cannot verify" instead of quietly scoring a zero.

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

function num(v) {
  const n = Number(String(v ?? '').toString().replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function normalizeRelatedProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const handle = String(
    pick(raw, ['username', 'userName', 'handle', 'ownerUsername']) ||
      // Fall back to the tail of the profile URL.
      String(pick(raw, ['url', 'accountUrl', 'profileUrl', 'inputUrl']) || '')
        .replace(/\/+$/, '')
        .split('/')
        .pop() ||
      ''
  ).replace(/^@/, '').trim();
  if (!handle) return null;

  // Captions arrive either as post objects or as a bare string list.
  const rawPosts = pick(raw, ['latestPosts', 'posts', 'recentPosts', 'lastPosts', 'captions']) || [];
  const latestPosts = (Array.isArray(rawPosts) ? rawPosts : []).map((p) =>
    typeof p === 'string'
      ? { caption: p, likesCount: null }
      : { caption: pick(p, ['caption', 'text', 'title']) || '', likesCount: num(pick(p, ['likesCount', 'likes', 'likeCount'])) }
  );

  return {
    handle,
    url: pick(raw, ['url', 'accountUrl', 'profileUrl']) || `https://www.instagram.com/${handle}/`,
    fullName: pick(raw, ['fullName', 'full_name', 'name', 'displayName']) || '',
    biography: pick(raw, ['biography', 'bio', 'description']) || '',
    businessCategoryName: pick(raw, ['businessCategoryName', 'businessCategory', 'category', 'categoryName']) || '',
    followersCount: num(pick(raw, ['followersCount', 'followers', 'followersNumber', 'followerCount'])) || 0,
    externalUrl: pick(raw, ['externalUrl', 'external_url', 'websiteUrl', 'website', 'link']) || '',
    email: pick(raw, ['email', 'publicEmail', 'businessEmail']) || '',
    avatar: pick(raw, ['profilePicUrl', 'profilePicture', 'profilePicUrlHD', 'avatar']) || null,
    latestPosts,
    // The actor computes these itself. Kept so engagementOf() can use them
    // when the posts it returned carry captions but no like counts.
    avgLikes: num(pick(raw, ['avgLikes', 'averageLikes', 'avgLikesCount', 'medianLikes'])),
    engagementRate: num(pick(raw, ['engagementRate', 'engagement', 'erPercent'])),
  };
}

// Handles we have already shown you, so a second scan does not re-surface
// someone you looked at and passed on last week.
export function dedupeHandles(profiles, seenHandles) {
  const seen = new Set([...(seenHandles || [])].map((h) => String(h).toLowerCase()));
  const fresh = [];
  const repeats = [];
  for (const p of profiles || []) {
    if (!p || !p.handle) continue;
    const key = p.handle.toLowerCase();
    if (seen.has(key)) {
      repeats.push(p);
      continue;
    }
    seen.add(key);
    fresh.push(p);
  }
  return { fresh, repeats };
}
