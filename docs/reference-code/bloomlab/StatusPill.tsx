/* Reference snapshot copied from Beeyach/Bloomlab/packages/design-system/src/semantic/StatusPill.tsx for BloomOps visual implementation. Reference-only; not runtime code. */
import { useRef } from 'react';

import { useOnScreen } from '../hooks/useOnScreen';
import { cx } from '../utils/cx';
import styles from './StatusPill.module.css';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'execution';
export type StatusGlyph = 'dot' | 'check' | 'cross' | 'clock' | 'skip' | 'ring' | 'dash';

export interface StatusPillProps {
  /** Always visible: status is never colour alone (A11Y-005). */
  label: string;
  tone?: StatusTone;
  glyph?: StatusGlyph;
  /** Gentle pulse for live states (execution category); off under reduced motion and off-screen. */
  live?: boolean;
  className?: string;
}

function Glyph({ glyph }: { glyph: StatusGlyph }) {
  switch (glyph) {
    case 'check':
      return <path d="M2 5.5l2.5 2.5L8 3" />;
    case 'cross':
      return <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />;
    case 'clock':
      return (
        <>
          <circle cx="5" cy="5" r="4" />
          <path d="M5 2.8V5l1.6 1" />
        </>
      );
    case 'skip':
      return <path d="M2 2l4 3-4 3zM7.5 2v6" />;
    case 'ring':
      return <circle cx="5" cy="5" r="3.5" />;
    case 'dash':
      return <path d="M2 5h6" />;
    default:
      return <circle cx="5" cy="5" r="3.5" fill="currentColor" stroke="none" />;
  }
}

export function StatusPill({
  label,
  tone = 'neutral',
  glyph = 'dot',
  live = false,
  className,
}: StatusPillProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const onScreen = useOnScreen(ref);
  return (
    <span ref={ref} className={cx(styles.pill, tone !== 'neutral' && styles[tone], className)}>
      <svg
        className={cx(styles.glyph, live && onScreen && styles.pulse)}
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <Glyph glyph={glyph} />
      </svg>
      {label}
    </span>
  );
}
