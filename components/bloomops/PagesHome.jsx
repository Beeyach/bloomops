'use client';
import Link from 'next/link';
import {PageHeader,Button,EmptyState} from './Primitives';
import PageGlyph from './PageGlyph';
import {Icon} from './Icons';
import {buildPageTree} from '@/lib/page-tree.mjs';
import {usePages} from './PagesWorkspace';
export default function PagesHome(){
 const pages=usePages(),roots=buildPageTree(pages.tree.rows);
 return <div className="bo-pages-home"><PageHeader title="Pages" subtitle="Notes, briefs and guides. Make room for your ideas."/>
  {pages.tree.canManage&&<Button href="/pages/templates" variant="ghost">Reusable Page templates</Button>}
  {pages.tree.rows.length?<><ul className="bo-pages-list" aria-label="Top-level pages">{roots.map(page=><li key={page.id}><Link href={pages.basePath+'/'+page.id} prefetch={false}><PageGlyph name={page.icon} size={20}/><div><h2>{page.title}</h2></div><Icon name="chevron-right" size={16}/></Link></li>)}</ul>{pages.tree.canManage&&<Button icon="plus" variant="ghost" disabled={pages.busy} onClick={()=>pages.create()}>Add a page</Button>}</>:<EmptyState title={pages.tree.canManage?"Room for your next idea":"No pages shared yet"} actions={pages.tree.canManage&&<Button icon="plus" onClick={()=>pages.create()} disabled={pages.busy}>Create a page</Button>}>{pages.tree.canManage?"Start a page, then organise related notes inside it.":"Pages shared with you will appear here."}</EmptyState>}
 </div>;
}
