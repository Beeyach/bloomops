'use client';

import { Icon } from '../Icons';
import { STAGE_META } from '../../lib/stage-meta.mjs';

// Looks up a stage's icon name and renders the SVG. Falls back to a
// neutral dot for unknown stages.
export default function StageIcon({ stage, className = 'w-3.5 h-3.5' }) {
  const meta = STAGE_META[stage] || {};
  return <Icon name={meta.icon || 'circle-dot'} className={className} />;
}
