# Document block movement preview

Bloomsi retains the existing writing canvas and adds compact SVG up/down controls for the selected document block. Ctrl/Cmd+Shift+ArrowUp/ArrowDown also moves it. Nested content stays together; undo, autosave and recovery use the existing editor.

- [Desktop](movement-desktop.png)
- [Mobile](movement-mobile.png)
- [Small mobile](movement-small-mobile.png)

Local built Worker with synthetic documents only. 36 movement browser checks cover keyboard, buttons, touch, whole nested blocks, boundaries, undo/redo, reload, inherited dragging and five widths. 45 existing editor/recovery checks passed before the gap-cursor-only fix. The final movement checks additionally cover a real keyboard-created gap cursor moving the same divider in both directions. These captures show the final build with a collapsed text selection so its controls are visible. No deployment; BUILD_STATE owns acceptance.
