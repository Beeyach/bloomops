// The 50/50 audit-video test is assigned by an info-field marker: one line,
// "VIDTEST:A" (this prospect got the video) or "VIDTEST:B" (plain follow-up).
// The marker can sit anywhere in the multi-line info blob — it's prepended
// above Ary's research notes — so the match is line-anchored, not whole-string.
//
// This replaces the old all-time video/no-video comparison, which was
// misleading: every video went out Jul 24–Aug 3 against months of accrued
// no-video history, so the two arms were never comparable. A tagged 50/50
// test compares like with like.
const VIDTEST_RE = /^\s*VIDTEST:([AB])\b/m;

export function vidtestGroup(info) {
  if (typeof info !== 'string') return null;
  const m = info.match(VIDTEST_RE);
  return m ? m[1] : null; // 'A' | 'B' | null
}

// Rollup across prospects: count + replied + reply rate per arm. isReplied(p)
// decides a reply from a non-reply (kept injectable so the same rule the rest
// of the app uses drives this too). "readable" only once BOTH arms clear `min`
// — below that, any gap is luck, so the card says "too early" instead.
export function vidtestStats(prospects, isReplied, min = 30) {
  const arms = { A: { count: 0, replied: 0 }, B: { count: 0, replied: 0 } };
  for (const p of prospects || []) {
    const g = vidtestGroup(p && p.info);
    if (g !== 'A' && g !== 'B') continue;
    arms[g].count += 1;
    if (isReplied(p)) arms[g].replied += 1;
  }
  const rate = (a) => (a.count > 0 ? Math.round((a.replied / a.count) * 1000) / 10 : 0);
  return {
    A: { ...arms.A, rate: rate(arms.A) },
    B: { ...arms.B, rate: rate(arms.B) },
    readable: arms.A.count >= min && arms.B.count >= min,
    min,
  };
}
