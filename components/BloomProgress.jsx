'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Butterfly from './Butterfly';
import { growthFor, DUR } from '../lib/motion-tokens.mjs';

// Three states, three compositions. Deliberately no shared geometry between
// indeterminate and determinate: they mean different things, and reusing a
// track for both is what made a three-second-old scan read as nearly done.
//
//   indeterminate — no track, no endpoint, no position. A butterfly loops in
//                   a small area with a trail that continuously disappears.
//                   Nothing about it can be read as a percentage.
//   determinate   — a real track filled to real measured progress.
//   complete      — the filled track, the flower opening, the butterfly landed.
//   error         — static, neutral, no motion.

const LOOP_W = 140;
const LOOP_H = 52;
const TRACK_W = 260;
const TRACK_H = 28;
const TRAIL_POINTS = 12; // ~55px of trail at this scale

function useReducedMotion() {
  // The CSS reduced-motion block owns this now: it slows these indicators
  // rather than stopping them, because a frozen progress bar reads as a hung
  // app. This stays false so the JS-driven trail keeps its shape and the
  // stylesheet decides the pace. Kept as a hook so callers are unchanged.
  return false;
}

// A shallow figure-eight centred in the box. A lemniscate has no start and no
// end, which is the whole point — there is no first or last position to read
// as progress. Kept well inside the edges so it never approaches a boundary
// that could imply an origin or a destination.
function loopPoint(phase) {
  const cx = LOOP_W / 2;
  const cy = LOOP_H / 2;
  const ax = 30;
  const ay = 9;
  return {
    x: cx + ax * Math.sin(phase),
    y: cy + ay * Math.sin(phase) * Math.cos(phase),
  };
}

