# loomden-canvas

This folder is a pi package: a design canvas extension (`src/extension.ts`) and the `loomden-design` skill (`skills/`). It works in Loomden and in terminal pi. Terminal pi loads it with jiti, without the app.

## How Loomden uses the package

Paths in this section start at the repo root.

- Loomden imports the extension in `src/core/sessions/runtime.ts` (`extensionFactories`). The agent build bundles it into `out/main/agent.js`.
- Loomden reads only `packages/loomden-canvas/skills/` from disk, at a path relative to `out/main/`. If you move the skills folder, change `src/core/sessions/runtime.ts` and `electron-builder.yml` too.
- The host also imports `store.ts` and `server.ts` of this package through the `#canvas/*` alias. Search for `#canvas/` to find these callers.
- The extension reads `LOOMDEN_APP`, `LOOMDEN_NO_PROJECT`, and `LOOMDEN_FREE_DIR` to know that it runs inside Loomden.

## Data

- Canvases live in `<project>/.loomden/canvases/<slug>/`.
- A session with no project keeps them in `~/.loomden/sessions/<id>/canvases`.

## Code rules

- Use relative imports in this package. Terminal pi loads it without the `#` aliases of the app.
- Old uses of `any` remain here. Write new code without `any`.
