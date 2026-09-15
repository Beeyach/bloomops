import assert from 'node:assert/strict';
import { parseHTML } from 'zeed-dom';

// Inspect rendered copy and accessible labels, not CSS/data identifiers. Keep
// hidden DOM text conservative too: it must not carry internal-only content.
export function assertPortalVocabulary(html) {
  const dom = parseHTML(html);
  for (const node of dom.querySelectorAll('script, style, template')) node.remove();
  const copy = [dom.textContent];
  for (const node of dom.querySelectorAll('*')) {
    for (const attr of ['aria-label', 'aria-description', 'aria-valuetext', 'alt', 'title', 'placeholder']) {
      copy.push(node.getAttribute(attr) || '');
    }
    if (node.tagName === 'INPUT') copy.push(node.getAttribute('value') || '');
  }
  assert.doesNotMatch(copy.join('\n'), /Onboarding|Finance|Settings|Team|Prospect|legacy|workload|internal/i);
}
