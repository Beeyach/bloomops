import {Selection} from '@tiptap/pm/state';
// Move one top-level document block. Containers travel intact, so moving a
// table/list/column group never splits its children or rewrites their marks.
function location(state,direction){
 if(!state||![1,-1].includes(direction))return null;
 const {doc,selection}=state,index=selection.$from.index(0),node=doc.maybeChild(index);
 if(!node)return null;
 let start=0;for(let i=0;i<index;i++)start+=doc.child(i).nodeSize;
 if(selection.to>start+node.nodeSize||selection.from<start)return null;
 const other=doc.maybeChild(index+direction);if(!other)return null;
 return {node,other,start,delta:direction===-1?-other.nodeSize:other.nodeSize};
}
export const canMoveDocumentBlock=(state,direction)=>Boolean(location(state,direction));
export function moveDocumentBlock(state,direction,dispatch){
 const at=location(state,direction);if(!at)return false;
 if(!dispatch)return true;
 const {node,other,start,delta}=at,from=direction===-1?start-other.nodeSize:start,to=direction===-1?start+node.nodeSize:start+node.nodeSize+other.nodeSize;
 const tr=state.tr.replaceWith(from,to,direction===-1?[node,other]:[other,node]);
 const selected=state.selection.toJSON();if(typeof selected.anchor==='number')selected.anchor+=delta;if(typeof selected.head==='number')selected.head+=delta;if(typeof selected.pos==='number')selected.pos+=delta;
 tr.setSelection(Selection.fromJSON(tr.doc,selected));dispatch(tr.scrollIntoView());return true;
}