export default function BloomProgress({
  label,
  done = 0,
  total = 0,
  indeterminate = false,
  status = 'running',
  elapsed,
  note,
  className = '',
}) {
  const reduced = useReducedMotion();

  const growth = useMemo(() => growthFor({ done, total, indeterminate }), [done, total, indeterminate]);

  // One explicit state, derived once, instead of booleans read in five places.
  const state = status === 'error'
    ? 'error'
    : status === 'success'
      ? 'complete'
      : growth.determinate
        ? 'determinate'
        : 'indeterminate';

  const flyRef = useRef(null);
  const trailRef = useRef(null);
  const rafRef = useRef(0);

  // The loop. Only ever runs in indeterminate, and only with motion allowed.
  useEffect(() => {
    if (reduced || state !== 'indeterminate') return undefined;
    const fly = flyRef.current;
    const trail = trailRef.current;
    if (!fly || !trail) return undefined;

    const segs = Array.from(trail.children);
    const history = [];
    let phase = Math.random() * Math.PI * 2;
    let running = true;
    let last = performance.now();

    const tick = (now) => {
      if (!running) return;
      const dt = Math.min(64, now - last);
      last = now;

      // Speed varies slightly so the loop never reads as a machine tracing a
      // fixed path at a fixed rate.
      const speed = 0.0016 + 0.0005 * Math.sin(now / 2300);
      phase += dt * speed;

      const p = loopPoint(phase);
      // Small drift so successive laps don't overlay exactly.
      const driftY = Math.sin(now / 1900) * 2.2;
      const x = p.x;
      const y = p.y + driftY;

      history.unshift({ x, y });
      if (history.length > TRAIL_POINTS + 1) history.pop();

      // The trail is redrawn from the last N positions every frame, so it can
      // only ever be as long as those N positions. It cannot accumulate into
      // a route no matter how long the scan runs.
      for (let i = 0; i < segs.length; i += 1) {
        const a = history[i];
        const b = history[i + 1];
        if (!a || !b) {
          segs[i].setAttribute('opacity', '0');
          continue;
        }
        segs[i].setAttribute('x1', a.x.toFixed(2));
        segs[i].setAttribute('y1', a.y.toFixed(2));
        segs[i].setAttribute('x2', b.x.toFixed(2));
        segs[i].setAttribute('y2', b.y.toFixed(2));
        segs[i].setAttribute('opacity', (0.34 * (1 - i / segs.length)).toFixed(3));
      }

      const ahead = loopPoint(phase + 0.12);
      const heading = Math.atan2(ahead.y - p.y, ahead.x - p.x) * (180 / Math.PI);
      fly.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(heading * 0.3).toFixed(2)})`);

      rafRef.current = requestAnimationFrame(tick);
    };

    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(rafRef.current);
      } else if (!running) {
        running = true;
        last = performance.now();
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reduced, state]);

  const pct = state === 'complete' ? 100 : Math.round((growth.ratio || 0) * 100);

  // The flying butterfly and its trail are driven imperatively by the rAF loop
  // above (setAttribute on flyRef / trailRef). Memoised so the parent's
  // once-a-second elapsed-clock re-render does NOT reconcile this subtree —
  // otherwise React re-applied the static x1="0" on the trail lines and the
  // fly transform every second, fighting the rAF and making the butterfly jump
  // (the "teleport"). It only depends on `reduced`, which never changes.
  const indeterminateSvg = useMemo(
    () => (
      <svg viewBox={`0 0 ${LOOP_W} ${LOOP_H}`} className="ltb-loop" aria-hidden="true">
        {!reduced && (
          <g ref={trailRef} className="ltb-trail">
            {Array.from({ length: TRAIL_POINTS }).map((_, i) => (
              <line key={i} x1="0" y1="0" x2="0" y2="0" opacity="0" />
            ))}
          </g>
        )}
        <g ref={flyRef} transform={reduced ? `translate(${LOOP_W / 2} ${LOOP_H / 2})` : undefined}>
          <g transform="translate(-15 -15)">
            <Butterfly size={30} flapping />
          </g>
        </g>
      </svg>
    ),
    [reduced]
  );

  return (
    <div className={`ltb-bloom ltb-bloom--${state} ${className}`} role="status" aria-live="polite">
      {state === 'indeterminate' ? (
        indeterminateSvg
      ) : (
        <svg viewBox={`0 0 ${TRACK_W} ${TRACK_H}`} className="ltb-track" aria-hidden="true">
          {/* The available track, neutral and light. */}
          <line x1="8" y1="20" x2={TRACK_W - 8} y2="20" className="ltb-track-rest" />
          {/* Filled to real measured progress only. No smoothing, no easing
              toward a guess. The width is the number. */}
          <line
            x1="8"
            y1="20"
            x2={8 + ((TRACK_W - 16) * (state === 'complete' ? 1 : growth.ratio || 0))}
            y2="20"
            className="ltb-track-fill"
            style={{ transition: reduced ? 'none' : `all ${DUR.settle}ms var(--motion-productive)` }}
          />

          {/* The flower exists only once the work succeeded. */}
          {state === 'complete' && (
            <g className="ltb-flower" transform={`translate(${TRACK_W - 8} 20)`}>
              {[0, 72, 144, 216, 288].map((deg) => (
                <ellipse key={deg} className="ltb-petal" rx="2.4" ry="4.4" cy="-4.6" transform={`rotate(${deg})`} />
              ))}
              <circle r="2.4" className="ltb-flower-core" />
            </g>
          )}

          {/* Butterfly sits at the end of the filled portion; on completion it
              steps aside so it is beside the flower rather than on top of it. */}
          {state !== 'error' && (
            <g
              transform={`translate(${
                state === 'complete'
                  ? TRACK_W - 26
                  : 8 + (TRACK_W - 16) * (growth.ratio || 0)
              } 20)`}
              className="ltb-track-fly"
            >
              <g transform="translate(-15 -15)">
                <Butterfly size={30} flapping={false} />
              </g>
            </g>
          )}
        </svg>
      )}

      <p className="ltb-bloom-label">
        {label}
        {state === 'determinate' && <span className="ltb-bloom-count"> · {Math.min(done, total)} of {total}</span>}
        {state === 'complete' && <span className="ltb-bloom-count"> · done</span>}
      </p>
      {(elapsed || note) && (
        <p className="ltb-bloom-note">
          {elapsed}
          {elapsed && note ? ' · ' : ''}
          {note}
        </p>
      )}
      <span className="sr-only">
        {state === 'determinate' ? `${pct}% complete` : state === 'complete' ? 'Complete' : 'Working'}
      </span>
    </div>
  );
}
