'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { promptDialog } from '../lib/dialog.mjs';
import { marked } from 'marked';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import { isTextSelection } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/react/menus';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import BlockInsertMenu from './BlockInsertMenu';
import { DatabaseViewWithView } from './DatabaseViewNode';
import { EquationWithView } from './EquationNode';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import { TableKit } from '@tiptap/extension-table';
import Highlight from '@tiptap/extension-highlight';
import { Callout, Toggle, ToggleSummary, ToggleBody, Columns, Column } from '../lib/editor-extensions.mjs';
import { EmbedWithView } from './EmbedView';
import { matchEmbed, isFacebookShare } from '../lib/embeds.mjs';
import { Icon } from './Icons';

import { toast } from '../lib/toast.mjs';
// Markdown paste, Obsidian-style: pasted plain text that carries md
// structure (headings, lists, bold, fences, links) converts to rich blocks.
function looksLikeMarkdown(text) {
  return (
    /^#{1,6}\s.+/m.test(text) ||
    /^[-*]\s.+/m.test(text) ||
    /^\d+\.\s.+/m.test(text) ||
    /^>\s.+/m.test(text) ||
    /^```/m.test(text) ||
    /^\|.*\|\s*$/m.test(text) ||
    /\*\*[^*\n]+\*\*/.test(text) ||
    /\[[^\]\n]+\]\([^)\n]+\)/.test(text)
  );
}

// Notion-style rich text editor: a borderless page canvas, not a form box.
// Formatting lives in the selection bubble (highlight text and it pops up)
// and typed shortcuts: "# " heading, "- " bullet, "1. " numbered, "> "
// quote, "```" code. Images paste/drop/insert inline (compressed to a data
// URL); pasting a YouTube link embeds the player. Content is stored as
// HTML in pages.body; saves fire on focusout of the wrapper.
// Marks are square icon buttons; the block-type control is the only wide thing
// in the bar, which is what gives the panel a readable shape instead of an
// undifferentiated row of chips.
const BTN =
  'w-7 h-7 inline-flex items-center justify-center rounded-[6px] text-[12px] font-medium text-ink-2 hover:bg-hover-wash-soft transition';
const BTN_ON =
  'w-7 h-7 inline-flex items-center justify-center rounded-[6px] text-[12px] font-medium text-rose-text bg-rose-tint transition';

function ToolButton({ onClick, active, children, title }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={active ? BTN_ON : BTN}
    >
      {children}
    </button>
  );
}

// The menu row shares PageView's page-options styling so a menu opened from the
// editor and one opened from the page header feel like the same object.
const MENU_ITEM =
  'flex items-center gap-2.5 w-full pl-3 pr-2 py-1.5 rounded-[7px] text-left text-[13px] text-ink-2 hover:bg-hover-wash-soft transition';

// Every block you can turn the current one into, in the order they escalate:
// plain text, then headings, then the list family, then the boxed forms.
// `is` reads from the active snapshot rather than the editor so it stays in
// step with the rest of the toolbar.
const BLOCK_TYPES = [
  { id: 'paragraph', label: 'Text', is: (a) => a.blockType === 'paragraph', run: (c) => c.setParagraph() },
  { id: 'h1', label: 'Heading 1', is: (a) => a.h1, run: (c) => c.toggleHeading({ level: 1 }) },
  { id: 'h2', label: 'Heading 2', is: (a) => a.h2, run: (c) => c.toggleHeading({ level: 2 }) },
  { id: 'h3', label: 'Heading 3', is: (a) => a.h3, run: (c) => c.toggleHeading({ level: 3 }) },
  { id: 'h4', label: 'Heading 4', is: (a) => a.h4, run: (c) => c.toggleHeading({ level: 4 }) },
  { id: 'bulletList', label: 'Bulleted list', is: (a) => a.bulletList, run: (c) => c.toggleBulletList() },
  { id: 'orderedList', label: 'Numbered list', is: (a) => a.orderedList, run: (c) => c.toggleOrderedList() },
  { id: 'taskList', label: 'To-do list', is: (a) => a.taskList, run: (c) => c.toggleTaskList() },
  { id: 'toggle', label: 'Toggle list', is: (a) => a.toggle, run: (c) => c.setToggle() },
  { id: 'blockquote', label: 'Quote', is: (a) => a.blockquote, run: (c) => c.toggleBlockquote() },
  { id: 'callout', label: 'Callout', is: (a) => a.callout, run: (c) => c.toggleCallout('note') },
  { id: 'codeBlock', label: 'Code', is: (a) => a.codeBlock, run: (c) => c.toggleCodeBlock() },
];

// Paragraph is the fallback, never a candidate to test first. A list item, a
// quote and a callout all contain a paragraph, so isActive('paragraph') is
// true inside them — checking Text first made the control report "Text" for
// every one of them.
function currentBlock(active) {
  return BLOCK_TYPES.slice(1).find((b) => b.is(active)) || BLOCK_TYPES[0];
}

// TipTap v3 does not re-render React on transactions (shouldRerenderOnTransaction
// defaults to false), so reading editor.isActive() straight in render returns the
// state the editor had when it mounted. Every active flag has to come through
// useEditorState or the toolbar lies: the B never lights up, and the table
// buttons — gated on isActive('table') — never appear at all.
function Tools({ editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      h4: e.isActive('heading', { level: 4 }),
      toggle: e.isActive('toggle'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      taskList: e.isActive('taskList'),
      callout: e.isActive('callout'),
      blockquote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      highlight: e.isActive('highlight'),
      table: e.isActive('table'),
      embed: e.isActive('embed'),
      blockType: e.isActive('paragraph') ? 'paragraph' : '',
    }),
  });
  const [menuOpen, setMenuOpen] = useState(false);

  // Close on Escape. Clicking a block type closes it too, and clicking away
  // dismisses the whole bubble, so there is no outside-click handler to keep
  // in sync with the menu's own lifetime.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  if (!editor || !active) return null;
  const c = () => editor.chain().focus();
  const block = currentBlock(active);

  async function insertEmbed() {
    const raw = await promptDialog({
      title: 'Embed a link',
      placeholder: 'Paste a Loom, Figma, Google Docs, Maps, Instagram or Facebook link',
      confirmLabel: 'Embed',
    });
    if (!raw || !raw.trim()) return;
    const selfHost = typeof window !== 'undefined' ? window.location.hostname : null;
    const resolved = await resolveShareLink(raw.trim());
    if (!resolved) {
      toast("That Facebook share link didn't resolve. Open the post, click its timestamp, and use the link from the address bar.", { tone: 'error' });
      return;
    }
    const hit = matchEmbed(resolved, selfHost);
    // matchEmbed already rejected non-https, our own host, and anything
    // unparseable — so there is one message to give and one reason.
    if (!hit) {
      toast('That needs to be an https link to somewhere other than this site.', { tone: 'error' });
      return;
    }
    editor.chain().focus().setEmbed({ provider: hit.provider, url: hit.url }).run();
  }

  return (
    <>
      {/* Names the block you are standing in, rather than offering nine
          buttons and telling you nothing. Only possible now that the toolbar
          re-renders on transactions. */}
      <div className="relative">
        <button
          type="button"
          title="Change this block"
          aria-expanded={menuOpen}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setMenuOpen((v) => !v)}
          className={`h-7 pl-2.5 pr-1.5 inline-flex items-center gap-1 rounded-[6px] text-[12px] font-medium transition ${
            menuOpen ? 'text-rose-text bg-rose-tint' : 'text-ink hover:bg-hover-wash-soft'
          }`}
        >
          {block.label}
          <Icon name="chevron-down" className="w-3 h-3 opacity-60" />
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-9 z-50 glass-panel !bg-panel p-1.5 min-w-[186px] max-h-[300px] overflow-y-auto">
            {BLOCK_TYPES.map((b) => (
              <button
                key={b.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { b.run(c()).run(); setMenuOpen(false); }}
                className={MENU_ITEM + (b.id === block.id ? ' text-rose-text' : '')}
              >
                <span className="flex-1">{b.label}</span>
                {b.id === block.id && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={2.5} />}
              </button>
            ))}
            <div className="h-px bg-line my-1.5 mx-1" />
            <div className="px-3 pb-1 text-[11px] font-medium text-ink-3 uppercase tracking-wide">Insert</div>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setMenuOpen(false); }} className={MENU_ITEM}>
              <Icon name="table" className="w-3.5 h-3.5" />
              Table
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { insertEmbed(); setMenuOpen(false); }} className={MENU_ITEM}>
              <Icon name="link" className="w-3.5 h-3.5" />
              Embed a link
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { c().setHorizontalRule().run(); setMenuOpen(false); }} className={MENU_ITEM}>
              <span className="w-3.5 text-center leading-none">—</span>
              Divider
            </button>
          </div>
        )}
      </div>
      <span className="w-px h-4 bg-line mx-1" />
      <ToolButton title="Bold (Ctrl+B)" onClick={() => c().toggleBold().run()} active={active.bold}><b>B</b></ToolButton>
      <ToolButton title="Italic (Ctrl+I)" onClick={() => c().toggleItalic().run()} active={active.italic}><i>I</i></ToolButton>
      <ToolButton title="Underline (Ctrl+U)" onClick={() => c().toggleUnderline().run()} active={active.underline}><u>U</u></ToolButton>
      <ToolButton title="Strikethrough" onClick={() => c().toggleStrike().run()} active={active.strike}><s>S</s></ToolButton>
      <ToolButton title="Inline code" onClick={() => c().toggleCode().run()} active={active.code}>{'<>'}</ToolButton>
      <ToolButton title="Highlight" onClick={() => c().toggleHighlight().run()} active={active.highlight}>
        <span className="px-1 rounded-[3px]" style={{ background: 'var(--highlight-wash)' }}>H</span>
      </ToolButton>

      {/* Table controls only exist while you are in a table, so they get their
          own row rather than stretching the bar for everyone else. */}
      {active.table && (
        <div className="basis-full flex items-center gap-0.5 pt-1 mt-1 border-t border-line">
          <span className="pl-1 pr-1.5 text-[11px] font-medium text-ink-3 uppercase tracking-wide">Table</span>
          <ToolButton title="Add a column" onClick={() => c().addColumnAfter().run()}>+</ToolButton>
          <ToolButton title="Delete this column" onClick={() => c().deleteColumn().run()}>−</ToolButton>
          <span className="w-px h-4 bg-line mx-0.5" />
          <ToolButton title="Add a row" onClick={() => c().addRowAfter().run()}>
            <span className="rotate-90 leading-none">+</span>
          </ToolButton>
          <ToolButton title="Delete this row" onClick={() => c().deleteRow().run()}>
            <span className="rotate-90 leading-none">−</span>
          </ToolButton>
          <span className="w-px h-4 bg-line mx-0.5" />
          <ToolButton title="Delete the whole table" onClick={() => c().deleteTable().run()}>
            <Icon name="trash" className="w-3.5 h-3.5" />
          </ToolButton>
        </div>
      )}
    </>
  );
}

