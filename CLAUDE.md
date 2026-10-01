# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Tenon is an Electron desktop app for pi (`@earendil-works/pi-coding-agent`), a coding agent. It is built with electron-vite, React 19, and Tailwind 4.

## Commands

- `npm run dev`: start the app with hot reload.
- `npm run typecheck`: run `tsc` on `src/`, `packages/`, and `e2e/`. No lint tool exists.
  - `tsc` does not report unused imports. After you move code, remove unused imports by hand.
- `npm test`: run all Vitest unit tests (`*.test.ts` in `src/` and `packages/`).
  - One file: `npx vitest run src/core/sessions/tree.test.ts`. One test: add `-t "<name>"`.
- `npm run test:e2e`: run the Playwright tests (`e2e/*.e2e.ts`, `packages/*/e2e/*.e2e.ts`).
  - `e2e/tenon.e2e.ts` launches the built app. Run `npm run build` before it.
  - `packages/tenon-canvas/e2e/` runs the canvas server in the test process and drives it with Chromium. It needs no build.
  - One e2e test: `npx playwright test -g "<part of the title>"`.
- `npm run dist`: build and package the app with electron-builder.

## Dev environment variables

- `TENON_DIR` (default `~/.tenon`) and `TENON_PI_DIR` (default `~/.pi/agent`): set both to a temp folder to keep a test run away from real data. The e2e tests do this.
- Open the app on a given view with no clicks. Main puts these in the URL hash, and `src/renderer/src/store.ts` reads them:
  - `TENON_OPEN=latest|<part of a title>` opens a session. Add `TENON_VIEW=tree` to show its tree.
  - `TENON_SEARCH=<text>`, `TENON_TAB=sessions|packages|settings`, `TENON_DIALOG=provider|import`.
- `npm run gallery` (`TENON_GALLERY=1`): show the UI design system page (`src/renderer/src/ui/Gallery.tsx`). `TENON_GALLERY=open` also opens its menu and dialog.
- `TENON_NO_OPEN=1`: the canvas extension does not open a browser.

## Architecture

The app has three processes:

1. **Main** (`src/main/`): owns the window, native dialogs, and the host IPC (`host-ipc.ts`). It forks the agent process and gives the window a direct `MessagePort` to it (`agent-host.ts`). Main does not relay agent traffic.
2. **Agent** (`src/agent/index.ts`, an Electron `utilityProcess`): pi and all pi extensions run here, never in the window. `createHandle()` (`src/agent/handlers.ts`) dispatches each window command to its handler in `src/agent/<area>-commands.ts`. The logic lives in `src/core/`. `src/core/sessions/registry.ts` holds the open pi sessions and their commands. Next to it: `runtime.ts` (project trust, pi runtime creation), `live-state.ts` (the `LiveState` of a session), `move.ts` (moving a session to a project).
3. **Renderer** (`src/renderer/src/`): React UI. `store.ts` is one global store (`useSyncExternalStore`): state, `set()`, notices. `port.ts` sends commands (`call()`), and `agent-messages.ts` applies agent messages. Each feature folder has an `actions.ts`, and `actions.ts` joins them into the `actions` object that components use. Before you change the UI, read `src/renderer/CLAUDE.md`.

`src/protocol.ts` is the single source of truth for the window-to-agent contract: `Command` (window to agent, answered with a `reply` by `rid`) and `AgentOut` (agent to window).

### Add a window command

1. Add a variant to `Command` in `src/protocol.ts`.
2. Add its handler to the `<area>Commands()` map in `src/agent/<area>-commands.ts`. `tsc` fails until each `Command` type has a handler. For a new area, add a new file, and add its map to `createHandle()` in `src/agent/index.ts`.
3. Guard each value from the window (see "Trust model").
4. Add an action to `src/renderer/src/<feature>/actions.ts` that sends the command with `call()`.

### Add a host function

Main does the work that needs Electron's main process: native dialogs, the shell, and grants.

1. Add a method to the `host` object in `src/preload/index.ts`. The `Host` type comes from this object.
2. Add its `host:<name>` handler to `registerHostIpc()` in `src/main/host-ipc.ts`.
3. Give each argument the type `unknown`, and check it before use.

### Trust model

The window shows model output, so the agent and main treat each value from the window as untrusted. When you add a `Command` or a host function, guard each value from the window:

- A `cwd`: `assertProject` (`src/core/projects.ts`). A folder becomes a project only through main's folder picker.
- A session path: `sessionFile()` (`src/core/paths.ts`).
- A file path: `assertGranted("file", …)` (`src/core/grants.ts`). Main grants a file that the user picked or dropped, on its own channel to the agent.
- A package install or update: `assertGranted("package", packageGrant(…))`. The user confirms in main's own dialog, and the grant is for one use.

### Data locations

- Tenon keeps its own pi agent folder at `~/.tenon/agent`. Main sets `PI_CODING_AGENT_DIR` to it.
- Tenon shares only `auth.json` with terminal pi. The import feature copies other items from `~/.pi/agent`.
- `src/core/paths.ts` reads `TENON_DIR` and `TENON_PI_DIR` when a module imports it. A test that touches these folders sets `process.env` first and then uses `await import(…)`. A static import uses the real `~/.tenon`.

### Build

- Main and agent share build chunks in `out/main/chunks/`. Code that uses `import.meta.dirname` must stay agent-only, or its relative path breaks.
- pi loads user and third-party extensions at runtime with jiti. Thus the main build does not bundle dependencies, and electron-builder unpacks `@earendil-works` from the asar.
- The agent build bundles the canvas extension into `out/main/agent.js`. Rebuild before the app e2e test sees an extension change.

