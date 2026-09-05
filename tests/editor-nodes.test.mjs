import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateHTML, generateJSON } from '@tiptap/html/server';
import { parseHTML } from 'zeed-dom';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import {
  Callout,
  Toggle,
  ToggleSummary,
  ToggleBody,
  Columns,
  Column,
  DatabaseView,
  Embed,
} from '../lib/editor-extensions.mjs';

// Page bodies are stored as HTML, so every custom node has to survive the
// trip out to pages.body and back. That path was previously only exercisable
// by hand in a browser, which meant "does a filter survive a reload" could not
// be answered without clicking. It can be answered here.
//
// @tiptap/html/server runs ProseMirror's real parser and serializer against a
// DOM shim, so these are the same code paths the editor uses — not a
// re-implementation that could agree with itself while disagreeing with the
// app.

const EXTENSIONS = [
  Document,
  Paragraph,
  Text,
  Callout,
  Toggle,
  ToggleSummary,
  ToggleBody,
  Columns,
  Column,
  DatabaseView,
  Embed,
];

// Store → parse → re-store. Anything lost in the middle is a bug you would
// otherwise only find after a page reload ate someone's work.
function roundTrip(html) {
  const json = generateJSON(html, EXTENSIONS);
  return { json, html: generateHTML(json, EXTENSIONS) };
}

function firstNode(json) {
  return json.content?.[0];
}

test('database view keeps its source, view, filter and sort', () => {
  const stored =
    '<div data-database-view data-source="clients" data-view="calendar" ' +
    'data-filter="{&quot;stage&quot;:[&quot;Active&quot;]}" data-sort="title:desc"></div>';
  const { json, html } = roundTrip(stored);
  const attrs = firstNode(json).attrs;

  assert.equal(attrs.source, 'clients');
  assert.equal(attrs.view, 'calendar');
  assert.equal(attrs.sort, 'title:desc');
  assert.deepEqual(JSON.parse(attrs.filter), { stage: ['Active'] });

  // And they come back out, which is what makes a configured block survive a
  // reload rather than reverting to an unfiltered default.
  assert.match(html, /data-source="clients"/);
  assert.match(html, /data-view="calendar"/);
  assert.match(html, /data-sort="title:desc"/);
  assert.match(html, /data-filter=/);
});

test('a database view never carries rows into the document', () => {
  // The security property the whole design rests on: pages.body is served to
  // anyone holding a /p/<token> link, so a view must persist its
  // configuration and nothing else.
  const stored = '<div data-database-view data-source="prospects" data-view="board"></div>';
  const { html } = roundTrip(stored);
  assert.ok(!/Alpha|prospect-\d|@/.test(html), 'no row data may appear');
  assert.match(html, /only visible inside the workspace/);
});

test('an embed persists as an inert link, never an iframe', () => {
  // If this ever fails, a shared page has started shipping live third-party
  // frames chosen by whatever is in the document.
  const stored =
    '<div data-embed data-provider="loom" data-url="https://www.loom.com/share/abc123">' +
    '<a href="https://www.loom.com/share/abc123">loom.com/share/abc123</a></div>';
  const { json, html } = roundTrip(stored);
  const attrs = firstNode(json).attrs;

  assert.equal(attrs.provider, 'loom');
  assert.equal(attrs.url, 'https://www.loom.com/share/abc123');
  assert.ok(!/<iframe/i.test(html), 'stored HTML must never contain an iframe');
  assert.match(html, /<a[^>]+href="https:\/\/www\.loom\.com\/share\/abc123"/);
});

test('a toggle keeps its summary, body and open state', () => {
  const stored =
    '<details data-toggle open><summary>Click to expand</summary>' +
    '<div data-toggle-body><p>Hidden content.</p></div></details>';
  const { json, html } = roundTrip(stored);
  const node = firstNode(json);

  assert.equal(node.type, 'toggle');
  assert.equal(node.attrs.open, true);
  assert.equal(node.content[0].type, 'toggleSummary');
  assert.equal(node.content[1].type, 'toggleBody');
  assert.match(html, /<details[^>]*open/);
  assert.match(html, /<summary[^>]*>Click to expand<\/summary>/);
  assert.match(html, /Hidden content\./);
});

test('a closed toggle does not reopen itself', () => {
  // open="false" still counts as open to a browser, so a closed toggle has to
  // serialize with the attribute absent or every shared page expands.
  const stored =
    '<details data-toggle><summary>Closed</summary><div data-toggle-body><p>x</p></div></details>';
  const { json, html } = roundTrip(stored);
  assert.equal(firstNode(json).attrs.open, false);
  assert.ok(!/\bopen\b/.test(html), `closed toggle must not emit open: ${html}`);
});

test('columns keep their count and their children', () => {
  const stored =
    '<div data-columns data-count="3">' +
    '<div data-column><p>One</p></div>' +
    '<div data-column><p>Two</p></div>' +
    '<div data-column><p>Three</p></div>' +
    '</div>';
  const { json, html } = roundTrip(stored);
  const node = firstNode(json);

  assert.equal(node.type, 'columns');
  assert.equal(node.attrs.count, 3);
  assert.equal(node.content.length, 3);
  assert.match(html, /--ltb-cols:\s*3/);
  assert.equal((html.match(/data-column=/g) || []).length, 3);
});

test('a one-column row is repaired rather than stored', () => {
  // column{2,4} exists so a single column cannot survive: it is not a layout,
  // it is a wrapper that traps whatever is inside it.
  const stored = '<div data-columns data-count="2"><div data-column><p>Lonely</p></div></div>';
  const { json } = roundTrip(stored);
  const node = firstNode(json);
  if (node.type === 'columns') {
    assert.ok(node.content.length >= 2, 'schema must not allow a single column');
  }
  // Either way the content itself must not be lost.
  assert.match(JSON.stringify(json), /Lonely/);
});

test('a callout keeps its tone', () => {
  const { json, html } = roundTrip('<div data-callout data-tone="warning"><p>Careful.</p></div>');
  assert.equal(firstNode(json).attrs.tone, 'warning');
  assert.match(html, /data-tone="warning"/);
});

test('markup in an attribute stays inert through serialization', () => {
  // The serializer escapes the quote but leaves < and >, which is correct:
  // inside a quoted attribute value only the quote can break out. Asserting
  // the substring "<script" is absent would be testing the wrong thing — what
  // matters is that re-parsing yields no script element.
  const stored =
    '<div data-embed data-provider="loom&quot;&gt;&lt;script&gt;" data-url="https://www.loom.com/share/a"></div>';
  const { html } = roundTrip(stored);

  const reparsed = parseHTML(html);
  assert.equal(reparsed.querySelectorAll('script').length, 0, 'no script element may be created');

  // And the value survives as text rather than becoming structure.
  const div = reparsed.querySelector('[data-embed]');
  assert.equal(div.getAttribute('data-provider'), 'loom"><script>');
});
