import { join } from "node:path";
import { type BrowserWindow, MessageChannelMain, utilityProcess } from "electron";
import type { GrantKind } from "#core/grants";
import { LOOMDEN_AGENT_DIR, FREE_CANVAS_DIR, NO_PROJECT_DIR } from "#core/paths";

/** A crash sooner than this after a start is a startup crash: no restart, so it does not loop. */
const MIN_RUN_MS = 5000;

/** Starts the agent process and connects it to the window with a direct port. Main does not relay tokens. */
export function startAgent(win: BrowserWindow, env: NodeJS.ProcessEnv) {
  const agentEnv = { ...env, PI_CODING_AGENT_DIR: LOOMDEN_AGENT_DIR, LOOMDEN_APP: "1", LOOMDEN_NO_PROJECT: NO_PROJECT_DIR, LOOMDEN_FREE_DIR: FREE_CANVAS_DIR };
  const grantsToReplay: { kind: GrantKind; path: string }[] = []; // a restarted agent gets them again
  let quitting = false;
  let child = fork();
  win.webContents.on("did-finish-load", connect); // first load and every reload

  return {
    stop() {
      quitting = true;
      child.kill();
    },
    /** A path the user picked or dropped: the agent may use it. */
    grant(kind: GrantKind, path: string) {
      if (kind !== "package") grantsToReplay.push({ kind, path }); // a package confirmation is for one use: not replayed after a restart
      child.postMessage({ grant: { kind, path } });
    },
  };

  function fork() {
    const startedAt = Date.now();
    const next = utilityProcess.fork(join(import.meta.dirname, "agent.js"), [], { env: agentEnv, serviceName: "Loomden agent", stdio: "inherit" });
    for (const g of grantsToReplay) next.postMessage({ grant: g });
    next.on("exit", (code) => onExit(code, Date.now() - startedAt));
    return next;
  }

  function onExit(code: number, ranMs: number) {
    if (quitting || win.isDestroyed()) return;
    win.webContents.send("agent-exit");
    // ponytail: no backoff. A crash after MIN_RUN_MS restarts at once, each time.
    if (ranMs < MIN_RUN_MS) return console.error(`Loomden agent stopped at startup (code ${code})`);
    child = fork();
    connect();
  }

  function connect() {
    // The page can be gone (window closed, renderer crashed, dev server stopped): then there is nobody to connect.
    if (win.isDestroyed() || win.webContents.isDestroyed() || win.webContents.isCrashed()) return;
    const { port1, port2 } = new MessageChannelMain();
    try {
      win.webContents.postMessage("agent-port", null, [port1]);
    } catch {
      return; // "Render frame was disposed": the page is reloading; did-finish-load connects again
    }
    child.postMessage(null, [port2]);
  }
}