// Plain-text bodies from before the rich editor become paragraphs.
function toHtml(body) {
  const s = String(body || '');
  if (!s.trim()) return '';
  if (s.trimStart().startsWith('<')) return s;
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return s.split('\n').map((line) => `<p>${esc(line)}</p>`).join('');
}

// Pasted/dropped images are resized and re-encoded client-side so a phone
// screenshot doesn't blow up the page row. Stored inline as a data URL.
async function fileToDataUrl(file) {
  if (!file || !file.type.startsWith('image/')) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const MAX = 1280;
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return null;
  }
}

function imageFilesFrom(dataTransfer) {
  return [...(dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
}

// A pasted URL only becomes an embed when it lands on a line of its own.
// Pasting a link into the middle of a sentence should stay a link — the block
// version would swallow the sentence you were writing.
function isOnEmptyParagraph(view) {
  const { selection } = view.state;
  if (!selection.empty) return false;
  const parent = selection.$from.parent;
  return parent.type.name === 'paragraph' && parent.content.size === 0;
}

// Only named providers auto-convert. A bare https link to anywhere else stays
// text (the toolbar button is the deliberate path for those), and providers we
// recognise but cannot frame — X — are left alone too, since the block could
// only ever show the link it already was. YouTube isn't in the registry, so it
// falls through to its own extension's paste rule untouched.
function embedFromPastedText(text, selfHost) {
  const trimmed = String(text || '').trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const match = matchEmbed(trimmed, selfHost);
  if (!match || match.provider === 'generic' || !match.embedUrl) return null;
  return match;
}

// A Facebook share link has to be expanded before it can be embedded — see
// the note in lib/embeds.mjs. Returns the URL to actually use, or null if the
// link could not be resolved, so callers never insert a block that is going to
// render "this post is no longer available".
async function resolveShareLink(url) {
  if (!isFacebookShare(url)) return url;
  try {
    const res = await fetch('/api/embed/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
}

export default function RichEditor({
  value, onSave, placeholder, onReady,
  // Notion-style inline triggers: "/" opens the block menu, "@" mentions a
  // prospect or another page. All optional — the editor works without them.
  prospects = [], allPages = [], onOpenProspect, onOpenPage,
}) {
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const fileInputRef = useRef(null);
  const rootRef = useRef(null);
  // {left, top, range} for "/", {left, top, at} for "@" — caret-anchored.
  const [slash, setSlash] = useState(null);
  const [mention, setMention] = useState(null);
  function caretBox(view) {
    const { from } = view.state.selection;
    const c = view.coordsAtPos(from);
    const host = rootRef.current?.getBoundingClientRect();
    if (!host) return null;
    return { left: Math.max(0, c.left - host.left), top: c.bottom - host.top };
  }
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder || 'Write anything. Type "#" for a heading, "-" for a list. Paste images or YouTube links right in.' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ allowBase64: true }),
      Youtube.configure({ width: 640, height: 360, nocookie: true }),
      TableKit.configure({ table: { resizable: true } }),
      Highlight.configure({ multicolor: true }),
      Callout,
      Toggle,
      ToggleSummary,
      ToggleBody,
      Columns,
      Column,
      EmbedWithView,
      DatabaseViewWithView,
      EquationWithView,
    ],
    content: toHtml(value),
    editorProps: {
      handleKeyDown: (view, event) => {
        // "/" on an empty paragraph opens the block menu right at the caret
        // (the same menu the gutter + opens — one menu, two ways in). The
        // keystroke is consumed; the menu's own filter box takes the typing.
        if (event.key === '/' && isOnEmptyParagraph(view)) {
          const box = caretBox(view);
          if (box) {
            const $from = view.state.selection.$from;
            setSlash({ ...box, range: { from: $from.before(), to: $from.after() } });
            return true;
          }
        }
        // "@" at the start of a line or after a space mentions a prospect or
        // a page. Mid-word "@" (emails!) stays plain text.
        if (event.key === '@' && !event.ctrlKey && !event.metaKey) {
          const { $from } = view.state.selection;
          if ($from.parent.isTextblock) {
            const before = $from.parentOffset === 0
              ? ''
              : $from.parent.textBetween($from.parentOffset - 1, $from.parentOffset);
            if (before === '' || /\s/.test(before)) {
              const box = caretBox(view);
              if (box) {
                setMention({ ...box, at: view.state.selection.from });
                return true;
              }
            }
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        const files = imageFilesFrom(event.clipboardData);
        if (files.length) {
          event.preventDefault();
          (async () => {
            for (const f of files) {
              const src = await fileToDataUrl(f);
              if (src) editor?.chain().focus().setImage({ src }).run();
            }
          })();
          return true;
        }
        const html = event.clipboardData?.getData('text/html');
        const text = event.clipboardData?.getData('text/plain');

        const selfHost = typeof window !== 'undefined' ? window.location.hostname : null;
        const bare = String(text || '').trim();

        // A Facebook share link needs a round trip before it can become a
        // block. Claim the paste now and fill it in when the URL comes back —
        // pasting the raw short link would embed a post that reads as deleted.
        if (bare && isFacebookShare(bare) && isOnEmptyParagraph(view)) {
          event.preventDefault();
          resolveShareLink(bare).then((resolved) => {
            const m = resolved ? matchEmbed(resolved, selfHost) : null;
            if (m && m.embedUrl) {
              editor?.chain().focus().setEmbed({ provider: m.provider, url: m.url }).run();
            } else {
              // Fall back to the link as text rather than a block that cannot render.
              editor?.chain().focus().insertContent(bare).run();
            }
          });
          return true;
        }

        // A provider URL on an empty line becomes an embed block.
        const hit = text ? embedFromPastedText(text, selfHost) : null;
        if (hit && isOnEmptyParagraph(view)) {
          event.preventDefault();
          editor?.chain().focus().setEmbed({ provider: hit.provider, url: hit.url }).run();
          return true;
        }

        // Markdown paste (Obsidian-style): only when the clipboard is plain
        // text with real md structure — rich HTML pastes keep their format.
        if (!html && text && looksLikeMarkdown(text)) {
          event.preventDefault();
          editor?.chain().focus().insertContent(marked.parse(text)).run();
          return true;
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = imageFilesFrom(event.dataTransfer);
        if (!files.length) return false;
        event.preventDefault();
        (async () => {
          for (const f of files) {
            const src = await fileToDataUrl(f);
            if (src) editor?.chain().focus().setImage({ src }).run();
          }
        })();
        return true;
      },
    },
  });

  // Which block the gutter handle is pointing at. A ref, not state, and that
  // is load-bearing rather than a micro-optimisation.
  //
  // DragHandle registers its ProseMirror plugin in an effect whose dependency
  // array includes onNodeChange. An inline handler is a new reference every
  // render, and a handler that sets state causes a render, so the plugin was
  // being unregistered and rebuilt on every mouse move. Plugin setup starts
  // with element.style.visibility = 'hidden', which is exactly what the
  // blinking was: the handle torn down and recreated faster than it could be
  // clicked.
  //
  // Writing to a ref changes nothing React can see, and the callback below is
  // memoised with no dependencies, so the plugin is registered once.
  const handleAtRef = useRef({ pos: 0, size: 0 });
  const [insert, setInsert] = useState(null); // { pos, above } | null
  // Mirrors `insert` so the stable callback can tell whether a menu is open
  // without taking it as a dependency.
  const insertRef = useRef(null);
  insertRef.current = insert;
  // Same reason: lets the memoised callbacks below reach the editor without
  // taking it as a dependency and re-registering the plugin.
  const editorRef = useRef(null);
  editorRef.current = editor;

  const onHandleNodeChange = useCallback(({ node, pos }) => {
    handleAtRef.current = { pos, size: node ? node.nodeSize : 0 };
    // Pointing at a different block means an open menu no longer belongs to
    // the block it was opened from. Guarded so the common case does not
    // render at all.
    if (insertRef.current) setInsert(null);
  }, []);

  // The plugin only shows the handle when the hovered block CHANGES. Its
  // drag-end path hides the handle without clearing the block it thinks you
  // are on, unlike keydown and mouseleave which both reset it. After a drag —
  // and the grip is draggable, so a click on it counts — hovering that same
  // block does nothing, and you have to hover a different one to get it back.
  //
  // The hideDragHandle meta is the plugin's own reset: it hides AND clears the
  // remembered block, so the next hover anywhere shows the handle again.
  //
  // Memoised because DragHandle keys its plugin registration on this prop; an
  // inline function would re-register the plugin on every render, which is the
  // bug that made the handle blink in the first place.
  const onHandleDragEnd = useCallback(() => {
    if (!editorRef.current) return;
    const { view } = editorRef.current;
    view.dispatch(view.state.tr.setMeta('hideDragHandle', true));
  }, []);

  const insertImage = () => fileInputRef.current?.click();
  const insertVideo = async () => {
    const url = await promptDialog({ title: 'Embed video', placeholder: 'Paste a YouTube link', confirmLabel: 'Embed' });
    if (url && url.trim()) editor?.chain().focus().setYoutubeVideo({ src: url.trim() }).run();
  };

  useEffect(() => {
    if (!editor) return;
    if (onReady) onReady({ insertImage, insertVideo });
  }, [editor]);

  // Saves normally fire on focusout of the wrapper, which is right for typing.
  // It is not enough for a node view whose controls are outside the editable
  // area: changing a database view's filter is a click on a contentEditable
  // =false button, and whether that produces a blur depends on focus details
  // we should not be relying on. Node views call this instead, so their
  // configuration persists on its own terms.
  useEffect(() => {
    if (!editor) return;
    editor.storage.requestSave = () => {
      const html = editor.getHTML();
      saveRef.current(html === '<p></p>' ? '' : html);
    };
  }, [editor]);

  function handleBlur(e) {
    if (!editor) return;
    if (e.currentTarget.contains(e.relatedTarget)) return;
    const html = editor.getHTML();
    saveRef.current(html === '<p></p>' ? '' : html);
  }

  async function pickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const src = await fileToDataUrl(file);
    if (src) editor?.chain().focus().setImage({ src }).run();
  }

  return (
    <div
      ref={rootRef}
      onClickCapture={(e) => {
        // Mention chips: a link written by the "@" menu opens the prospect
        // drawer or jumps to the page instead of navigating a hash.
        const a = e.target.closest?.('a[href^="#prospect-"], a[href^="#page-"]');
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#prospect-') && onOpenProspect) onOpenProspect(Number(href.slice(10)));
        else if (href.startsWith('#page-') && onOpenPage) onOpenPage(href.slice(6));
      }} className="relative rich-editor" onBlur={handleBlur}>
      <input type="file" accept="image/*" ref={fileInputRef} onChange={pickImage} className="hidden" />

      {/* Slash menu: the gutter's block menu, opened from the keyboard. */}
      {slash && editor && (
        <div className="absolute z-50" style={{ left: slash.left, top: slash.top }}>
          <BlockInsertMenu
            editor={editor}
            pos={slash.range}
            tools={{ insertImage, insertVideo }}
            onClose={() => { setSlash(null); editor.commands.focus(); }}
          />
        </div>
      )}
      {mention && editor && (
        <div className="absolute z-50" style={{ left: mention.left, top: mention.top }}>
          <MentionMenu
            prospects={prospects}
            pages={allPages}
            onClose={() => { setMention(null); editor.commands.focus(); }}
            onPick={(href, label) => {
              editor
                .chain()
                .focus()
                .insertContentAt(mention.at, [
                  { type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] },
                  { type: 'text', text: ' ' },
                ])
                .run();
              setMention(null);
            }}
          />
        </div>
      )}

      {/* The gutter handle: + to add a block, grip to drag one. It sits in the
          margin and only shows on hover, so the page still reads as a document
          rather than a form. */}
      {editor && (
        <DragHandle
          editor={editor}
          // The plugin puts this class on the element it positions, and that
          // element inherits pointer-events:none from the overlay wrapper it
          // sits in. Without re-enabling it here the pointer falls through
          // every pixel of the handle that our inner div does not cover, so
          // the plugin sees a mouseleave with nothing of its own under the
          // cursor and hides. Styling the inner div alone was not enough.
          className="ltb-gutter-host"
          onNodeChange={onHandleNodeChange}
          onElementDragEnd={onHandleDragEnd}
        >
          <div className="ltb-gutter">
            <button
              type="button"
              title="Click to add below · Alt-click to add above"
              aria-label="Add a block"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) =>
                setInsert((cur) =>
                  cur
                    ? null
                    : {
                        pos: e.altKey
                          ? handleAtRef.current.pos
                          : handleAtRef.current.pos + handleAtRef.current.size,
                        above: e.altKey,
                      }
                )
              }
              className="ltb-gutter-btn"
            >
              +
            </button>
            <span
              className="ltb-gutter-btn ltb-gutter-grip"
              title="Drag to move this block"
              aria-hidden="true"
            >
              ⠿
            </span>
            {insert && (
              <BlockInsertMenu
                editor={editor}
                pos={insert.pos}
                above={insert.above}
                tools={{ insertImage, insertVideo }}
                onClose={() => setInsert(null)}
              />
            )}
          </div>
        </DragHandle>
      )}

      {editor && (
        <BubbleMenu
          editor={editor}
          // The default shouldShow hides the menu whenever the selection is
          // collapsed. That made the table controls unreachable by the gesture
          // PageView documents — clicking into a table leaves the cursor
          // collapsed, so the menu holding those buttons never appeared.
          // Everything here matches the default except the isActive('table')
          // escape hatch.
          shouldShow={({ editor: e, element, view, state, from, to }) => {
            if (!e.isEditable) return false;
            const hasFocus = view.hasFocus() || element.contains(document.activeElement);
            if (!hasFocus) return false;
            if (e.isActive('table')) return true;
            const isEmptyTextBlock =
              !state.doc.textBetween(from, to).length && isTextSelection(state.selection);
            return !state.selection.empty && !isEmptyTextBlock;
          }}
          className="flex items-center gap-0.5 flex-wrap max-w-[300px] glass-panel !bg-panel px-1.5 py-1"
        >
          <Tools editor={editor} />
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}


// The "@" menu: search prospects and workspace pages, insert a mention
// link. Enter picks the highlighted row, arrows move, Esc closes. Kept
// deliberately small — it is a picker, not a second command palette.
function MentionMenu({ prospects, pages, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const needle = q.trim().toLowerCase();
  const hit = (t) => String(t || '').toLowerCase().includes(needle);
  const rows = [
    ...prospects
      .filter((p) => !needle || hit(p.name) || hit(p.business_name) || hit(p.email))
      .slice(0, 6)
      .map((p) => ({
        key: `prospect-${p.id}`,
        icon: 'user',
        label: p.name || p.business_name || p.email || `#${p.id}`,
        sub: p.business_name && p.business_name !== p.name ? p.business_name : p.stage || '',
        href: `#prospect-${p.id}`,
      })),
    ...pages
      .filter((pg) => !needle || hit(pg.title))
      .slice(0, 4)
      .map((pg) => ({
        key: `page-${pg.id}`,
        icon: 'file',
        label: pg.title || 'Untitled',
        sub: 'Page',
        href: `#page-${pg.id}`,
      })),
  ];

  return (
    <div
      className="absolute left-0 top-1 z-50 w-[260px] glass-panel !bg-panel p-1.5"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setAt(0); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(rows.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
          else if (e.key === 'Enter') {
            e.preventDefault();
            const r = rows[at];
            if (r) onPick(r.href, `@${r.label}`);
            else onClose();
          }
        }}
        placeholder="Mention a prospect or page…"
        className="w-full mb-1 bg-input-bg border border-line rounded-[7px] px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-rose"
      />
      <div className="max-h-[260px] overflow-y-auto slim-scroll">
        {rows.length === 0 && (
          <div className="px-3 py-2 text-[12.5px] text-ink-3">No matches.</div>
        )}
        {rows.map((r, i) => (
          <button
            key={r.key}
            onClick={() => onPick(r.href, `@${r.label}`)}
            onMouseEnter={() => setAt(i)}
            className={'flex items-center gap-2.5 w-full pl-3 pr-2 py-1.5 rounded-[7px] text-left text-[13px] transition ' + (
              i === at ? 'bg-hover-wash text-ink' : 'text-ink-2'
            )}
          >
            <Icon name={r.icon} className="w-3.5 h-3.5 shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            {r.sub && <span className="text-[11px] text-ink-3 truncate max-w-[80px]">{r.sub}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
