import { copyFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { type GrantKind, packageGrant } from "#core/grants";
import { exportFile, sessionFile } from "#core/paths";
import { isUuid } from "#core/ids";
import { CODE_ITEMS, DIALOG_CANCELLED } from "#protocol";

/** The buttons of a warning box: [confirm, "Cancel"]. Cancel is the default, so Enter or Space by mistake runs no code. */
const CONFIRM_BUTTON = 0;
const CANCEL_BUTTON = 1;

/** Things only the main process can do. The agent process does not see these. */
export function registerHostIpc(grant: (kind: GrantKind, path: string) => void): void {
  // Each dialog shows on the window that asked, if it still exists.
  const parent = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender) ?? undefined;
  const openDialog = (e: Electron.IpcMainInvokeEvent, options: Electron.OpenDialogOptions) => {
    const win = parent(e);
    return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
  };
  const saveDialog = (e: Electron.IpcMainInvokeEvent, options: Electron.SaveDialogOptions) => {
    const win = parent(e);
    return win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options);
  };
  /** A warning box that the user must confirm. A cancel throws DIALOG_CANCELLED. */
  const confirmWarning = async (e: Electron.IpcMainInvokeEvent, { confirm, message, detail }: { confirm: string; message: string; detail: string }) => {
    const options: Electron.MessageBoxOptions = { type: "warning", buttons: [confirm, "Cancel"], defaultId: CANCEL_BUTTON, cancelId: CANCEL_BUTTON, message, detail };
    const win = parent(e);
    const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    if (response !== CONFIRM_BUTTON) throw new Error(DIALOG_CANCELLED);
  };

  // The user picks here, and main grants the picks. The window reads them by its id: it never names a path to grant.
  // ponytail: picks stay until the app quits; each is a few paths.
  const picks = new Map<string, string[]>();
  type Pick = { e: Electron.IpcMainInvokeEvent; id: unknown; kind: "folder" | "file"; options: Electron.OpenDialogOptions };
  const pickPaths = async ({ e, id, kind, options }: Pick) => {
    if (!isUuid(id)) throw new Error("Not a pick id");
    const result = await openDialog(e, options);
    if (result.canceled) return;
    for (const p of result.filePaths) grant(kind, p);
    picks.set(id, result.filePaths);
  };

  ipcMain.handle("host:pick-folder", (e, id: unknown) => pickPaths({ e, id, kind: "folder", options: { properties: ["openDirectory", "createDirectory"] } }));
  ipcMain.handle("host:pick-files", (e, id: unknown) => pickPaths({ e, id, kind: "file", options: { properties: ["openFile", "multiSelections"] } }));
  ipcMain.handle("host:picked", (_e, id: unknown) => picks.get(String(id)) ?? []);

  // The dialog and the copy stay in one call: a path from the window could name any file.
  ipcMain.handle("host:save-html", async (e, id: unknown, name: unknown) => {
    const from = exportFile(id);
    const result = await saveDialog(e, { defaultPath: `${String(name).replace(/[/\\:]/g, "-")}.html`, filters: [{ name: "HTML", extensions: ["html"] }] });
    try {
      if (result.canceled || !result.filePath) throw new Error(DIALOG_CANCELLED);
      await copyFile(from, result.filePath);
    } finally {
      await rm(from, { force: true });
    }
  });

  // A dropped file: the preload gets its path from the real File (a page script cannot make one up).
  ipcMain.on("host:grant-drop", (_e, path: unknown) => {
    if (typeof path === "string" && path) grant("file", path);
  });

  // Installing a package runs its code. The window only asks; the user confirms here, in a dialog the page cannot draw.
  ipcMain.handle("host:confirm-install", async (e, action: unknown, source: unknown, cwd: unknown) => {
    if (!isPackageAction(action) || typeof source !== "string" || !source.trim()) throw new Error("Not a package to confirm");
    const project = typeof cwd === "string" && cwd ? cwd : undefined;
    const where = project ? `the project ${project.split("/").pop()}` : "every project (global)";
    const verb = action === "install" ? "Install" : "Update";
    const update = action === "update" ? "An update can bring a newer version you have not seen. " : "";
    await confirmWarning(e, {
      confirm: verb,
      message: `${verb} ${source}?`,
      detail: `For ${where}. ${update}Extensions in a package run code on your computer with your own permissions. Install only packages you trust.`,
    });
    grant("package", packageGrant(action, source, project));
  });

  // Import from pi (board 5c): copying extensions or installing packages brings code into Tenon. Confirmed here.
  ipcMain.handle("host:confirm-import", async (e, items: unknown) => {
    const code = CODE_ITEMS.filter((i) => Array.isArray(items) && items.includes(i));
    if (!code.length) return;
    const files = code.includes("files") ? "Your extensions, skills and prompts are copied. " : "";
    const packages = code.includes("packages") ? "Your global packages are installed again. " : "";
    await confirmWarning(e, {
      confirm: "Import",
      message: "Bring terminal pi's extensions and packages into Tenon?",
      detail: `${files}${packages}Extensions run code on your computer with your own permissions.`,
    });
    grant("package", packageGrant("import", code.join(",")));
  });

  // A login page (board 5b). Only https: a page cannot make main open a file or another app.
  ipcMain.handle("host:open-external", (_e, url: unknown) => {
    if (typeof url === "string" && /^https:\/\//.test(url)) return shell.openExternal(url);
  });

  ipcMain.handle("host:show-in-folder", (_e, path: unknown) => {
    if (typeof path === "string") shell.showItemInFolder(resolve(path));
  });

  // The window shows model output, so it is not trusted: only a Tenon session file may go to the Trash.
  ipcMain.handle("host:trash-session", (_e, path: unknown) => shell.trashItem(sessionFile(path)));
}

const isPackageAction = (action: unknown): action is "install" | "update" => action === "install" || action === "update";
