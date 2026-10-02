import { contextBridge, ipcRenderer, webUtils } from "electron";

// The agent port cannot cross contextBridge, so post it to the page.
ipcRenderer.on("agent-port", (e) => window.postMessage("tenon:agent-port", "*", e.ports));
ipcRenderer.on("agent-exit", () => window.postMessage("tenon:agent-exit", "*"));

const host = {
  /** Main shows its folder dialog, grants the pick, and keeps it under `id`. Read it with picked(). */
  pickFolder: (id: string): Promise<void> => ipcRenderer.invoke("host:pick-folder", id),
  /** Main shows its file dialog, grants the picks, and keeps them under `id`. Read them with picked(). */
  pickFiles: (id: string): Promise<void> => ipcRenderer.invoke("host:pick-files", id),
  /** The paths that the user picked under `id`. [] = the user cancelled. */
  picked: (id: string): Promise<string[]> => ipcRenderer.invoke("host:picked", id),
  /** Let the agent read a dropped file. The path comes from the real File: a page script cannot make one up. */
  grantDrop: (file: File): void => {
    const path = webUtils.getPathForFile(file);
    if (path) ipcRenderer.send("host:grant-drop", path);
  },
  /** The disk path of a dropped file (Electron 32 removed File.path). */
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  /** Main asks where to save, then moves the export `id` there. A cancel throws DIALOG_CANCELLED. */
  saveHtml: (id: string, name: string): Promise<void> => ipcRenderer.invoke("host:save-html", id, name),
  /** Main shows its own dialog. If the user confirms, the agent may install or update it (once). A cancel throws DIALOG_CANCELLED. */
  confirmInstall: (action: "install" | "update", source: string, cwd?: string): Promise<void> => ipcRenderer.invoke("host:confirm-install", action, source, cwd ?? ""),
  /** Main confirms the code items of an import (extension files, packages). A cancel throws DIALOG_CANCELLED. */
  confirmImport: (items: string[]): Promise<void> => ipcRenderer.invoke("host:confirm-import", items),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("host:open-external", url),
  showInFolder: (path: string): Promise<void> => ipcRenderer.invoke("host:show-in-folder", path),
  trashSession: (path: string): Promise<void> => ipcRenderer.invoke("host:trash-session", path),
};

contextBridge.exposeInMainWorld("tenon", host);

export type Host = typeof host;
