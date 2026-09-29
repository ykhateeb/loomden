# Canvas file format

```
.tau/
  design-system/        tokens.json (source), tokens.css (generated), README.md
  canvases/<slug>/
    canvas.json         the index
    boards/<name>.html  one file per board
    approved/           copies of approved revs (a person approves)
    assets/             images, fonts
    history/            every rev, this computer only (git-ignored)
```

## canvas.json

```json
{
  "v": 1,
  "title": "Checkout redesign",
  "designSystem": "../../design-system",
  "boards": {
    "boards/cart.html": { "title": "Cart", "x": 0, "y": 0, "w": 390, "h": 844, "rev": 6, "by": "pi", "approved": 6 }
  },
  "order": ["boards/cart.html"],
  "notes": {
    "n2": {
      "board": "boards/delivery.html",
      "target": { "tid": "14", "text": "+ Add new address", "box": [8, 212, 190, 30] },
      "text": "Let people edit a saved address here too",
      "state": "open", "by": "you", "at": "2026-09-29T12:03:00Z"
    }
  }
}
```

- `rev` goes up by one on every save. `by` is who made the last rev (`pi` or `you`).
- `approved` is the approved rev, or missing. Only a person sets it.
- Note `state`: `open` (saved) → `sent` → `work` (you are on it) → `done`.
- Links between boards are not stored. They come from `<a href="payment.html">`.

## history/

- `history/<name>.r<N>.html`: the full file at each rev.
- `history/log.jsonl`: one line per save: `{"board":"boards/cart.html","rev":6,"by":"pi","at":"…","why":"…"}`.
- Restore never deletes. It saves the old content as a new rev.

## A board

- One self-contained HTML file. The root element has a **fixed size** equal to the board's `w` × `h` (phone: 390 × 844). Set `html, body { margin: 0; width: 390px; height: 844px; overflow: hidden }`.
- Styles are inline or in one `<style>` in `<head>`. Colors, type and spacing use design-system variables. No raw hex when a token exists.
- Use real elements: `<button>`, `<a href>`, `<input>` with `<label>`.
- No network, no external scripts, no `<iframe>`. The server adds `tokens.css` and the point script.
- The server stamps `data-tid` on every element on save. Keep them when you rewrite a board.

## tokens.json

```json
{ "name": "mobile-app", "version": 1,
  "color":   { "tokens": [{ "name": "link", "value": "#4e6f94", "usage": "Links, add actions" }] },
  "type":    { "families": { "sans": "Inter, system-ui" },
               "styles": [{ "name": "label-strong", "fontSize": "12px", "lineHeight": "16px", "fontWeight": 650 }] },
  "spacing": { "tokens": [{ "name": "space-4", "value": "16px" }] },
  "radius":  { "tokens": [{ "name": "radius-md", "value": "10px" }] } }
```

Generated variables: `--link`, `--space-4`, `--radius-md`, `--font-sans`, and for each type style `--label-strong-font-size`, `--label-strong-line-height`, `--label-strong-font-weight`.
