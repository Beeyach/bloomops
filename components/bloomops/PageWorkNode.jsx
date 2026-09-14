'use client';
import {NodeViewWrapper, ReactNodeViewRenderer} from '@tiptap/react';
import {DatabaseView} from '../../lib/editor-extensions.mjs';
import PageWorkView from './PageWorkView';

export function pageWorkNode(context) {
  function WorkNode({node, updateAttributes, editor}) {
    return <NodeViewWrapper className="ltb-dbview bo-work-view-node" contentEditable={false}>
      <PageWorkView {...context} attrs={node.attrs} onConfigure={attrs => {updateAttributes(attrs); editor.storage.requestSave?.();}}/>
    </NodeViewWrapper>;
  }
  return DatabaseView.extend({addNodeView() {return ReactNodeViewRenderer(WorkNode);}});
}
