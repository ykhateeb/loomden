import { contextBridge, ipcRenderer, webUtils } from "electron";

// The agent port cannot cross contextBridge, so post it to the page.
ipcRenderer.on("agent-port", (e) => window.postMessage("tenon:agent-port", "*", e.ports));
ipcRenderer.on("agent-exit", () => window.postMessage("tenon:agent-exit", "*"));

const host = {
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke("host:pick-folder"),
  pickFiles: (): Promise<string[]> => ipcRenderer.invoke("host:pick-files"),
  /** The disk path of a dropped file (Electron 32 removed File.path). */
  pathForFile: (file: File): string => {
    const path = webUtils.getPathForFile(file);
    if (path) ipcRenderer.send("host:grant-drop", path);
    return path;
  },
  /** Main asks where to save, then moves the export `id` there. A cancel throws SAVE_CANCELLED. */
  saveHtml: (id: string, name: string): Promise<void> => ipcRenderer.invoke("host:save-html", id, name),
  /** Main shows its own dialog; true = the user confirmed, and the agent may install or update it (once). */
  confirmInstall: (action: "install" | "update", source: string, cwd?: string): Promise<boolean> => ipcRenderer.invoke("host:confirm-install", action, source, cwd ?? ""),
  /** Main confirms the code items of an import (extension files, packages); true = go. */
  confirmImport: (items: string[]): Promise<boolean> => ipcRenderer.invoke("host:confirm-import", items),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("host:open-external", url),
  showInFolder: (path: string): Promise<void> => ipcRenderer.invoke("host:show-in-folder", path),
  trashSession: (path: string): Promise<void> => ipcRenderer.invoke("host:trash-session", path),
};

contextBridge.exposeInMainWorld("tenon", host);

export type Host = typeof host;