### tenon-canvas package

`packages/tenon-canvas/` is a pi package: a design canvas extension and the `tenon-design` skill. Before you change the package, or host code that imports `#canvas/*`, read `packages/tenon-canvas/CLAUDE.md`.

## Code rules

### Modules

- One module has one job. If a module gets a second job, split it by job, as in `src/core/sessions/`.
- Keep state in a `create…()` factory (`createRegistry`, `createRuntimes`, `createGrants`, `createDialogs`), not at module level. `src/agent/index.ts` makes each one once and passes it on. Old exceptions, marked `ponytail:`: `projects.ts`, `attachments.ts`, `design.ts`, `providers.ts`.
- Use the shared helpers. Do not copy them:
  - `readJson()`, `MODEL_SETTING_KEYS`: `src/core/settings.ts`
  - `manager()`, `resourceName()`: `src/core/packages.ts`
  - `availableModels()`: `src/core/providers.ts`
  - `contentText()`: `src/core/sessions/summary.ts`
  - `packageGrant()`, `GrantKind`: `src/core/grants.ts` (main uses them too)
  - `folderName()`: `src/renderer/src/chat/format.ts`

### Functions

- Use the stepdown rule: put the exported functions at the top of the file and their helpers below, in call order.
  - Write module-level helpers as `function` declarations. They are hoisted, so a call can come before the definition.
  - A helper that shares state with its caller (as `fork` and `connect` in `src/main/agent-host.ts`) stays a closure inside the caller.
- Keep each function at one level of abstraction. If a function mixes high-level steps with low-level details, move the details to a named helper.
- A new function with 3 or more parameters takes an object (for example, `createRegistry({ send, modelRuntime, grants, dialogs })`). Older functions with positional parameters remain. Change one when you change its signature for another reason.

### Types

- `tsconfig.json` has `strict: true`. Write new code without `any`. Old uses remain in `packages/tenon-canvas/`.
- Give data from outside the process (window commands, files, JSON) the type `unknown`, and narrow it before use.
- Derive types from their source: use `Command` and `AgentOut` from `#protocol`, and `Extract<…>`, `Pick<…>`, or `ReturnType<…>`, instead of a second copy of the shape.
- Use a union of string literals for a fixed set of values, not an `enum`.
- Give each exported function an explicit parameter type. Let `tsc` infer local variables.

### Imports

- Use `./x` in the same folder. For any other folder, use a `#` alias from the `"imports"` field of `package.json` (`#protocol`, `#preload`, `#core/*`, `#renderer/*`, `#canvas/*`). Do not use `../`.
- `tsconfig.json` `paths` repeats the wildcard aliases, because `tsc` does not add `.ts`/`.tsx` to them. If you add an alias, change both files.
- Import each file directly. The folders have no `index.ts` barrel files.
- Code in `packages/tenon-canvas/` does not use the aliases. Terminal pi loads it without this app.

### Tests

- Put a unit test next to its module, as `<module>.test.ts`.
- For files on disk, use a new temp folder from `mkdtempSync(join(tmpdir(), "tenon-<area>-"))`. For code that imports `src/core/paths.ts`, see "Data locations".
- The unit tests have no DOM. Test renderer logic as pure functions. Test the UI with the app e2e test or the gallery.

## Workflow

### Before you start a task

- Run `git fetch origin`, then look for changes that you did not pull: `git status -sb` shows `behind` for the current branch, and `git rev-list --count main..origin/main` counts the new commits on `main`.
- If there are such changes, get them first. Do not start work on an old copy. For the current branch: `git pull --ff-only`. For local `main` while you are on another branch: `git fetch origin main:main`.
- Make each new branch from the remote, not from local `main`: `git switch -c <type>/<topic> origin/main`.
- If the branch of your task is already on GitHub, pull its changes before you change it.

### Change size

- A reviewer must be able to review each commit in 5 minutes or less.
- Ship small working parts. Each commit is one complete small cycle: the change, its tests, and a pass of `npm run typecheck`, `npm test`, and `npm run build`.
- Split a large task into a series of such commits. Commit each part before you start the next one.
- Put a refactor and a behavior change in different commits.

### Pull requests

- Do not commit directly to `main`. Make a branch for each task, push it, and open a pull request to `main`.
- One pull request has one topic. It has the same size limit as a commit (see "Change size").
- CI (`.github/workflows/ci.yml`) runs `npm run typecheck`, `npm test`, and `npm run build` on each pull request, and a merge to `main` needs it to pass. Run the same checks locally before you open or update a pull request. CI does not run the e2e tests: if you changed the agent or the UI, run `npm run test:e2e` locally after the build.
- The description has these parts:
  - **What:** the change, in a few bullets.
  - **Why:** the reason for the change.
  - **Tests:** the commands that you ran and their results, with each known failure and its cause.
  - Each behavior change, marked `⚠ behavior change`.
- Do not merge a pull request with a failing check, unless the description gives the failure and shows that the same failure occurs on `main`.

## Comments and commits

- Comments like "board 2c" or "board C12" refer to numbered design boards of the product spec. That spec is not in this repo.
- Write comments and commit messages in short, plain English. Feature commit subjects name the step and boards (for example, "(step 9, board C12)"), and bullet lists follow.
- A `ponytail:` comment marks a deliberate simplification and states its limit.
