'use client';

// The four visual atoms Chapter 10 adds, all reading from lib/semantic.mjs.
//
// The point of putting them here rather than inlining a coloured span at each
// call site is that a reply then looks identical on Today, in the drawer and
// in the prospect list — and that changing what "waiting" looks like is one
// edit rather than eleven.
//
// None of them accepts a colour. They accept a *kind* (or, at most, a tone),
// and the colour follows from that. A component that could pick its own
// colour is a component that will eventually pick a different one.

import { Icon } from './Icons';
import { kindOf, TONE } from '@/lib/semantic.mjs';

// Point the three --tone-* variables at one family. Every class below reads
// them, so this is the only place a family name becomes a colour.
const vars = (tone) => ({
  '--tone-ink': `var(--tone-${tone}-ink)`,
  '--tone-bg': `var(--tone-${tone}-bg)`,
  '--tone-line': `var(--tone-${tone}-line)`,
});

// A concept's icon in a flat square. The head of a card or a row: it says
// what kind of thing this is before a single word has been read.
export function Tile({ kind, tone, icon, size = 38, className = '', title }) {
  const k = kind ? kindOf(kind) : null;
  const t = tone || k?.tone || TONE.NEUTRAL;
  const glyph = icon || k?.icon || 'circle';
  return (
    <span
      className={`tile ${className}`}
      style={{ ...vars(t), width: size, height: size }}
      title={title}
      aria-hidden="true"
    >
      <Icon name={glyph} className="w-[55%] h-[55%]" strokeWidth={2} />
    </span>
  );
}

// A compact state, as icon + word. Never colour alone: the word is always
// there, so greyscale and colour-blind readers lose nothing.
//
// `children` overrides the vocabulary's label where a surface has something
// more specific to say ("Email 2 due" rather than "Due"), but the icon and
// the colour still come from the kind.
export function Pill({ kind, tone, icon, children, className = '', title }) {
  const k = kind ? kindOf(kind) : null;
  const t = tone || k?.tone || TONE.NEUTRAL;
  const glyph = icon === null ? null : (icon || k?.icon);
  const text = children ?? k?.label;
  return (
    <span className={`pill ${className}`} style={vars(t)} title={title}>
      {glyph && <Icon name={glyph} className="w-[13px] h-[13px] shrink-0" strokeWidth={2.2} />}
      {text}
    </span>
  );
}

// One fact, as icon + value. "3d" beside a clock instead of "Waiting 3 days":
// the icon carries the noun so the text only has to carry the number.
export function Meta({ icon, children, className = '', title, label }) {
  if (children == null || children === '') return null;
  return (
    <span className={`meta-item ui-meta text-ink-2 ${className}`} title={title || label}>
      {icon && <Icon name={icon} className="w-[13px] h-[13px] shrink-0 opacity-80" strokeWidth={2} />}
      {/* The screen-reader text says the noun the icon is standing in for,
          so "3d" is not read out as a bare number. */}
      {label && <span className="sr-only">{label}: </span>}
      <span className="num-tabular">{children}</span>
    </span>
  );
}

// A monogram for a business with no favicon: two letters in the brand family,
// so a card always has something in its left column and rows never start with
// a ragged empty square.
export function Monogram({ name, size = 38, className = '' }) {
  const letters = String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';
  return (
    <span
      className={`tile font-semibold ${className}`}
      style={{ ...vars(TONE.BRAND), width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {letters}
    </span>
  );
}
