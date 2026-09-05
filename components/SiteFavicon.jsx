'use client';

import { useState } from 'react';
import { faviconUrl } from '../lib/favicon.mjs';
import { Icon } from './Icons';

// A prospect's website icon at 16px, pulled from Google's favicon cache off
// the `domain` field. Rows full of nothing but text were hard to scan; a
// tiny mark per business fixes that without adding another column.
//
// The quiet flower is the fallback — for prospects with no domain, junk in
// the field, or an icon that fails to load — so every row keeps the same
// rhythm and a missing icon never reads as broken.
export default function SiteFavicon({ domain, size = 16, className = '' }) {
  const [failed, setFailed] = useState(false);
  const src = faviconUrl(domain, size * 2); // 2x for retina
  if (!src || failed) {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 text-ink-3 opacity-50 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <Icon name="flower" className="w-3 h-3" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-[4px] ${className}`}
      aria-hidden="true"
    />
  );
}
