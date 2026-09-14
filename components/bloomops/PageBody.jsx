'use client';
import {memo, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import PageWorkView from './PageWorkView';

const DocumentMarkup = memo(function DocumentMarkup({body, root}) {
  return <div className="bo-page-body" ref={root} dangerouslySetInnerHTML={{__html: body}}/>;
});

// Only sanitized authenticated reader HTML reaches this component. Context
// comes from the authorized page DTO, never from an authored data attribute.
export default function PageBody({page}) {
  const root = useRef(null), [hosts, setHosts] = useState([]);
  useEffect(() => {
    const next = [...root.current.querySelectorAll('div[data-database-view]')].filter(node => !node.parentElement.closest('[data-database-view]')).map(node => {
      const attrs = Object.fromEntries(['source', 'view', 'filter', 'sort', 'groupBy'].map(key => [key, node.getAttribute('data-' + (key === 'groupBy' ? 'group-by' : key)) || '']));
      node.replaceChildren();
      return {node, attrs};
    });
    setHosts(next);
  }, [page.body]);
  return <><DocumentMarkup root={root} body={page.body}/>{hosts.map(({node, attrs}, index) => createPortal(<PageWorkView key={page.id} pageId={page.id} workspaceId={page.workspaceId} canReadWork={page.canReadWork} attrs={attrs}/>, node, String(index)))}</>;
}
