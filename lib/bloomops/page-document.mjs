import {sanitizePublicHtml} from '../sanitize-public-html.mjs';
import {renderEquationsForPublic} from '../public-equations.mjs';
// Only derive reader markup after page authorization. Never persist this
// HTML back into the editor's source; inert bookmarks remain links.
export function renderPageDocument(source){
 return renderEquationsForPublic(sanitizePublicHtml(source,{documentFormatting:true}),{maxEquations:30,maxSourceLength:4096});
}
