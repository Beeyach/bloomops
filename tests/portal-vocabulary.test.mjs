import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPortalVocabulary } from './_portal-visible.mjs';

test('portal vocabulary ignores harmless implementation identifiers', () => {
  assert.doesNotThrow(() => assertPortalVocabulary('<span class="bo-prospect-garden" id="internal-icon" data-kind="Team">Your account</span>'));
});

for (const markup of [
  '<p>Prospects</p>', '<p>Pro<span>spect</span></p>', '<p>Fin&#97;nce</p>',
  '<button aria-label="Internal settings"></button>', '<img alt="Team workload">',
  '<span title="Legacy records">Account</span>', '<input placeholder="Search prospects">',
  '<input type="button" value="Settings">', '<p aria-description="Internal">Account</p>',
  '<div aria-valuetext="Team"></div>',
]) {
  test(`portal vocabulary rejects actual text or accessible labels: ${markup}`, () => {
    assert.throws(() => assertPortalVocabulary(markup), assert.AssertionError);
  });
}
