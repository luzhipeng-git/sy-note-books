# IronPress — local patch

Upstream: `ironpress` 1.4.3 (crates.io).
Pinned via `[patch.crates-io]` in `../Cargo.toml`.

## Why this is vendored

IronPress 1.4.3 silently drops `<img>` (and `<svg>`) elements that are nested
inside a block element such as `<p>`. Since `pulldown-cmark` always wraps a
markdown image in a paragraph (`<p><img .../></p>`), **every** image
disappeared from exported PDFs.

### Root cause

Block layout (`src/layout/block.rs`) collects an element's children via
`collect_text_runs` (`src/layout/text.rs`). A child is treated as "inline text"
when `collects_as_inline_text(tag)` is true, which — for `<img>`/`<svg>` — it
incorrectly was (they are `is_inline()`). As a result the replaced element was
collected as *text*, but having no text children it contributed nothing and was
discarded. `load_image_from_element` was never called.

Only `<img>` elements that were **direct children of `<body>`** rendered,
because that path goes through `flatten_nodes` → `flatten_element` instead of
text-run collection.

## The patch

`src/layout/helpers.rs`

- `collects_as_inline_text` now **excludes** `Img` and `Svg` (replaced elements
  carry a binary payload, not text).
- New `is_replaced_layout_child(tag)` helper identifying `Img` / `Svg`.

`src/layout/block.rs`

- The block-child detection predicates (`has_block_kids_for_wrapper`,
  `has_block_children`, and the mixed-content child loop) now treat a replaced
  child (`<img>`/`<svg>`) as "block-like", so it is routed through
  `flatten_element` — which renders images and SVG correctly — instead of text
  collection.

## Upgrading

When bumping `ironpress` upstream, re-vendor the new source and re-apply the
diff above (see `git log -- vendor/ironpress/src/layout/`). Remove this patch
once the upstream fix is confirmed via the regression test
`export_file_as_pdf_whiteboard_svg_image` and `export_file_as_pdf_embedded_png_image`
(which assert the PDF contains an image XObject).
