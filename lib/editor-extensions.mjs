import { Node } from '@tiptap/core';
import { embedLabel } from './embeds.mjs';

// A callout is a paragraph-holding box. It stores nothing but its own tone, so
// existing documents keep working: a callout with no tone attribute reads as
// 'note', which is what the button inserts.
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: 'note',
        parseHTML: (el) => el.getAttribute('data-tone') || 'note',
        renderHTML: (attrs) => ({ 'data-tone': attrs.tone || 'note' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-callout': '', class: 'ltb-callout' }, 0];
  },

  addCommands() {
    return {
      setCallout:
        (tone = 'note') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { tone }),
      toggleCallout:
        (tone = 'note') =>
        ({ commands }) =>
          commands.toggleWrap(this.name, { tone }),
    };
  },

  addKeyboardShortcuts() {
    return {
      // Backspace at the very start of an empty callout lifts you out of it,
      // otherwise the box becomes a trap you cannot delete from the keyboard.
      Backspace: () => {
        const { empty, $anchor } = this.editor.state.selection;
        if (!empty || $anchor.parent.type.name !== 'paragraph') return false;
        if ($anchor.parentOffset !== 0) return false;
        const parent = $anchor.node(-1);
        if (!parent || parent.type.name !== this.name) return false;
        if (parent.childCount > 1) return false;
        return this.editor.commands.lift(this.name);
      },
    };
  },
});

// A toggle is a real <details>/<summary>, not a div with a click handler.
// That choice is what makes it work on a public page: PublicReader renders
// stored body HTML with no JS of its own, and a native details element is
// still expandable there. A scripted accordion would be dead markup.
//
// Three nodes rather than one, because renderHTML has a single content hole
// and the summary has to be a separate element from the body.
export const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'toggleSummary toggleBody',
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (el) => el.hasAttribute('open'),
        // Only emit the attribute when open — `open="false"` still counts as
        // open to a browser, which would make every toggle expand on a shared
        // page no matter how it was left.
        renderHTML: (attrs) => (attrs.open ? { open: '' } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'details[data-toggle]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['details', { ...HTMLAttributes, 'data-toggle': '', class: 'ltb-toggle' }, 0];
  },

  addCommands() {
    return {
      setToggle:
        () =>
        ({ chain, state }) => {
          // The line you are on becomes the summary, so turning a heading or
          // a paragraph into a toggle keeps the words you already typed.
          const { $from } = state.selection;
          const text = $from.parent.textContent;
          return chain()
            .deleteRange({ from: $from.before(), to: $from.after() })
            .insertContent({
              type: this.name,
              attrs: { open: true },
              content: [
                { type: 'toggleSummary', content: text ? [{ type: 'text', text }] : [] },
                { type: 'toggleBody', content: [{ type: 'paragraph' }] },
              ],
            })
            .run();
        },
    };
  },
});

export const ToggleSummary = Node.create({
  name: 'toggleSummary',
  content: 'inline*',
  defining: true,
  parseHTML() {
    return [{ tag: 'summary' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['summary', { ...HTMLAttributes, class: 'ltb-toggle-summary' }, 0];
  },
  addKeyboardShortcuts() {
    return {
      // Enter in the summary drops into the body rather than making a second
      // summary, which the schema would reject anyway.
      Enter: () => {
        const { $from } = this.editor.state.selection;
        if ($from.parent.type.name !== this.name) return false;
        const pos = $from.after($from.depth) + 1;
        return this.editor.commands.setTextSelection(pos);
      },
    };
  },
});

export const ToggleBody = Node.create({
  name: 'toggleBody',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-toggle-body]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-toggle-body': '', class: 'ltb-toggle-body' }, 0];
  },
});

// A block equation. Stores the LaTeX source and nothing else; the rendered
// markup is derived by the node view here and by the public route there. See
// lib/equations.mjs for why it is not persisted.
export const Equation = Node.create({
  name: 'equation',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-latex') || '',
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex || '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-equation]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    // The source doubles as the fallback: an un-upgraded equation reads as the
    // formula someone typed rather than an empty box.
    return [
      'div',
      { ...HTMLAttributes, 'data-equation': '', class: 'ltb-equation' },
      ['code', {}, node.attrs.latex || ''],
    ];
  },

  addCommands() {
    return {
      setEquation:
        (latex = '') =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    };
  },
});

