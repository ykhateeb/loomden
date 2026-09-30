import { join } from "node:path";
import { type BrowserWindow, MessageChannelMain, type UtilityProcess, utilityProcess } from "electron";
import type { GrantKind } from "#core/grants";
import { LOOMDEN_AGENT_DIR, FREE_CANVAS_DIR, NO_PROJECT_DIR } from "#core/paths";

/** Starts the agent process and connects it to the window with a direct port. Main does not relay tokens. */
export function startAgent(win: BrowserWindow, env: NodeJS.ProcessEnv) {
  let child: UtilityProcess;
  let startedAt = 0;
  let quitting = false;
  // Kept here too, so a restarted agent gets them again.
  const grants: { kind: GrantKind; path: string }[] = [];

  const connect = () => {
    // The page can be gone (window closed, renderer crashed, dev server stopped): then there is nobody to connect.
    if (win.isDestroyed() || win.webContents.isDestroyed() || win.webContents.isCrashed()) return;
    const { port1, port2 } = new MessageChannelMain();
    try {
      win.webContents.postMessage("agent-port", null, [port1]);
    } catch {
      return; // "Render frame was disposed": the page is reloading; did-finish-load connects again
    }
    child.postMessage(null, [port2]);
  };

  const spawn = () => {
    startedAt = Date.now();
    child = utilityProcess.fork(join(import.meta.dirname, "agent.js"), [], {
      env: { ...env, PI_CODING_AGENT_DIR: LOOMDEN_AGENT_DIR, LOOMDEN_APP: "1", LOOMDEN_NO_PROJECT: NO_PROJECT_DIR, LOOMDEN_FREE_DIR: FREE_CANVAS_DIR },
      serviceName: "Loomden agent",
      stdio: "inherit",
    });
    for (const g of grants) child.postMessage({ grant: g });
    child.on("exit", (code) => {
      if (quitting || win.isDestroyed()) return;
      win.webContents.send("agent-exit");
      // ponytail: restart only after a run of 5s+, so a crash at startup does not loop. No backoff.
      if (Date.now() - startedAt < 5000) return console.error(`Loomden agent stopped at startup (code ${code})`);
      spawn();
      connect();
    });
  };

  spawn();
  win.webContents.on("did-finish-load", connect); // first load and every reload
  return {
    stop() {
      quitting = true;
      child.kill();
    },
    /** A path the user picked or dropped: the agent may use it. */
    grant(kind: GrantKind, path: string) {
      if (kind !== "package") grants.push({ kind, path }); // a package confirmation is for one use: not replayed after a restart
      child.postMessage({ grant: { kind, path } });
    },
  };
}
