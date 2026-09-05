'use client';

import { useEffect, useState } from 'react';
import { buildPageTree, breadcrumbFor } from '../lib/page-tree.mjs';

// The public reader. Deliberately NOT the app shell: no sidebar, no nav, no
// workspace name, no theme toggle, nothing that hints at what else exists.
// A client opening this link should see one document and the pages nested
// under it, and be unable to tell there is an app behind it.

export default function PublicReader({ token }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/public/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('gone'))))
      .then((d) => {
        if (!alive) return;
        setData(d);
        setOpenId(d.root);
        setState('ready');
      })
      .catch(() => alive && setState('gone'));
    return () => { alive = false; };
  }, [token]);

  if (state === 'loading') {
    return <div className="pub-wrap"><div className="skeleton h-8 w-56 mb-4" /><div className="skeleton h-64 w-full" /></div>;
  }

  // One message for every failure: wrong token, revoked, trashed. Telling
  // them which would confirm that a page exists.
  if (state === 'gone') {
    return (
      <div className="pub-wrap pub-empty">
        <h1>This link isn’t available</h1>
        <p>It may have been turned off, or the address may be incomplete.</p>
      </div>
    );
  }

  const pages = data.pages;
  const page = pages.find((p) => p.id === openId) || pages.find((p) => p.id === data.root);
  const tree = buildPageTree(pages);
  const trail = breadcrumbFor(page.id, pages);
  const hasSub = pages.length > 1;

  const renderTree = (nodes, depth = 0) =>
    nodes.map((n) => (
      <div key={n.id}>
        <button
          onClick={() => setOpenId(n.id)}
          className={'pub-nav-item' + (n.id === page.id ? ' is-current' : '')}
          style={{ paddingLeft: 10 + depth * 12 }}
        >
          {n.emoji ? <span aria-hidden="true">{n.emoji}</span> : null} {n.title}
        </button>
        {n.children.length > 0 && renderTree(n.children, depth + 1)}
      </div>
    ));

  return (
    <div className={hasSub ? 'pub-shell' : 'pub-shell pub-shell--solo'}>
      {hasSub && (
        <nav className="pub-nav" aria-label="Pages">
          {renderTree(tree)}
        </nav>
      )}

      <article className="pub-wrap">
        {trail.length > 1 && (
          <nav className="pub-crumbs" aria-label="Breadcrumb">
            {trail.map((p, i) => (
              <span key={p.id}>
                {i > 0 && <span aria-hidden="true"> / </span>}
                <button onClick={() => setOpenId(p.id)}>{p.title}</button>
              </span>
            ))}
          </nav>
        )}
        <h1 className="pub-title">
          {page.emoji ? <span aria-hidden="true">{page.emoji} </span> : null}
          {page.title}
        </h1>
        <div className="pub-body" dangerouslySetInnerHTML={{ __html: page.body || '' }} />
      </article>
    </div>
  );
}
