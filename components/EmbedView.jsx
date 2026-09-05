'use client';

import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Embed } from '../lib/editor-extensions.mjs';
import { embedUrlFor, embedLabel, getProvider } from '../lib/embeds.mjs';
import { Icon } from './Icons';

// How an embed looks inside the editor. The public page does its own thing —
// see the HTMLRewriter pass in app/api/public/[token]/route.js.
//
// The src is rebuilt from the registry on every render rather than read from
// the document, so a hand-edited body cannot put an arbitrary URL in a frame.
// If the registry refuses, we show the link and say why.

// allow-same-origin sits next to allow-scripts deliberately. It is only
// dangerous when the framed page shares OUR origin, and matchEmbed rejects
// that outright — meanwhile Loom, Docs and Instagram all need their own
// storage to work at all.
export const EMBED_SANDBOX =
  'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation';

function EmbedComponent({ node, selected }) {
  const { provider, url } = node.attrs;
  const selfHost = typeof window !== 'undefined' ? window.location.hostname : null;
  const src = embedUrlFor(provider, url, selfHost);
  const meta = getProvider(provider);
  const label = embedLabel(url);

  // Recognised but unframeable (X), or a URL the registry no longer trusts.
  if (!src) {
    return (
      <NodeViewWrapper
        className={`ltb-embed ltb-embed--link ${selected ? 'is-selected' : ''}`}
        data-provider={provider}
      >
        <a href={url} target="_blank" rel="noopener nofollow" className="ltb-embed-card">
          <Icon name="link" className="w-4 h-4 shrink-0" />
          <span className="truncate">{label}</span>
          <span className="ltb-embed-provider">{meta?.label || 'Link'}</span>
        </a>
      </NodeViewWrapper>
    );
  }

  const frameStyle = meta?.height
    ? { height: `${meta.height}px` }
    : { aspectRatio: meta?.aspect || '16/9' };

  return (
    <NodeViewWrapper
      className={`ltb-embed ${selected ? 'is-selected' : ''}`}
      data-provider={provider}
    >
      <div className="ltb-embed-frame" style={frameStyle}>
        <iframe
          src={src}
          title={`${meta?.label || 'Embed'}: ${label}`}
          sandbox={EMBED_SANDBOX}
          referrerPolicy="no-referrer"
          loading="lazy"
          allowFullScreen={Boolean(meta?.allowFullscreen)}
        />
      </div>
      {/* Provenance stays visible: you can always see, and open, what this is. */}
      <a href={url} target="_blank" rel="noopener nofollow" className="ltb-embed-caption">
        {label}
      </a>
    </NodeViewWrapper>
  );
}

export const EmbedWithView = Embed.extend({
  addNodeView() {
    return ReactNodeViewRenderer(EmbedComponent);
  },
});
