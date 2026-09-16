'use client';
import {createContext,useContext,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import PageGlyph from './PageGlyph';
import {Icon} from './Icons';
import {Button} from './Primitives';
import {ancestorsOf,breadcrumbFor,buildPageTree,canMoveUnder,depthOf,MAX_PAGE_DEPTH} from '@/lib/page-tree.mjs';
const PagesContext=createContext(null);
export const usePages=()=>useContext(PagesContext);
const IconButton=({icon,label,...props})=><button type="button" className="bo-page-icon-button" aria-label={label} title={label} {...props}><Icon name={icon} size={16}/></button>;
export default function PagesWorkspace({initialTree,workspaceId,basePath='/pages',children}){
 const router=useRouter(),path=usePathname(),currentId=path.split('/').at(-1),pending=useRef(false),requests=useRef(new Map()),canLeave=useRef(()=>true);
 const [tree,setTree]=useState(initialTree),[expanded,setExpanded]=useState([]),[query,setQuery]=useState(''),[mobileOpen,setMobileOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[moving,setMoving]=useState(null),[moveParent,setMoveParent]=useState(undefined),[drop,setDrop]=useState(null);
 useEffect(()=>setTree(initialTree),[initialTree]);
 useEffect(()=>{setExpanded(old=>[...new Set([...old,...ancestorsOf(currentId,tree.rows).map(p=>p.id)])]);setMobileOpen(false);setQuery('');},[currentId]);
 async function refresh(){const r=await fetch('/api/bloomops/pages/tree',{cache:'no-store'});if(!r.ok)throw Error('The page tree could not load. Try again.');const next=await r.json();setTree(next);return next;}
 async function create(parentId=null){
  if(pending.current||!canLeave.current())return;pending.current=true;setBusy(true);setError('');
  const key=parentId||'root';if(!requests.current.has(key))requests.current.set(key,crypto.randomUUID());
  try{const r=await fetch('/api/bloomops/pages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId,requestId:requests.current.get(key),parentId,expectedTreeRevision:tree.revision})});const result=await r.json();if(!r.ok){if(r.status===409)await refresh();throw Error(result.error||'The page could not open. Try again.');}requests.current.delete(key);try{await refresh();}catch(e){setError(e.message);}if(parentId)setExpanded(old=>[...new Set([...old,parentId])]);router.push('/pages/'+result.id);}
  catch(e){setError(e.message);}finally{pending.current=false;setBusy(false);}
 }
 async function move(id,parentId,beforeId=null,acknowledgeSharingChange=false){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');setMessage('');
  try{const r=await fetch('/api/bloomops/pages/'+id+'/location',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({workspaceId,parentId,beforeId,expectedTreeRevision:tree.revision,...(acknowledgeSharingChange?{acknowledgeSharingChange:true}:{})})});const result=await r.json();if(!r.ok){if(r.status===409)await refresh();throw Error(result.error||'The page could not move. Try again.');}await refresh();setMoving(null);if(parentId)setExpanded(old=>[...new Set([...old,parentId])]);setMessage('Page moved.');}
  catch(e){setError(e.message);}finally{pending.current=false;setBusy(false);setDrop(null);}
 }
 const value={tree,create,busy,canLeave,basePath,refresh,openMove:id=>{setError('');setMoveParent(undefined);setMoving(id);},updateTitle:(id,title)=>setTree(old=>({...old,rows:old.rows.map(p=>p.id===id?{...p,title}:p)}))};
 function dropOn(e,parentId){e.preventDefault();e.stopPropagation();const id=e.dataTransfer.getData('application/x-bloomsi-page');if(tree.canManage&&tree.rows.some(p=>p.id===id)&&canMoveUnder(id,parentId,tree.rows)){if(tree.hasSharing){setMoveParent(parentId);setMoving(id);}else move(id,parentId);}setDrop(null);}
 function row(node,level=0){const open=expanded.includes(node.id),hasChildren=node.children.length>0;
  return <li key={node.id}><div className={'bo-page-tree-row'+(currentId===node.id?' is-current':'')+(drop===node.id?' is-drop':'')} style={{'--page-depth':level}} draggable={tree.canManage&&!busy} onDragStart={e=>{if(e.target.closest('button'))return e.preventDefault();e.dataTransfer.setData('application/x-bloomsi-page',node.id);e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>setDrop(null)} onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-bloomsi-page')){e.preventDefault();e.stopPropagation();setDrop(node.id);}}} onDrop={e=>dropOn(e,node.id)}>
   <IconButton icon={open?'chevron-down':'chevron-right'} label={(open?'Collapse ':'Expand ')+node.title} disabled={!hasChildren} aria-expanded={hasChildren?open:undefined} onClick={()=>setExpanded(old=>open?old.filter(id=>id!==node.id):[...old,node.id])}/>
   <Link href={basePath+'/'+node.id} prefetch={false} aria-current={currentId===node.id?'page':undefined} title={node.title}><PageGlyph name={node.icon} size={16}/><span>{node.title}</span></Link>
   {tree.canManage&&<><button type="button" className="bo-page-move-control" aria-label={'Move '+node.title} disabled={busy} onClick={()=>value.openMove(node.id)}>Move</button>
   <IconButton icon="plus" label={'Add page inside '+node.title} disabled={busy||depthOf(node.id,tree.rows)>=MAX_PAGE_DEPTH-1} onClick={()=>create(node.id)}/></>}
  </div>{hasChildren&&open&&<ul>{node.children.map(child=>row(child,level+1))}</ul>}</li>;
 }
 const matches=tree.rows.filter(p=>p.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <PagesContext.Provider value={value}><div className="bo-pages-workspace">
  <button type="button" className="bo-pages-mobile-toggle" aria-expanded={mobileOpen} aria-controls="bo-page-navigation" onClick={()=>setMobileOpen(!mobileOpen)}><Icon name="pages" size={18}/>Browse pages<Icon name={mobileOpen?'chevron-down':'chevron-right'} size={16}/></button>
  <aside id="bo-page-navigation" className={'bo-pages-sidebar'+(mobileOpen?' is-open':'')} aria-label="Page navigation">
   <div className={'bo-pages-sidebar-heading'+(drop==='root'?' is-drop':'')} onDragOver={e=>{if(e.dataTransfer.types.includes('application/x-bloomsi-page')){e.preventDefault();setDrop('root');}}} onDrop={e=>dropOn(e,null)}><Link href={basePath} prefetch={false}>Pages</Link>{tree.canManage&&<IconButton icon="plus" label="New page" disabled={busy} onClick={()=>create()}/>}</div>
   <label className="bo-page-search"><span>Find a page</span><input type="search" value={query} maxLength={200} onChange={e=>setQuery(e.target.value)} placeholder="Search titles…"/></label>
   {query.trim()?<div className="bo-page-results"><button type="button" onClick={()=>setQuery('')}><Icon name="chevron-left" size={16}/>Back to page tree</button><p role="status">{matches.length>50?'First 50 matches':matches.length+' matching pages'}</p><ul>{matches.slice(0,50).map(p=><li key={p.id}><Link href={basePath+'/'+p.id} prefetch={false}><PageGlyph name={p.icon} size={16}/><span>{p.title}</span></Link></li>)}</ul></div>:<nav aria-label="Workspace pages"><ul className="bo-page-tree">{buildPageTree(tree.rows).map(node=>row(node))}</ul>{!tree.rows.length&&<p className="bo-hint">Your pages will appear here.</p>}</nav>}
  </aside>
  <div className="bo-pages-document">{error&&!moving&&<div className="bo-page-tree-notice" role="alert">{error}<Button variant="ghost" onClick={()=>refresh().then(()=>setError('')).catch(e=>setError(e.message))}>Refresh pages</Button></div>}{message&&<p className="bo-page-tree-message" role="status">{message}</p>}{children}</div>
  {moving&&<MovePage key={moving} id={moving} initialParent={moveParent} tree={tree} busy={busy} error={error} onClose={()=>{if(!busy){setMoving(null);setError('');}}} onMove={move}/>}
 </div></PagesContext.Provider>;
}
function MovePage({id,initialParent,tree,busy,error,onClose,onMove}){
 const ref=useRef(null),page=tree.rows.find(p=>p.id===id),[parent,setParent]=useState(initialParent===undefined?(page?.parent_id||''):(initialParent||'')),[acknowledged,setAcknowledged]=useState(false),[before,setBefore]=useState(''),[query,setQuery]=useState('');
 useEffect(()=>{const previous=document.activeElement,dialog=ref.current;dialog.showModal();return()=>{dialog.close();previous?.focus();};},[]);
 const destinations=tree.rows.filter(p=>canMoveUnder(id,p.id,tree.rows)&&p.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0,50),siblings=tree.rows.filter(p=>p.id!==id&&(p.parent_id||'')===parent);
 return <dialog ref={ref} className="bo-page-move-dialog" aria-labelledby="bo-move-title" onCancel={e=>{e.preventDefault();onClose();}}><form onSubmit={e=>{e.preventDefault();onMove(id,parent||null,before||null,acknowledged);}}>
  <div className="bo-page-move-heading"><h2 id="bo-move-title">Move page</h2><IconButton icon="x" label="Close move dialog" disabled={busy} onClick={onClose}/></div><p className="bo-page-move-name"><Icon name="pages" size={18}/>{page?.title}</p>
  <label className="bo-page-search"><span>Find a destination</span><input type="search" value={query} maxLength={200} onChange={e=>setQuery(e.target.value)}/></label>
  <fieldset disabled={busy}><legend>Move into</legend><div className="bo-page-destinations">{[{id:'',title:'Pages (top level)'},...destinations].map(p=><label key={p.id}><input type="radio" name="page-destination" value={p.id} checked={parent===p.id} onChange={()=>{setParent(p.id);setBefore('');}}/><Icon name="pages" size={16}/><span>{p.title}</span></label>)}</div></fieldset>
  <p className="bo-hint">Destination: {tree.rows.find(p=>p.id===parent)?.title||'Pages (top level)'}</p>
  <label className="bo-page-order">Position<select value={before} disabled={busy} onChange={e=>setBefore(e.target.value)}><option value="">At the end</option>{siblings.map(p=><option key={p.id} value={p.id}>Before {p.title}</option>)}</select></label>
  {tree.hasSharing&&(parent||null)!==page.parent_id&&<label className="bo-page-access-confirm"><input type="checkbox" required checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/>I understand this changes inherited access for this page and its subpages.</label>}
  {error&&<p role="alert">{error}</p>}<div className="bo-page-move-actions"><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy} loading={busy}>Move page</Button></div>
 </form></dialog>;
}
export function PageBreadcrumbs({id}){const pages=usePages();return <nav className="bo-page-breadcrumbs" aria-label="Page breadcrumb"><Link href={pages?.basePath||'/pages'}>All pages</Link>{pages&&breadcrumbFor(id,pages.tree.rows).map((p,i,trail)=><span key={p.id}><Icon name="chevron-right" size={14}/>{i===trail.length-1?<span aria-current="page">{p.title}</span>:<Link href={(pages?.basePath||'/pages')+'/'+p.id} prefetch={false}>{p.title}</Link>}</span>)}</nav>;}
export function PageChildren({id}){const pages=usePages();if(!pages)return null;const children=pages.tree.rows.filter(p=>p.parent_id===id);return <section className="bo-page-children" aria-label="Child pages">{children.length>0&&<ul>{children.map(p=><li key={p.id}><Link href={(pages?.basePath||'/pages')+'/'+p.id} prefetch={false}><PageGlyph name={p.icon}/>{p.title}</Link></li>)}</ul>}{pages.tree.canManage&&depthOf(id,pages.tree.rows)<MAX_PAGE_DEPTH-1&&<Button variant="ghost" icon="plus" disabled={pages.busy} onClick={()=>pages.create(id)}>Add a subpage</Button>}</section>;}
