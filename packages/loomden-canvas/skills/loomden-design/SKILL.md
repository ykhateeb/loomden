---
name: loomden-design
description: Design screens as boards on a canvas (one HTML file per board) that the person can watch, point at, and approve. Use when asked to design, mock up, redesign, or sketch a screen or flow, or when the person sends notes about a board.
---

# Tenon design

You design screens as **boards**. A board is one self-contained HTML file. Boards live in a **canvas**, a folder in `.loomden/canvases/<slug>/`. The person watches boards appear in the canvas viewer (`/canvas`).

Read `references/format.md` before you write your first board. Read `references/craft.md` before you design.

## When to start a canvas

- Start one when the request is about how a screen or flow should look: "design the checkout", "mock up settings".
- Do not start one for code changes, bug fixes, or questions about existing code.
- One flow = one canvas. Add boards to the existing canvas when it fits (`canvas_read` with no args lists canvases).

## Steps

1. Look for `.loomden/design-system/tokens.json` and `README.md`. If they exist, use their tokens by name (`var(--link)`, `var(--space-4)`). Never write a raw hex value when a token exists.
2. Make the first draft. Call `canvas_plan` once with every board you will make, then `canvas_create` for each board, in flow order. The person sees a place for each board ("writing", "waiting") and each board appear.
3. Link boards with `<a href="payment.html">` so the flow can be played.
4. When you get a note ("On board Delivery, element “+ Add new address” (tid 14): …"):
   1. `canvas_read` the board. Find the element by its `data-tid`.
   2. Change only what the note asks for. `canvas_edit` with `baseRev` and small `edits`.
   3. `canvas_note_done` when the board shows the change.
5. Never set or claim approval. Only the person approves.

## Update the design system from code

When you get "Update the design system from code":
1. Read the theme file (`src/theme.ts`, or the paths in `source` of `tokens.json`). Read `references/format.md` for the `tokens.json` shape.
2. Map each color, font, spacing and radius value to a token. Use short names (`link`, `space-4`) and add `usage` for colors.
3. Call `design_system_propose` with the full tokens object. Do not write `tokens.json`: it is blocked. A person reviews the changes in the Design system tab and accepts them.
4. Tell the person to open `/canvas` and check the Design system tab.

## Rules

- The person may edit a board at any time. **Read right before you edit.** If `canvas_edit` fails with "changed by you at rev N", read the board again and redo your change on their version. Never overwrite it.
- Do not use `write` or `edit` on `boards/*.html`. They are blocked. Use `canvas_edit`.
- Keep every `data-tid` attribute. Notes point at them.
- No network, no external scripts, no `<iframe>`. Images come from `assets/` (`<img src="../assets/logo.png">`).

## Without the canvas tools

If `canvas_*` tools are not available, write the files yourself as `references/format.md` says: `boards/<name>.html`, and an entry in `canvas.json`. Bump `rev` on every save and copy the file to `history/<name>.r<N>.html`.
