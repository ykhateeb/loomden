import { join } from "node:path";
import { app, BrowserWindow, shell } from "electron";
import { startAgent } from "./agent-host";
import { registerHostIpc } from "./host-ipc";
import { shellEnv } from "./shell-env";

const env = shellEnv();
// The window's agent; host dialogs tell it which paths the user picked.
let grantTo: (kind: "folder" | "file" | "package", path: string) => void = () => {};

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#0e1218",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
    },
  });

  // Links in model output open in the browser, never in the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  // In dev, show renderer errors in the terminal.
  if (!app.isPackaged) win.webContents.on("console-message", (e) => e.level === "error" && console.error("[renderer]", e.message));

  const agent = startAgent(win, env);
  win.on("closed", agent.stop);
  grantTo = agent.grant;

  // Dev checks without clicks: LOOMDEN_GALLERY=1|open shows the design system page; LOOMDEN_OPEN=latest|<part of a title>
  // opens that session, LOOMDEN_VIEW=tree in its tree, LOOMDEN_SEARCH=<text> opens ⌘K with that text.
  const dev = new URLSearchParams(Object.entries({ open: process.env.LOOMDEN_OPEN, view: process.env.LOOMDEN_VIEW, search: process.env.LOOMDEN_SEARCH, tab: process.env.LOOMDEN_TAB, dialog: process.env.LOOMDEN_DIALOG }).filter((e): e is [string, string] => !!e[1]));
  const hash = process.env.LOOMDEN_GALLERY ? `gallery${process.env.LOOMDEN_GALLERY === "open" ? "-open" : ""}` : dev.size ? `dev?${dev}` : undefined;
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL + (hash ? `#${hash}` : ""));
  else win.loadFile(join(import.meta.dirname, "../renderer/index.html"), { hash });
}

app.whenReady().then(() => {
  registerHostIpc((kind, path) => grantTo(kind, path));
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
