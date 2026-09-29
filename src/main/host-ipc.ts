import { copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { EXPORT_PREFIX, sessionFile } from "../core/paths";

/** Things only the main process can do. The agent process does not see these. */
export function registerHostIpc(grant: (kind: "folder" | "file" | "package", path: string) => void) {
  const parent = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender) ?? undefined;

  ipcMain.handle("host:pick-folder", async (e) => {
    const options: Electron.OpenDialogOptions = { properties: ["openDirectory", "createDirectory"] };
    const win = parent(e);
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled) return null;
    grant("folder", result.filePaths[0]);
    return result.filePaths[0];
  });

  // Moves an export from the agent's temporary file to a path the user picks here. Returns that path.
  ipcMain.handle("host:pick-files", async (e) => {
    const options: Electron.OpenDialogOptions = { properties: ["openFile", "multiSelections"] };
    const win = parent(e);
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled) return [];
    for (const p of result.filePaths) grant("file", p);
    return result.filePaths;
  });

  ipcMain.handle("host:save-html", async (e, temp: unknown, name: unknown) => {
    const from = typeof temp === "string" ? resolve(temp) : "";
    if (dirname(from) !== resolve(tmpdir()) || !basename(from).startsWith(EXPORT_PREFIX) || !from.endsWith(".html")) throw new Error("Not a Tau export");
    const options: Electron.SaveDialogOptions = { defaultPath: `${String(name).replace(/[/\\:]/g, "-")}.html`, filters: [{ name: "HTML", extensions: ["html"] }] };
    const win = parent(e);
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    try {
      if (!result.canceled && result.filePath) await copyFile(from, result.filePath);
    } finally {
      await rm(from, { force: true });
    }
    return result.canceled ? null : result.filePath;
  });

  // A dropped file: the preload gets its path from the real File (a page script cannot make one up).
  ipcMain.on("host:grant-drop", (_e, path: unknown) => typeof path === "string" && path && grant("file", path));

  // Installing a package runs its code. The window only asks; the user confirms here, in a dialog the page cannot draw.
  ipcMain.handle("host:confirm-install", async (e, action: unknown, source: unknown, cwd: unknown) => {
    if ((action !== "install" && action !== "update") || typeof source !== "string" || !source.trim()) return false;
    const where = typeof cwd === "string" && cwd ? `the project ${cwd.split("/").pop()}` : "every project (global)";
    const verb = action === "install" ? "Install" : "Update";
    const options: Electron.MessageBoxOptions = {
      type: "warning",
      buttons: [verb, "Cancel"],
      defaultId: 1, // Enter or Space by mistake must not run a package's code
      cancelId: 1,
      message: `${verb} ${source}?`,
      detail: `For ${where}. ${action === "update" ? "An update can bring a newer version you have not seen. " : ""}Extensions in a package run code on your computer with your own permissions. Install only packages you trust.`,
    };
    const win = parent(e);
    const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    if (response !== 0) return false;
    grant("package", `${action}|${typeof cwd === "string" ? cwd : ""}|${source}`);
    return true;
  });

  // Import from pi (board 5c): copying extensions or installing packages brings code into Tau. Confirmed here.
  ipcMain.handle("host:confirm-import", async (e, items: unknown) => {
    const code = (Array.isArray(items) ? items : []).filter((i): i is string => i === "files" || i === "packages").sort();
    if (!code.length) return true;
    const options: Electron.MessageBoxOptions = {
      type: "warning",
      buttons: ["Import", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      message: "Bring terminal pi's extensions and packages into Tau?",
      detail: `${code.includes("files") ? "Your extensions, skills and prompts are copied. " : ""}${code.includes("packages") ? "Your global packages are installed again. " : ""}Extensions run code on your computer with your own permissions.`,
    };
    const win = parent(e);
    const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    if (response !== 0) return false;
    grant("package", `import||${code.join(",")}`);
    return true;
  });

  // A login page (board 5b). Only https: a page cannot make main open a file or another app.
  ipcMain.handle("host:open-external", (_e, url: unknown) => {
    if (typeof url === "string" && /^https:\/\//.test(url)) return shell.openExternal(url);
  });

  ipcMain.handle("host:show-in-folder", (_e, path: unknown) => {
    if (typeof path === "string") shell.showItemInFolder(resolve(path));
  });

  // The window shows model output, so it is not trusted: only a Tau session file may go to the Trash.
  ipcMain.handle("host:trash-session", (_e, path: unknown) => shell.trashItem(sessionFile(path)));
}
