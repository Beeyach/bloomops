// LaTeX rendering, kept in one place so the editor and the public route agree
// on what an equation looks like.
//
// Only the LaTeX source is ever stored in a page. Rendered KaTeX markup is
// derived on both ends rather than persisted, for the same reason an embed
// stores a URL instead of an iframe: pages.body is served raw to anyone with a
// /p/<token> link, and a document that carries renderable HTML is a document
// that can be hand-edited into carrying anything.

// Deliberately imports nothing. A static `import katex` here would pull 270KB
// into the client bundle for every page, because importing any one symbol
// from a module drags the whole module in — the lazy import in EquationNode
// would achieve nothing. The server-side entry point is equations-server.mjs.

// One options object for both ends, so an equation cannot render differently
// in the editor than on the page a client opens.
//
// throwOnError:false makes KaTeX emit its own error markup for bad input,
// which we read back: a half-written formula should show what is wrong in
// place rather than blowing up the page or silently vanishing.
//
// trust:false because \includegraphics and \href can pull in external URLs,
// and nothing in a notes app needs that — it would put a network fetch, and a
// third-party request, inside a shared page.
export const KATEX_OPTIONS = {
  throwOnError: false,
  output: 'html',
  strict: false,
  trust: false,
  maxSize: 50,
  maxExpand: 500,
};

// Takes the library rather than closing over the import, so the client can
// load KaTeX lazily and still render exactly what the server would.
export function renderWith(katexLib, latex, { display = true } = {}) {
  const src = String(latex || '').trim();
  if (!src) return { ok: false, html: '', error: 'Empty equation' };
  if (!katexLib) return { ok: false, html: '', error: 'loading' };
  try {
    const html = katexLib.renderToString(src, { ...KATEX_OPTIONS, displayMode: display });
    return { ok: true, html, error: '' };
  } catch (e) {
    return { ok: false, html: '', error: e?.message || 'Could not render that equation' };
  }
}


// KaTeX marks unparseable spans with this class. Surfacing it lets the editor
// tell you the formula is wrong while still showing what it managed to draw.
export function hasRenderError(html) {
  return /katex-error/.test(String(html || ''));
}
