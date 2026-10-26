# Text-file card visual check

- Source: user-supplied file-card screenshot in this conversation; the original attachment is visible in chat, with no local source path or intrinsic pixel dimensions exposed.
- Scope: the existing app's file-card layout, rather than a pixel-for-pixel recreation of the source file's document contents.
- Implementation: `/tmp/yua-file-card.png`, browser-rendered component crop, 320 × 240 CSS pixels at device scale factor 1. Browser viewport: 1280 × 900.
- State: white Markdown attachment card, unselected, download button hidden until hover.
- Comparison: the source and rendered card were inspected for the content-preview-above / icon-and-filename-below structure. The component crop is both the full-view and focused evidence; unrelated app chrome is outside this component-level reference.

## Findings

No actionable P0/P1/P2 differences in the requested layout.

- Typography: small, readable raw-document preview; larger filename on one line, truncating long names without changing the download name.
- Layout: rounded white frame, inset document preview, separate bottom filename row. Existing card resizing remains supported.
- Colors: neutral white/gray frame with a blue file icon, matching the supplied visual direction.
- Assets: the preview is actual file content, not a placeholder image; the file icon uses the installed icon library. No raster artwork is required by this UI reference.
- Content: the thumbnail displays the uploaded file, including Markdown syntax. The example file's text differs from the source document intentionally.

## Interaction evidence

Playwright checks cover thumbnail content, hidden/hover download states, byte-for-byte file/image downloads with original names and suffixes, timestamp-named UTF-8 text downloads, and right-button panning versus stationary context menus. Existing regressions cover opening attachments, groups, persistence, clipboard operations and undo/redo.

## Comparison history

The first visual comparison found no actionable layout changes. The separate right-drag test was corrected to start on an unobscured canvas/title region rather than on the floating search control; production panning and context menus pass.

## Follow-up polish

Exact source typography and document density are not asserted because source font metadata and intrinsic attachment dimensions are unavailable. This does not affect the requested component structure or functionality.

final result: passed
