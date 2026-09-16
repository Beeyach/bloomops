import PageBody from './PageBody';
import PageRecordContext from './PageRecordContext';
import PageComments from './PageComments';
import {PageBreadcrumbs,PageChildren} from './PagesWorkspace';
import PageGlyph from './PageGlyph';
export default function PageReader({page,userId}){return <article className="bo-page-editor bo-page-reader"><div className="bo-page-toolbar"><PageBreadcrumbs id={page.id}/><span>{page.canComment?'Can comment':'Can view'}</span><PageComments id={page.id} workspaceId={page.workspaceId}/></div><div className="bo-page-title"><span className="bo-page-mark"><PageGlyph name={page.icon} size={22}/></span><h1>{page.title}</h1></div><PageBody key={page.id} page={page}/><PageRecordContext key={JSON.stringify([userId,page.workspaceId,page.id])} pageId={page.id} workspaceId={page.workspaceId} userId={userId}/><PageChildren id={page.id}/></article>;}