// Side-by-side columns. Two nodes: a row that holds them and the columns
// themselves, each an ordinary block container so anything that can go in a
// page can go in a column.
//
// The schema says column{2,4} rather than column+ on purpose. A single-column
// row is not a layout, it is a wrapper that looks broken and traps content
// inside itself; the lower bound means ProseMirror repairs one instead of
// letting it exist.
//
// Layout is CSS grid driven by a count attribute, which means it survives on a
// public page: PublicReader renders stored HTML with no JS of ours, and grid
// needs none. It collapses to stacked blocks on a narrow screen, so a client
// opening a shared page on a phone gets readable content rather than four
// unreadable slivers.
export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,4}',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: (el) => Number(el.getAttribute('data-count')) || 2,
        renderHTML: (attrs) => ({ 'data-count': attrs.count || 2 }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-columns]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const n = Math.min(4, Math.max(2, Number(node.attrs.count) || 2));
    return [
      'div',
      {
        ...HTMLAttributes,
        'data-columns': '',
        class: 'ltb-columns',
        style: `--ltb-cols:${n}`,
      },
      0,
    ];
  },

  addCommands() {
    return {
      setColumns:
        (count = 2) =>
        ({ chain, state }) => {
          const n = Math.min(4, Math.max(2, Number(count) || 2));
          // The block you are on becomes the first column, so turning a
          // paragraph into columns keeps what you already wrote.
          const { $from } = state.selection;
          const current = $from.parent.toJSON();
          const keep =
            current && current.content ? current : { type: 'paragraph' };
          return chain()
            .deleteRange({ from: $from.before(), to: $from.after() })
            .insertContent({
              type: this.name,
              attrs: { count: n },
              content: Array.from({ length: n }, (_, i) => ({
                type: 'column',
                content: [i === 0 ? keep : { type: 'paragraph' }],
              })),
            })
            .run();
        },
    };
  },
});

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-column]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-column': '', class: 'ltb-column' }, 0];
  },
});

// A live view of workspace data, dropped into a page. Notion calls these
// database views; here the "database" is a table the app already owns
// (prospects), so a view is useful the moment you insert it instead of being
// an empty grid you have to populate first.
//
// It stores only which view to draw — never any rows. That is deliberate and
// load-bearing: pages.body is what /p/<token> serves to anyone with the link,
// and a board of every prospect on a page shared with a client would hand them
// the whole pipeline. Because the node persists nothing but attributes, a
// public page renders an empty shell no matter what, and the reader fills it
// in only for a signed-in session.
export const DatabaseView = Node.create({
  name: 'databaseView',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      source: {
        default: 'prospects',
        parseHTML: (el) => el.getAttribute('data-source') || 'prospects',
        renderHTML: (attrs) => ({ 'data-source': attrs.source || 'prospects' }),
      },
      view: {
        default: 'board',
        parseHTML: (el) => el.getAttribute('data-view') || 'board',
        renderHTML: (attrs) => ({ 'data-view': attrs.view || 'board' }),
      },
      groupBy: {
        default: 'stage',
        parseHTML: (el) => el.getAttribute('data-group-by') || 'stage',
        renderHTML: (attrs) => ({ 'data-group-by': attrs.groupBy || 'stage' }),
      },
      // Per-block filter and sort, so two views on the same page can show
      // different slices of the same table. JSON in an attribute rather than
      // separate attributes per field: the shape grows as sources gain
      // filterable columns, and one blob keeps the schema stable.
      filter: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-filter') || '',
        renderHTML: (attrs) => (attrs.filter ? { 'data-filter': attrs.filter } : {}),
      },
      sort: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-sort') || '',
        renderHTML: (attrs) => (attrs.sort ? { 'data-sort': attrs.sort } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-database-view]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { ...HTMLAttributes, 'data-database-view': '', class: 'ltb-dbview' },
      // Static fallback text, and the only thing a public reader ever sees.
      ['p', { class: 'ltb-dbview-private' }, 'This view is only visible inside the workspace.'],
    ];
  },

  addCommands() {
    return {
      setDatabaseView:
        (attrs = {}) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

// An embed stores WHAT to show, never the markup that shows it. What lands in
// pages.body is an inert div plus a plain link:
//
//   <div data-embed data-provider="loom" data-url="https://...">
//     <a href="https://..." rel="noopener nofollow">loom.com/share/abc</a>
//   </div>
//
// The editor's node view and the public route each build an iframe from those
// two attributes. Nothing persists an iframe, so a body rendered raw — which
// is exactly what PublicReader does — degrades to a link rather than loading
// third-party content. The anchor is the fallback, the provenance line, and
// the accessible representation all at once.
//
// The React node view is attached in components/EmbedView.jsx so this module
// stays pure and importable from the edge route.
export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      provider: {
        default: 'generic',
        parseHTML: (el) => el.getAttribute('data-provider') || 'generic',
        renderHTML: (attrs) => ({ 'data-provider': attrs.provider || 'generic' }),
      },
      url: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-url') || '',
        renderHTML: (attrs) => ({ 'data-url': attrs.url || '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-embed]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const url = node.attrs.url || '';
    return [
      'div',
      { ...HTMLAttributes, 'data-embed': '', class: 'ltb-embed' },
      ['a', { href: url, rel: 'noopener nofollow', target: '_blank' }, embedLabel(url)],
    ];
  },

  addCommands() {
    return {
      setEmbed:
        ({ provider, url }) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { provider, url } }),
    };
  },
});
