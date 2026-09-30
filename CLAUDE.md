# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Loomden is an Electron desktop app for pi (`@earendil-works/pi-coding-agent`), a coding agent. It is built with electron-vite, React 19, and Tailwind 4.

## Commands

- `npm run dev`: start the app with hot reload.
- `npm run typecheck`: run `tsc` on `src/`, `packages/`, and `e2e/`. No lint tool exists.
  - `tsc` does not report unused imports. After you move code, remove unused imports by hand.
- `npm test`: run all Vitest unit tests (`*.test.ts` in `src/` and `packages/`).
  - One file: `npx vitest run src/core/sessions/tree.test.ts`. One test: add `-t "<name>"`.
- `npm run test:e2e`: run the Playwright tests (`e2e/*.e2e.ts`, `packages/*/e2e/*.e2e.ts`).
  - `e2e/loomden.e2e.ts` launches the built app. Run `npm run build` before it.
  - `packages/loomden-canvas/e2e/` runs the canvas server in the test process and drives it with Chromium. It needs no build.
  - One e2e test: `npx playwright test -g "<part of the title>"`.
- `npm run dist`: build and package the app with electron-builder.

## Dev environment variables

- `LOOMDEN_DIR` (default `~/.loomden`) and `LOOMDEN_PI_DIR` (default `~/.pi/agent`): set both to a temp folder to keep a test run away from real data. The e2e tests do this.
- Open the app on a given view with no clicks. Main puts these in the URL hash, and `src/renderer/src/store.ts` reads them:
  - `LOOMDEN_OPEN=latest|<part of a title>` opens a session. Add `LOOMDEN_VIEW=tree` to show its tree.
  - `LOOMDEN_SEARCH=<text>`, `LOOMDEN_TAB=sessions|packages|settings`, `LOOMDEN_DIALOG=provider|import`.
- `npm run gallery` (`LOOMDEN_GALLERY=1`): show the UI design system page (`src/renderer/src/ui/Gallery.tsx`). `LOOMDEN_GALLERY=open` also opens its menu and dialog.
- `LOOMDEN_NO_OPEN=1`: the canvas extension does not open a browser.

## Architecture

The app has three processes:

1. **Main** (`src/main/`): owns the window, native dialogs, and the host IPC (`host-ipc.ts`). It forks the agent process and gives the window a direct `MessagePort` to it (`agent-host.ts`). Main does not relay agent traffic.
2. **Agent** (`src/agent/index.ts`, an Electron `utilityProcess`): pi and all pi extensions run here, never in the window. `handle()` is the one dispatcher for window commands. The logic lives in `src/core/`. `src/core/sessions/registry.ts` holds the open pi sessions and their commands. Next to it: `runtime.ts` (project trust, pi runtime creation), `live-state.ts` (the `LiveState` of a session), `move.ts` (moving a session to a project).
3. **Renderer** (`src/renderer/src/`): React UI. `store.ts` is one global store (`useSyncExternalStore`) that sends commands and applies agent messages.

`src/protocol.ts` is the single source of truth for the window-to-agent contract: `Command` (window to agent, answered with a `reply` by `rid`) and `AgentOut` (agent to window). To add a feature, add a `Command` variant, a case in `handle()`, and a call in the renderer store.

### Trust model

The window shows model output, so the agent treats every window command as untrusted. When you add a `Command`, guard each value from the window:

- A `cwd`: `assertProject` (`src/core/projects.ts`). A folder becomes a project only through main's folder picker.
- A session path: `sessionFile()` (`src/core/paths.ts`).
- A file path: `assertGranted("file", …)` (`src/core/grants.ts`). Main grants a file that the user picked or dropped, on its own channel to the agent.
- A package install or update: `assertGranted("package", packageGrant(…))`. The user confirms in main's own dialog, and the grant is for one use.

### Data locations

- Loomden keeps its own pi agent folder at `~/.loomden/agent`. Main sets `PI_CODING_AGENT_DIR` to it.
- Loomden shares only `auth.json` with terminal pi. The import feature copies other items from `~/.pi/agent`.
- `src/core/paths.ts` reads `LOOMDEN_DIR` and `LOOMDEN_PI_DIR` when a module imports it. A test that touches these folders sets `process.env` first and then uses `await import(…)`. A static import uses the real `~/.loomden`.

### Modular design

- One module has one job. If a module gets a second job, split it by job, as in `src/core/sessions/`.
- Keep state in a `create…()` factory (`createRegistry`, `createRuntimes`), not at module level. Old exceptions: `grants.ts`, `projects.ts`, `attachments.ts`, `design.ts`, `extension-ui.ts`.
- A function with 3 or more parameters takes an object (for example, `designOpen(target, host)`).
- Use the shared helpers. Do not copy them:
  - `readJson()`, `MODEL_SETTING_KEYS`: `src/core/settings.ts`
  - `manager()`, `resourceName()`: `src/core/packages.ts`
  - `availableModels()`: `src/core/providers.ts`
  - `contentText()`: `src/core/sessions/summary.ts`
  - `packageGrant()`, `GrantKind`: `src/core/grants.ts` (main uses them too)
  - `folderName()`: `src/renderer/src/chat/format.ts`

### loomden-canvas package

`packages/loomden-canvas/` is a pi package: a design canvas extension (`src/extension.ts`) and the `loomden-design` skill. It also works in terminal pi, which loads it with jiti.

- Loomden imports the extension in `src/core/sessions/runtime.ts` (`extensionFactories`), so it is bundled into `out/main/agent.js`. Rebuild before the app e2e test sees an extension change.
- Loomden reads only `skills/` from disk, at a path relative to `out/main/`. If you move the skills folder, change `runtime.ts` and `electron-builder.yml` too.
- Main and agent share build chunks in `out/main/chunks/`. Code that uses `import.meta.dirname` must stay agent-only, or its relative path breaks.
- The host also imports `store.ts` and `server.ts` from the package (`src/core/sessions/move.ts`, `src/core/design.ts`).

- Canvases live in `<project>/.loomden/canvases/<slug>/`. A session with no project keeps them in `~/.loomden/sessions/<id>/canvases`.
- The extension reads `LOOMDEN_APP`, `LOOMDEN_NO_PROJECT`, and `LOOMDEN_FREE_DIR` to know that it runs inside Loomden.
- pi loads user and third-party extensions at runtime with jiti. Thus the main build does not bundle dependencies, and electron-builder unpacks `@earendil-works` from the asar.

## Conventions

- Comments like "board 2c" or "board C12" refer to numbered design boards of the product spec. That spec is not in this repo.
- Write comments and commit messages in short, plain English. Feature commit subjects name the step and boards (for example, "(step 9, board C12)"), and bullet lists follow.
- A `ponytail:` comment marks a deliberate simplification and states its limit.
- Imports: use `./x` in the same folder. For any other folder, use a `#` alias from the `"imports"` field of `package.json` (`#protocol`, `#preload`, `#core/*`, `#renderer/*`, `#canvas/*`). Do not use `../`.
  - `tsconfig.json` `paths` repeats the wildcard aliases, because `tsc` does not add `.ts`/`.tsx` to them. If you add an alias, change both files.
  - Import each file directly. The folders have no `index.ts` barrel files.
  - Code in `packages/loomden-canvas/` does not use the aliases. Terminal pi loads it without this app.
