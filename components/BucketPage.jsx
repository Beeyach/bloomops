'use client';

import { Icon } from './Icons';
import ExceptionQueue from './ExceptionQueue';
import ApprovalQueue from './ApprovalQueue';
import HeldPanel from './HeldPanel';
import { bucketForView } from '@/lib/today-buckets.mjs';
import { bucketHelp } from '@/lib/help-copy.mjs';

// One bucket, in full.
//
// Deliberately thin. Every list here is the same component Today renders a
// preview of, told to show everything: the actions, the wording and the row
// layout are identical because they are literally the same code. A second
// implementation of "approve this package" is how two screens start disagreeing
// about what approving means.

export default function BucketPage({ view, onBack, onOpen }) {
  const def = bucketForView(view);
  if (!def) return null;
  const why = bucketHelp(def.id);

  return (
    // Capped, because a bucket row stretched across a wide monitor puts the
    // name and its action a foot apart and turns a list into a search.
    <section className="mt-2 w-full max-w-[860px]">
      {/* Where you are, and the way back. Not everybody uses the browser's
          back button, and after acting on a row it should not be the only way
          to return to the list you were working. */}
      <nav aria-label="Breadcrumb" className="mb-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink transition"
        >
          <Icon name="chevron-left" className="w-3.5 h-3.5" />
          Today
        </button>
        {/* The trail stops at the way back. Naming this page here as well put
            the same words on three consecutive lines on the Held screen: once
            in the crumb, once as the heading, once in the panel's own header.
            The heading below is what says where you are. */}
      </nav>

      <header className="mb-4">
        <h1 className="text-[20px] font-semibold text-ink">{def.title}</h1>
        <p className="text-[13px] text-ink-2 mt-0.5">{def.blurb}</p>

        {/* Bucket-level, closed by default, and never repeated per row.
            "Why is this person here" is a question about the pile, and
            answering it on every card is how a list becomes an essay. */}
        {why ? (
          <details className="mt-2">
            <summary className="cursor-pointer inline-block text-[12.5px] font-medium text-ink-2 underline decoration-dotted underline-offset-2 hover:text-rose-text transition">
              Why is this here?
            </summary>
            <p className="mt-1.5 text-[13px] text-ink-2 leading-relaxed max-w-[62ch]">{why}</p>
          </details>
        ) : null}
      </header>

      {def.id === 'approvals' ? (
        <ApprovalQueue onOpen={onOpen} full />
      ) : def.id === 'held' ? (
        <HeldPanel onOpen={onOpen} full />
      ) : (
        <ExceptionQueue onOpen={onOpen} only={def.id} />
      )}
    </section>
  );
}
