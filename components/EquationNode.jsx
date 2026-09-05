'use client';

import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Equation } from '../lib/editor-extensions.mjs';
import { renderWith, hasRenderError } from '../lib/equations.mjs';

// KaTeX is ~270KB and most pages have no equations on them, so it is fetched
// the first time one is actually rendered rather than shipped in the bundle
// every page load. Cached at module scope: the second equation on a page, and
// every page after, gets it immediately.
let katexPromise = null;
function loadKatex() {
  if (!katexPromise) katexPromise = import('katex').then((m) => m.default || m);
  return katexPromise;
}

// Click an equation to edit its source, click away to render it. There is no
// separate "edit" affordance because the formula IS the affordance — the same
// way a paragraph is edited by clicking the words.
//
// The rendered markup comes from KaTeX at display time, never from the
// document, so nothing renderable is stored in the page.

function EquationComponent({ node, updateAttributes, editor, selected }) {
  const [editing, setEditing] = useState(!node.attrs.latex);
  const [draft, setDraft] = useState(node.attrs.latex || '');
  const [katexLib, setKatexLib] = useState(null);
  const areaRef = useRef(null);

  useEffect(() => {
    if (editing) areaRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    let alive = true;
    loadKatex().then((k) => alive && setKatexLib(k)).catch(() => {});
    return () => { alive = false; };
  }, []);

  function commit() {
    setEditing(false);
    if (draft !== node.attrs.latex) {
      updateAttributes({ latex: draft });
      // Configuration lives in the document, so it saves on its own terms
      // rather than waiting for the editor to blur. Same reason database
      // views call this.
      setTimeout(() => editor?.storage?.requestSave?.(), 0);
    }
  }

  if (editing) {
    return (
      <NodeViewWrapper className="ltb-equation is-editing" contentEditable={false}>
        <textarea
          ref={areaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            // Enter commits, Shift+Enter keeps a newline for multi-line
            // environments like align. Escape abandons the edit.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(node.attrs.latex || '');
              setEditing(false);
            }
          }}
          rows={Math.min(6, draft.split('\n').length || 1)}
          placeholder="E = mc^2"
          spellCheck={false}
          className="ltb-equation-input"
        />
        <div className="ltb-equation-hint">LaTeX · Enter to render · Shift+Enter for a new line</div>
      </NodeViewWrapper>
    );
  }

  const { ok, html, error } = renderWith(katexLib, node.attrs.latex, { display: true });
  // "loading" is not a broken formula — it is KaTeX still arriving, and the
  // source shows in the meantime.
  const loading = !ok && error === 'loading';
  const broken = !loading && (!ok || hasRenderError(html));

  return (
    <NodeViewWrapper
      className={`ltb-equation${selected ? ' is-selected' : ''}${broken ? ' is-broken' : ''}`}
      contentEditable={false}
    >
      <div
        role="button"
        tabIndex={0}
        title="Click to edit"
        onClick={() => { setDraft(node.attrs.latex || ''); setEditing(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { setDraft(node.attrs.latex || ''); setEditing(true); } }}
        className="ltb-equation-render"
        // KaTeX output, generated here from the stored source. Not document
        // content, and never read back out of the page.
        dangerouslySetInnerHTML={ok ? { __html: html } : undefined}
      >
        {ok ? undefined : <code>{node.attrs.latex || 'Empty equation'}</code>}
      </div>
      {broken && <div className="ltb-equation-error">{error || 'Check this formula'}</div>}
      {loading && <div className="ltb-equation-hint">Rendering…</div>}
    </NodeViewWrapper>
  );
}

export const EquationWithView = Equation.extend({
  addNodeView() {
    return ReactNodeViewRenderer(EquationComponent);
  },
});
