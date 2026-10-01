# Tenon

Tenon is a desktop app for [pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent), a coding agent. It gives pi a window with sessions, a session tree, packages, and a design canvas. Tenon uses Electron, electron-vite, React 19, and Tailwind 4.

## Features

- **Sessions by project.** Each project folder has its own sessions. A session with no project can move to a project later.
- **Chat.** Send messages, attach images, and use `/` commands and `@` file references. Pick the model and the thinking level for each session.
- **Session tree.** See the branches of a session. Switch to a branch, fork it, or give it a label.
- **Search.** Press ⌘K to find text in the titles and messages of all sessions.
- **Packages.** Install, update, and remove pi packages, for all projects or for one project. Find packages on npm.
- **Settings.** Set the default model, add API keys, log in with a subscription, and add custom providers.
- **Import from terminal pi.** Copy your settings, providers, trust decisions, extensions, and packages from `~/.pi/agent`.
- **Design canvas.** The `tenon-canvas` package gives pi a canvas for UI design boards, with notes and approvals.

## Requirements

- Node.js and npm.
- macOS. The window and packaging are made for macOS.

## Get started

1. Install the dependencies:

   ```sh
   npm install
   ```

2. Start the app with hot reload:

   ```sh
   npm run dev
   ```

3. To make a packaged app in `dist/`, do this command:

   ```sh
   npm run dist
   ```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app with hot reload. |
| `npm run build` | Builds the app into `out/`. |
| `npm run dist` | Builds and packages the app with electron-builder. |
| `npm run typecheck` | Runs `tsc` on `src/`, `packages/`, and `e2e/`. |
| `npm test` | Runs the Vitest unit tests. |
| `npm run test:e2e` | Runs the Playwright tests. Do `npm run build` first. |
| `npm run gallery` | Shows the UI design system page. |

## Data

- Tenon keeps its data in `~/.loomden`. Its own pi agent folder is `~/.loomden/agent`.
- Tenon shares only `~/.pi/agent/auth.json` with terminal pi. Thus your API keys and logins work in both.
- A project's canvases are in `<project>/.loomden/canvases/`.

To keep a test run away from your real data, set `TENON_DIR` and `TENON_PI_DIR` to a temporary folder.

## Security

The window shows model output, so the agent process does not trust the commands that the window sends.

- A folder becomes a project only when you pick it in the folder dialog.
- The window can attach a file only when you pick it or drop it.
- A package install or update runs code. Tenon asks you in its own dialog first.
- Tenon loads a project's `.pi/` extensions, skills, and prompts only after you trust the project.

## Project structure

| Path | What it holds |
|---|---|
| `src/main/` | The main process: the window, native dialogs, and the start of the agent process. |
| `src/agent/` | The agent process. pi and all pi extensions run here, not in the window. |
| `src/core/` | The agent logic: projects, sessions, packages, providers, settings, and import. |
| `src/renderer/` | The React UI. Each feature folder has its components and an `actions.ts`. |
| `src/protocol.ts` | The messages between the window and the agent process. |
| `packages/tenon-canvas/` | The design canvas: a pi extension and the `tenon-design` skill. |
| `e2e/` | The Playwright tests of the app. |

`packages/tenon-canvas/` is also a usual pi package. To use it in terminal pi, do this command:

```sh
pi install ./packages/tenon-canvas
```

## License

Tenon is under the MIT License. See [LICENSE](LICENSE).
