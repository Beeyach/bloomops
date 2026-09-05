// Rendering stored equations for a public page.
//
// Same shape as public-embeds: the document holds inert source, and the server
// upgrades it on the way out. An equation that is not upgraded still reads as
// the LaTeX someone typed, so every failure mode degrades to legible text
// rather than an empty box.
//
// This is the one place KaTeX is pulled into the edge bundle. If worker size
// ever becomes a problem, deleting the call in app/api/public/[token]/route.js
// drops it and public pages fall back to showing the source.

import { renderEquation } from './equations-server.mjs';

const EQUATION_BLOCK = /<div\b([^>]*\bdata-equation\b[^>]*)>([\s\S]*?)<\/div>/gi;

function attrFrom(tagAttrs, name) {
  const m = tagAttrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

function unesc(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function renderEquationsForPublic(bodyHtml) {
  const html = String(bodyHtml || '');
  if (!html.includes('data-equation')) return html;

  return html.replace(EQUATION_BLOCK, (whole, tagAttrs) => {
    const latex = unesc(attrFrom(tagAttrs, 'data-latex'));
    const { ok, html: rendered } = renderEquation(latex, { display: true });
    // Leave the block exactly as stored when it will not render — the source
    // is already inside it.
    if (!ok) return whole;
    return `<div class="ltb-equation" data-equation>${rendered}</div>`;
  });
}
