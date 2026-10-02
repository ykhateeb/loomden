import type { SearchResult } from "#protocol";
import { folderName } from "#renderer/chat/format";
import { designActions } from "#renderer/design/actions";
import { call } from "#renderer/port";
import { getState, notice, report, type SessionList, set, type Tab } from "#renderer/store";

export const sessionActions = {
  refresh: () =>
    call<SessionList>({ type: "sessions.list" })
      .then((r) => {
        set(r);
        for (const p of r.projects) designActions.loadDesign(p.cwd);
        openDevView(r);
      })
      .catch(report),
  /** No `path` = a new session, under `key`. A file that is open already keeps its own key: find it with keyOf(). */
  open: (cwd: string, path?: string, key: string = crypto.randomUUID()) =>
    call({ type: "session.open", key, cwd, path })
      .then(() => {
        const opened = path ? sessionActions.keyOf(path) : getState().live[key]?.key;
        if (opened) set({ active: opened, tab: "sessions", mark: undefined }); // openAt sets a new mark after this
      })
      .catch(report),
  /** The key of an open session file. undefined = it is not open (for example, the user cancelled the trust dialog). */
  keyOf: (path: string) => Object.values(getState().live).find((s) => s.file === path)?.key,
  /** Show an open session (from the running menu or "needs you"). */
  focus: (key: string) => set({ tab: "sessions", active: key, mark: undefined }),
  /** Board 1.1: a chat with no project. Add it to a project later. */
  newSession: () => {
    const { noProject } = getState();
    return noProject && sessionActions.open(noProject);
  },
  setView: (key: string, view: "chat" | "tree") => set((s) => ({ view: { ...s.view, [key]: view } })),
  /** Open a session at its tree (the Fork item in the session menus). */
  openTree: async (cwd: string, path: string) => {
    await sessionActions.open(cwd, path);
    const key = sessionActions.keyOf(path);
    if (key) sessionActions.setView(key, "tree");
  },
  /** Board 1.2 and 1.3: move a session to a project (or back, for Undo). The chat stays as it is. */
  move: async (key: string, cwd: string, undo = false) => {
    const from = getState().live[key]?.cwd;
    try {
      await call({ type: "session.move", key, cwd }); // a cancel of the trust dialog throws
      set({ active: key, tab: "sessions" });
      // The canvas moved with the session: its server is new, so ask for the address again.
      const canvas = getState().canvas[key];
      if (canvas) {
        const { [key]: _, ...rest } = getState().canvas;
        set({ canvas: rest });
        if (canvas.open) designActions.canvas(key);
      }
      await sessionActions.refresh();
      if (undo || !from) return;
      const name = getState().projects.find((p) => p.cwd === cwd)?.name ?? folderName(cwd);
      notice(`Moved to ${name}`, "info", { label: "Undo", run: () => sessionActions.move(key, from, true) });
    } catch (e) {
      report(e as Error);
    }
  },
  /** "Open a folder…" in the Add to project menu: the folder becomes a project, then the session moves there. */
  moveToFolder: (key: string) =>
    withPickedFolder(async (cwd) => {
      await call({ type: "project.add", cwd });
      await sessionActions.refresh();
      await sessionActions.move(key, cwd);
    }),
  search: (query: string, titlesOnly: boolean, cwd?: string) =>
    call<SearchResult[]>({ type: "sessions.search", query, titlesOnly, cwd }).catch((e) => (report(e), [] as SearchResult[])),
  setSearching: (searching: boolean) => set({ searching }),
  /** Open a search result and mark the message (or only open it, for a title match). */
  openAt: async (cwd: string, path: string, at?: number) => {
    set({ searching: false });
    await sessionActions.open(cwd, path);
    const key = sessionActions.keyOf(path);
    // The mark is in the chat: show the chat, also if this session was on its tree.
    set((s) => ({ mark: key && at ? { key, at } : undefined, view: key ? { ...s.view, [key]: "chat" } : s.view }));
  },
  addProject: () =>
    withPickedFolder(async (cwd) => {
      await call({ type: "project.add", cwd });
      await sessionActions.refresh();
    }),
  removeProject: (cwd: string) =>
    call({ type: "project.remove", cwd })
      .then(sessionActions.refresh, report),
  rename: (path: string, name: string) =>
    call({ type: "session.rename", path, name })
      .then(() => (notice("Session renamed", "info"), sessionActions.refresh()), report),
  clone: (cwd: string, path: string) => {
    const key = crypto.randomUUID();
    return call({ type: "session.clone", key, cwd, path })
      .then(() => {
        set({ active: key, tab: "sessions" }); // a cancel of the trust dialog throws
        return sessionActions.refresh();
      })
      .catch(report);
  },
  exportHtml: async (cwd: string, path: string, title: string) => {
    const id = crypto.randomUUID();
    try {
      await call({ type: "session.export", id, cwd, path });
      await window.tenon.saveHtml(id, title);
      notice(`Exported “${title}”`, "info");
    } catch (e) {
      report(e as Error);
    }
  },
  /** Close it if it is open, then move its file to the Trash. */
  deleteSession: async (path: string) => {
    try {
      await call({ type: "session.close", path });
      await window.tenon.trashSession(path);
      notice("The session is in the Trash", "info");
      await sessionActions.refresh();
    } catch (e) {
      report(e as Error);
    }
  },
  showInFolder: (path: string) => window.tenon.showInFolder(path),
};

/** Main's folder dialog: run `then` with the folder the user picked. Nothing runs if the user cancels. */
async function withPickedFolder(then: (cwd: string) => Promise<void>) {
  const id = crypto.randomUUID();
  try {
    await window.tenon.pickFolder(id);
    const [cwd] = await window.tenon.picked(id);
    if (cwd) await then(cwd);
  } catch (e) {
    report(e as Error);
  }
}

/** Dev checks without clicks (see main/index.ts): #dev?open=latest|<title part>&view=tree&search=<text>, once. */
function openDevView(list: SessionList) {
  if (!location.hash.startsWith("#dev?")) return;
  const dev = new URLSearchParams(location.hash.slice(5));
  history.replaceState(null, "", location.pathname);
  const want = dev.get("open")?.toLowerCase();
  const s = want === "latest" ? list.sessions[0] : list.sessions.find((x) => want && x.title.toLowerCase().includes(want));
  if (s && dev.get("view") === "tree") sessionActions.openTree(s.cwd, s.path);
  else if (s) sessionActions.open(s.cwd, s.path);
  if (dev.get("search")) set({ searching: true, devSearch: dev.get("search")! });
  if (dev.get("tab")) set({ tab: dev.get("tab") as Tab });
  if (dev.get("dialog") === "provider") set({ addingProvider: true });
  if (dev.get("dialog") === "import") set({ importing: true });
}
