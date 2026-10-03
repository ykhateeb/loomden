import { copyFile, rm } from "node:fs/promises";
import { basename } from "node:path";
import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { type GrantKind, importCodeItems, importGrant, packageGrant } from "#core/grants";
import { exportFile, revealPath, sessionFile } from "#core/paths";
import { isUuid } from "#core/ids";
import { DIALOG_CANCELLED } from "#protocol";

type Event = Electron.IpcMainInvokeEvent;

/** Things only the main process can do. The agent process does not see these. */
export function registerHostIpc(grant: (kind: GrantKind, path: string) => void) {
  // A dialog on the window that asked, so it is modal there. With no window, a free dialog.
  const inWindow = <O, R>(e: Event, show: { (win: BrowserWindow, options: O): R; (options: O): R }, options: O) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return win ? show(win, options) : show(options);
  };

  // A step that runs code needs a yes. Cancel is the default: Enter or Space by mistake must not run a package's code.
  const confirmCode = async (e: Event, yes: string, { message, detail }: { message: string; detail: string }) => {
    const options: Electron.MessageBoxOptions = { type: "warning", buttons: [yes, "Cancel"], defaultId: 1, cancelId: 1, message, detail };
    const { response } = await inWindow(e, dialog.showMessageBox, options);
    if (response !== 0) throw new Error(DIALOG_CANCELLED);
  };

  // The user picks here, and main grants the picks. The window reads them by its id: it never names a path to grant.
  // ponytail: picks stay until the app quits; each is a few paths.
  const picks = new Map<string, string[]>();
  type Pick = { e: Event; id: unknown; kind: "folder" | "file"; options: Electron.OpenDialogOptions };
  const pickPaths = async ({ e, id, kind, options }: Pick) => {
    if (!isUuid(id)) throw new Error("Not a pick id");
    const result = await inWindow(e, dialog.showOpenDialog, options);
    if (result.canceled) return;
    for (const p of result.filePaths) grant(kind, p);
    picks.set(id, result.filePaths);
  };

  ipcMain.handle("host:pick-folder", (e, id: unknown) => pickPaths({ e, id, kind: "folder", options: { properties: ["openDirectory", "createDirectory"] } }));
  ipcMain.handle("host:pick-files", (e, id: unknown) => pickPaths({ e, id, kind: "file", options: { properties: ["openFile", "multiSelections"] } }));
  ipcMain.handle("host:picked", (_e, id: unknown) => (isUuid(id) && picks.get(id)) || []);

  // The dialog and the copy stay in one call: a path from the window could name any file.
  ipcMain.handle("host:save-html", async (e, id: unknown, name: unknown) => {
    const from = exportFile(id);
    const options: Electron.SaveDialogOptions = { defaultPath: `${(typeof name === "string" ? name : "session").replace(/[/\\:]/g, "-")}.html`, filters: [{ name: "HTML", extensions: ["html"] }] };
    const result = await inWindow(e, dialog.showSaveDialog, options);
    try {
      if (result.canceled || !result.filePath) throw new Error(DIALOG_CANCELLED);
      await copyFile(from, result.filePath);
    } finally {
      await rm(from, { force: true });
    }
  });

  // A dropped file: the preload gets its path from the real File (a page script cannot make one up).
  ipcMain.on("host:grant-drop", (_e, path: unknown) => typeof path === "string" && path && grant("file", path));

  // Installing a package runs its code. The window only asks; the user confirms here, in a dialog the page cannot draw.
  ipcMain.handle("host:confirm-install", async (e, action: unknown, source: unknown, cwd: unknown) => {
    if ((action !== "install" && action !== "update") || typeof source !== "string" || !source.trim()) throw new Error("Not a package to confirm");
    const where = typeof cwd === "string" && cwd ? `the project ${basename(cwd)}` : "every project (global)";
    const verb = action === "install" ? "Install" : "Update";
    await confirmCode(e, verb, {
      message: `${verb} ${source}?`,
      detail: `For ${where}. ${action === "update" ? "An update can bring a newer version you have not seen. " : ""}Extensions in a package run code on your computer with your own permissions. Install only packages you trust.`,
    });
    grant("package", packageGrant(action, source, typeof cwd === "string" ? cwd : undefined));
  });

  // Import from pi (board 5c): copying extensions or installing packages brings code into Tenon. Confirmed here.
  ipcMain.handle("host:confirm-import", async (e, items: unknown) => {
    const code = importCodeItems(Array.isArray(items) ? items : []);
    if (!code.length) return;
    await confirmCode(e, "Import", {
      message: "Bring terminal pi's extensions and packages into Tenon?",
      detail: `${code.includes("files") ? "Your extensions, skills and prompts are copied. " : ""}${code.includes("packages") ? "Your global packages are installed again. " : ""}Extensions run code on your computer with your own permissions.`,
    });
    grant("package", importGrant(code));
  });

  // A login page (board 5b). Only https: a page cannot make main open a file or another app.
  ipcMain.handle("host:open-external", (_e, url: unknown) => {
    if (typeof url === "string" && /^https:\/\//.test(url)) return shell.openExternal(url);
  });

  ipcMain.handle("host:show-in-folder", (_e, path: unknown) => shell.showItemInFolder(revealPath(path)));

  // The window shows model output, so it is not trusted: only a Tenon session file may go to the Trash.
  ipcMain.handle("host:trash-session", (_e, path: unknown) => shell.trashItem(sessionFile(path)));
}
