// Server-side equation rendering. Split from equations.mjs purely so that
// importing the shared options or renderWith from a client component does not
// drag KaTeX into the browser bundle — ES imports are all-or-nothing per
// module, so the split is the only way to keep the client lazy.
//
// Only the public route imports this, which is also the only place KaTeX ends
// up in the edge bundle.

import katex from 'katex';
import { renderWith } from './equations.mjs';

export function renderEquation(latex, opts) {
  return renderWith(katex, latex, opts);
}
