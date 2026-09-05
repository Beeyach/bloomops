'use client';

import { useEffect, useRef, useState } from 'react';
import RichEditor from './RichEditor';
import Hint from './Hint';
import EmojiPicker from './EmojiPicker';
import { Icon } from './Icons';
import { breadcrumbFor } from '../lib/page-tree.mjs';
import { sharePreview } from '../lib/page-share.mjs';

import { toast } from '../lib/toast.mjs';
// A Notion-style custom page: emoji, a big title that owns the page, and a
// borderless body that autosaves quietly. Page tools (insert image/video,
// delete) live in one right-aligned cluster; saving announces itself with a
// brief "Saved" whisper instead of a permanent banner.
export default function PageView({ page, onPatch, onDelete, allPages = [], onOpenPage, prospects = [], onOpenProspect }) {
  const [title, setTitle] = useState(page.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const editorTools = useRef(null);
  const flashTimer = useRef(null);

  useEffect(() => {
    setTitle(page.title);
    setMenuOpen(false);
    setEmojiOpen(false);
  }, [page.id]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  async function commit(patch) {
    const ok = await onPatch(patch);
    if (ok) {
      setSavedFlash(true);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSavedFlash(false), 1600);
    }
  }

  function setEmoji(emoji) {
    setEmojiOpen(false);
    if (emoji && emoji !== page.emoji) commit({ emoji });
  }

  const toolBtn =
    'w-8 h-8 rounded-[8px] flex items-center justify-center text-ink-3 hover:text-ink-2 hover:bg-hover-wash-soft transition text-[15px] leading-none';

  // Ancestors only — the page you are on is already the heading below.
  const trail = breadcrumbFor(page.id, allPages).slice(0, -1);

  // Contents rail. The audit found this route using 880px of 1690px, with
  // the rest empty — but the answer to a reading column is not a wider
  // reading column. Long guides get a contents list in that space instead.
  const [toc, setToc] = useState([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareToken, setShareToken] = useState(page.share_token || null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setShareToken(page.share_token || null); setShareOpen(false); }, [page.id, page.share_token]);

  async function setShared(on) {
    setShareBusy(true);
    try {
      const res = await fetch(`/api/pages/${page.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not change sharing');
      setShareToken(d.token);
    } catch (e) {
      toast(e.message, { tone: 'error', action: { label: 'Retry', onClick: () => setShared(on) } });
    } finally {
      setShareBusy(false);
    }
  }
  // Look the heading up fresh, because the list was built from a DOM that
  // ProseMirror may have replaced since. Position is the primary match; the
  // text is checked so that an edit which shifted the headings sends you to
  // the one you actually clicked rather than whatever now sits at that spot.
  function scrollToHeading(h) {
    const root = document.querySelector('.rich-editor .ProseMirror');
    if (!root) return;
    const all = [...root.querySelectorAll('h1, h2, h3')];
    const atIndex = all[h.index];
    const el =
      atIndex && (atIndex.textContent || '').trim() === h.text
        ? atIndex
        : all.find((e) => (e.textContent || '').trim() === h.text);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  useEffect(() => {
    const scan = () => {
      const root = document.querySelector('.rich-editor .ProseMirror');
      if (!root) { setToc([]); return; }
      // No ids are stamped here. ProseMirror owns this DOM and re-renders it,
      // dropping attributes we add, which left every contents link pointing at
      // an element that no longer existed. The position is recorded instead and
      // the heading is looked up again at click time.
      const found = [...root.querySelectorAll('h1, h2, h3')]
        .map((el, i) => ({ index: i, text: (el.textContent || '').trim(), level: Number(el.tagName[1]) }))
        .filter((h) => h.text);
      // Two headings is a document, not something you navigate.
      setToc(found.length >= 3 ? found : []);
    };
    const t = setTimeout(scan, 260);
    return () => clearTimeout(t);
  }, [page.id, page.body]);

  return (
    <div className={(toc.length ? 'tpl-read-page' : 'canvas-read') + ' ltb-page-canvas pt-6'}>
      {trail.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center flex-wrap gap-1 mb-2 text-[12px] text-muted">
          {trail.map((p, i) => (
            <span key={p.id} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-ink-3" aria-hidden="true">/</span>}
              <button
                onClick={() => onOpenPage && onOpenPage(p.id)}
                className="inline-flex items-center gap-1 hover:text-charcoal transition truncate max-w-[220px]"
              >
                {p.emoji ? <span aria-hidden="true">{p.emoji}</span> : <Icon name="file" className="w-3 h-3" />}
                <span className="truncate">{p.title}</span>
              </button>
            </span>
          ))}
          <span className="text-ink-3" aria-hidden="true">/</span>
        </nav>
      )}
      <div className="flex items-start gap-1 mb-8 group/head">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative shrink-0">
            <button
              onClick={() => setEmojiOpen((v) => !v)}
              title="Change icon"
              className="text-[40px] leading-none hover:bg-hover-wash-soft rounded-[12px] p-1 transition inline-flex items-center justify-center"
            >
              {page.emoji || <span className="text-ink-3"><Icon name="file" className="w-9 h-9" strokeWidth={1.5} /></span>}
            </button>
            {emojiOpen && (
              <EmojiPicker value={page.emoji} onPick={setEmoji} onClose={() => setEmojiOpen(false)} />
            )}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title.trim() && title.trim() !== page.title) commit({ title: title.trim() }); }}
            className="font-serif text-[42px] text-bright leading-tight bg-transparent border-0 outline-none flex-1 min-w-0"
            placeholder="Untitled"
          />
        </div>
        <div className="flex items-center gap-0.5 shrink-0 pt-3 opacity-50 group-hover/head:opacity-100 focus-within:opacity-100 transition">
          <span
            aria-live="polite"
            className={`inline-flex items-center gap-1 text-[12px] font-medium text-leaf-text mr-1 transition-opacity duration-500 ${
              savedFlash ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <Icon name="check" className="w-3 h-3" strokeWidth={2.5} />
            Saved
          </span>
          <button onClick={() => editorTools.current?.insertImage()} title="Insert image (or paste one anywhere)" className={toolBtn}><Icon name="image" className="w-4 h-4" /></button>
          <button onClick={() => editorTools.current?.insertVideo()} title="Embed YouTube video (pasting a link works too)" className={toolBtn}><Icon name="play" className="w-4 h-4" /></button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="Page options"
              aria-expanded={menuOpen}
              className={`${toolBtn} text-[18px]`}
            >
              ⋯
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 top-9 z-40 glass-panel !bg-panel p-1.5 min-w-[170px]">
                  <button
                    onClick={() => { setMenuOpen(false); setShareOpen(true); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 rounded-[7px] text-left text-sm text-ink-2 hover:bg-hover-wash-soft transition"
                  >
                    <Icon name="link" className="w-4 h-4" />
                    {shareToken ? 'Sharing settings' : 'Share this page'}
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); onDelete(); }}
                    className="flex items-center gap-2.5 w-full px-3 py-2 rounded-[8px] text-left text-sm text-poppy-text hover:bg-hover-wash-soft transition"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                    Delete page
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {shareOpen && (() => {
        const { subpages } = sharePreview(page.id, allPages);
        const url = shareToken && typeof window !== 'undefined' ? `${window.location.origin}/p/${shareToken}` : '';
        return (
          <div className="glass-panel p-4 mb-5">
            <div className="flex items-start justify-between gap-3 mb-1">
              <div className="text-[13px] font-semibold text-ink">
                {shareToken ? 'This page is public' : 'Share this page'}
              </div>
              <button onClick={() => setShareOpen(false)} className="text-ink-3 hover:text-ink transition" aria-label="Close">
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* Inheritance stated up front. Anyone opening the link can read
                every subpage too, so the list is shown BEFORE you publish
                rather than discovered afterwards. */}
            <p className="text-[12px] text-ink-3 mb-3">
              Anyone with the link can read this page, with no access code. Subpages come with it.
              {subpages.length > 0
                ? ` ${subpages.length} subpage${subpages.length === 1 ? '' : 's'} would be public too:`
                : ' It has no subpages right now. Anything you nest under it later becomes public as well.'}
            </p>
            {subpages.length > 0 && (
              <ul className="text-[12px] text-ink-2 mb-3 space-y-0.5">
                {subpages.map((sp) => (
                  <li key={sp.id} className="truncate">· {sp.title}</li>
                ))}
              </ul>
            )}

            {shareToken ? (
              <div className="flex flex-wrap items-center gap-2">
                <input readOnly value={url} onFocus={(e) => e.target.select()} className="cell-input flex-1 min-w-[220px]" />
                <button
                  onClick={async () => {
                    // Only claim "Copied" once the write resolved — the browser
                    // can refuse clipboard access, and saying it worked left
                    // people pasting a link they never got. The field beside
                    // this button is selectable as the fallback.
                    try {
                      await navigator.clipboard.writeText(url);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      toast('Your browser blocked clipboard access. Select the link and copy it by hand.', { tone: 'error' });
                    }
                  }}
                  className="text-[13px] font-medium px-3 py-2 rounded-[8px] btn-bloom transition"
                >
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <button
                  disabled={shareBusy}
                  onClick={() => setShared(false)}
                  className="text-[13px] font-medium px-3 py-2 rounded-[8px] border border-line-strong text-poppy-text hover:bg-hover-wash-soft transition disabled:opacity-50"
                >
                  Stop sharing
                </button>
              </div>
            ) : (
              <button
                disabled={shareBusy}
                onClick={() => setShared(true)}
                className="text-[13px] font-medium px-4 py-2.5 rounded-[8px] btn-bloom transition disabled:opacity-50"
              >
                {shareBusy ? 'Creating link…' : 'Create a public link'}
              </button>
            )}
          </div>
        );
      })()}

      {/* Bumped from "page-editor" when tables landed: the tip now teaches
          something new, so anyone who dismissed the old one should see it. */}
      <Hint id="page-editor-tables">
        Type like Notion: <b>#&nbsp;</b> heading, <b>-&nbsp;</b> list, <b>&gt;&nbsp;</b> quote. Highlight any text and a
        small toolbar pops up, and that is where <b>Table</b> lives. Click into a table and the same toolbar grows
        buttons for adding and deleting rows and columns. Paste markdown, images, or YouTube links straight in.
        Everything saves when you click away.
      </Hint>

      <div className={toc.length ? 'tpl-read' : ''}>
        <div className="min-w-0">
          <RichEditor
            key={page.id}
            value={page.body || ''}
            onSave={(html) => { if (html !== (page.body || '')) commit({ body: html }); }}
            onReady={(tools) => { editorTools.current = tools; }}
            prospects={prospects}
            allPages={allPages.filter((pg) => pg.id !== page.id)}
            onOpenProspect={onOpenProspect}
            onOpenPage={onOpenPage}
          />
        </div>

        {toc.length > 0 && (
          <nav className="tpl-read-toc hidden xl:block" aria-label="On this page">
            <div className="text-[11px] uppercase tracking-[0.08em] text-ink-3 mb-2">On this page</div>
            <ul className="space-y-1 border-l border-line">
              {toc.map((h) => (
                <li key={h.index} style={{ paddingLeft: (h.level - 1) * 10 + 10 }}>
                  <button
                    onClick={() => scrollToHeading(h)}
                    className="text-left text-[12px] text-ink-3 hover:text-ink transition leading-snug"
                  >
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
