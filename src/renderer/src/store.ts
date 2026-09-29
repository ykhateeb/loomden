import { useSyncExternalStore } from "react";
import type { Host } from "../../preload";
import type { AgentMessage, AgentOut, Command, CustomProvider, FoundModel, GalleryItem, ImportItem, ImportResult, ImportScan, InstalledPackage, LiveState, ModelChoice, ModelSettings, Project, ProviderRow, SearchResult, SessionRow, SessionTree, SlashCommand, UIRequest, DesignCanvas } from "../../protocol";

export type ModelsPage = { settings: ModelSettings; global: ModelSettings; providers: ProviderRow[]; models: ModelChoice[]; file: string };
export type Login = { providerId: string; method: "api_key" | "oauth"; startedAt: number; url?: string; code?: { userCode: string; verificationUri: string }; message?: string };

export type Packages = {
  global: InstalledPackage[];
  projects: { cwd: string; name: string; packages: InstalledPackage[] }[];
  trust: { cwd: string; name: string; trusted: boolean | null; from?: string }[];
};

declare global {
  interface Window {
    tau: Host;
  }
}

export interface Notice {
  id: number;
  message: string;
  level: "info" | "warning" | "error";
  /** A button in the toast, like Undo. */
  action?: { label: string; run: () => void };
}

export type Tab = "sessions" | "packages" | "settings";

export interface State {
  agent: "starting" | "ready" | "stopped";
  tab: Tab;
  projects: Project[];
  sessions: SessionRow[];
  /** The folder of sessions with no project (board 1.1). Not in `projects`. */
  noProject?: string;
  live: Record<string, LiveState>;
  messages: Record<string, AgentMessage[]>;
  active?: string;
  dialogs: UIRequest[];
  notices: Notice[];
  /** Board 1a: the ⌘K search is open. */
  searching: boolean;
  /** A message the search opened: the chat scrolls to it and marks it. `at` is the message timestamp. */
  mark?: { key: string; at: number };
  /** Board 3: the Chat | Tree switch, by session key. */
  view: Record<string, "chat" | "tree">;
  /** Text for a session's message box (a user message pi gave back after a switch or fork). */
  drafts: Record<string, string>;
  /** Goes up when a tree changes without a new message (switch, label, fork): tree views fetch again. */
  treeStamp: number;
  /** Board 4: installed packages and project trust (loaded when the Packages tab opens). */
  packages?: Packages;
  /** Package installs, removes and updates that run now, by source. */
  packageWork: Record<string, { action: string; message?: string }>;
  /** Board 5: the settings page data, for the scope it was read for. */
  modelsPage?: ModelsPage;
  /** Board 5b: a login that runs now. */
  login?: Login;
  /** When the settings were last saved (the "Saved just now" line). */
  savedAt?: number;
  /** The project the models page reads (undefined = global). */
  modelsCwd?: string;
  modelsError?: string;
  /** Board 5a and 5c: the add-provider and import dialogs are open. */
  addingProvider: boolean;
  importing: boolean;
  /** The settings page to show (the Packages "Change" link opens Project trust). */
  settingsPage: "models" | "trust";
  /** Board C1: the canvases of each project folder, and the Design page when it is open. */
  design: Record<string, { canvases: DesignCanvas[]; system?: string }>;
  designPage?: { cwd: string; canvas?: string; tab: "canvases" | "system" };
  /** Each session's design canvas: the server address, and whether the panel is open. */
  canvas: Record<string, { url: string; open: boolean }>;
  /** Dev: the text the ⌘K search starts with. */
  devSearch?: string;
}

let state: State = { agent: "starting", tab: "sessions", projects: [], sessions: [], live: {}, messages: {}, dialogs: [], notices: [], searching: false, view: {}, drafts: {}, treeStamp: 0, packageWork: {}, addingProvider: false, importing: false, settingsPage: "models", canvas: {}, design: {} };
const listeners = new Set<() => void>();

function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  let next = typeof patch === "function" ? patch(state) : patch;
  // Showing a session (open, focus, move) takes the Design page away.
  if (next.active && !("designPage" in next)) next = { ...next, designPage: undefined };
  state = { ...state, ...next };
  for (const l of listeners) l();
}

/** `pick` must return a part of the state, not a new object. */
export function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => pick(state),
  );
}

// --- the port to the agent process ---

let port: MessagePort | undefined;
let nextRid = 1;
let modelsAsk = 0;
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function dropPort(reason: string) {
  for (const w of waiting.values()) w.reject(new Error(reason));
  waiting.clear();
  port?.close();
  port = undefined;
}

window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  if (e.data === "tau:agent-exit") {
    dropPort("pi stopped");
    // The host restarts pi unless it stopped at startup; a new port then arrives.
    return set({ agent: "stopped", live: {}, messages: {}, active: undefined, dialogs: [] });
  }
  if (e.data !== "tau:agent-port" || !e.ports[0]) return;
  dropPort("The window got a new connection to pi");
  port = e.ports[0];
  port.onmessage = (m) => receive(m.data as AgentOut);
  // After a reload the agent sends its open sessions and dialogs again; after a restart it has none.
  set({ agent: "ready", live: {}, messages: {}, dialogs: [] });
  actions.refresh();
});

function call<T = unknown>(cmd: Command): Promise<T> {
  if (!port) return Promise.reject(new Error("Not connected to the agent process"));
  const rid = nextRid++;
  port.postMessage({ ...cmd, rid });
  return new Promise<T>((resolve, reject) => waiting.set(rid, { resolve: resolve as (v: unknown) => void, reject }));
}

function notice(message: string, level: Notice["level"] = "error", action?: Notice["action"]) {
  const id = nextRid++;
  set((s) => ({ notices: [...s.notices, { id, message, level, action }] }));
  setTimeout(() => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })), 6000);
}

function receive(msg: AgentOut) {
  switch (msg.type) {
    case "reply": {
      const w = waiting.get(msg.rid);
      waiting.delete(msg.rid);
      if (msg.ok) w?.resolve(msg.data);
      else w?.reject(new Error(msg.error));
      return;
    }
    case "state": {
      const before = state.live[msg.state.key];
      set((s) => ({ live: { ...s.live, [msg.state.key]: msg.state } }));
      if (before?.streaming && !msg.state.streaming) actions.refresh(); // titles and counts changed
      return;
    }
    case "messages":
      return set((s) => ({ messages: { ...s.messages, [msg.key]: msg.messages } }));
    case "closed":
      return set((s) => {
        const { [msg.key]: _, ...live } = s.live;
        const { [msg.key]: __, ...messages } = s.messages;
        return { live, messages, dialogs: s.dialogs.filter((d) => d.key !== msg.key), active: s.active === msg.key ? undefined : s.active };
      });
    case "canvas.build": {
      // The pack starts a new session in the same folder, so this chat stays as it was.
      const cwd = msg.cwd ?? (msg.key && state.live[msg.key]?.cwd);
      if (!cwd) return;
      void actions.open(cwd).then(async (key) => {
        if (!key) return;
        notice(`Build session started from “${msg.title}”`, "info");
        await call({ type: "session.prompt", key, text: msg.text });
      }).catch(report);
      return;
    }
    case "canvas": {
      const cwd = state.live[msg.key]?.cwd;
      if (cwd) actions.loadDesign(cwd); // a new canvas shows in the Design row
      return set((s) => ({ canvas: { ...s.canvas, [msg.key]: { url: msg.url, open: true } } }));
    }
    case "message":
      return set((s) => {
        const list = s.messages[msg.key] ?? [];
        const next = msg.push || list.length === 0 ? [...list, msg.message] : [...list.slice(0, -1), msg.message];
        return { messages: { ...s.messages, [msg.key]: next } };
      });
    case "ui.request":
      return set((s) => ({ dialogs: [...s.dialogs.filter((d) => d.id !== msg.request.id), msg.request] }));
    case "ui.done":
      return set((s) => ({ dialogs: s.dialogs.filter((d) => d.id !== msg.id) }));
    case "notify":
      return notice(msg.message, msg.level);
    case "auth.event": {
      const e = msg.event;
      if (!state.login || state.login.providerId !== msg.providerId) return; // an older login that was replaced
      if (e.type === "done") return set({ login: undefined });
      if (e.type === "auth_url") {
        window.tau.openExternal(e.url); // main opens only https links
        return set((s) => ({ login: s.login && { ...s.login, url: e.url, message: e.instructions } }));
      }
      if (e.type === "device_code") return set((s) => ({ login: s.login && { ...s.login, code: { userCode: e.userCode, verificationUri: e.verificationUri } } }));
      return set((s) => ({ login: s.login && { ...s.login, message: e.message } }));
    }
    case "package.progress":
      return set((s) => {
        const work = { ...s.packageWork };
        if (msg.phase === "complete" || msg.phase === "error") delete work[msg.source];
        else work[msg.source] = { action: msg.action, message: msg.message };
        return { packageWork: work };
      });
  }
}

const report = (e: Error) => notice(e.message);

export const actions = {
  /** Board C1: read the canvases of a project folder. */
  loadDesign: (cwd: string) =>
    call<{ canvases: DesignCanvas[]; system?: string }>({ type: "design.list", cwd })
      .then((d) => set((s) => ({ design: { ...s.design, [cwd]: d } })))
      .catch(() => {}), // a folder that is no project (yet) has no Design row
  openDesign: (cwd: string, canvas?: string, tab: "canvases" | "system" = "canvases") => {
    set({ designPage: { cwd, canvas, tab }, tab: "sessions" });
    actions.loadDesign(cwd);
  },
  closeDesign: () => set({ designPage: undefined }),
  /** The address of a canvas for the Design page. Notes go to the session `key`. */
  designUrl: (cwd: string, canvas: string, key?: string, tab?: "ds") => call<string>({ type: "design.open", cwd, canvas, key, tab }),
  /** Canvas ⇧C: show or hide the panel. The first time, the extension starts its server and reports the address. */
  canvas: (key: string) => {
    const c = state.canvas[key];
    if (c) set({ canvas: { ...state.canvas, [key]: { ...c, open: !c.open } } });
    else call({ type: "session.canvas", key, title: state.live[key]?.title }).catch(report);
  },
  setTab: (tab: Tab) => set({ tab }),
  /** Show an open session (from the running menu or "needs you"). */
  focus: (key: string) => set({ tab: "sessions", active: key, mark: undefined }),
  /** Board 1.1: a chat with no project. Add it to a project later. */
  newSession: () => state.noProject && actions.open(state.noProject),
  /** Board 1.2 and 1.3: move a session to a project (or back, for Undo). The chat stays as it is. */
  move: async (key: string, cwd: string, undo = false) => {
    const from = state.live[key]?.cwd;
    try {
      const moved = await call<string | undefined>({ type: "session.move", key, cwd });
      if (!moved) return; // the trust dialog was cancelled
      set({ active: moved, tab: "sessions" });
      // The canvas moved with the session: its server is new, so ask for the address again.
      const canvas = state.canvas[moved];
      if (canvas) {
        const { [moved]: _, ...rest } = state.canvas;
        set({ canvas: rest });
        if (canvas.open) actions.canvas(moved);
      }
      await actions.refresh();
      if (undo || !from) return;
      const name = state.projects.find((p) => p.cwd === cwd)?.name ?? cwd.split("/").pop();
      notice(`Moved to ${name}`, "info", { label: "Undo", run: () => actions.move(moved, from, true) });
    } catch (e) {
      report(e as Error);
    }
  },
  /** "Open a folder…" in the Add to project menu: the folder becomes a project, then the session moves there. */
  moveToFolder: async (key: string) => {
    const cwd = await window.tau.pickFolder();
    if (!cwd) return;
    try {
      set(await call<Pick<State, "projects" | "sessions" | "noProject">>({ type: "project.add", cwd }));
      await actions.move(key, cwd);
    } catch (e) {
      report(e as Error);
    }
  },
  refresh: () =>
    call<Pick<State, "projects" | "sessions" | "noProject">>({ type: "sessions.list" })
      .then((r) => {
        set(r);
        for (const p of r.projects) actions.loadDesign(p.cwd);
        // Dev checks without clicks (see main/index.ts): #dev?open=latest|<title part>&view=tree&search=<text>, once.
        if (location.hash.startsWith("#dev?")) {
          const dev = new URLSearchParams(location.hash.slice(5));
          history.replaceState(null, "", location.pathname);
          const want = dev.get("open")?.toLowerCase();
          const s = want === "latest" ? r.sessions[0] : r.sessions.find((x) => want && x.title.toLowerCase().includes(want));
          if (s) actions.open(s.cwd, s.path).then((key) => key && dev.get("view") === "tree" && actions.setView(key, "tree"));
          if (dev.get("search")) set({ searching: true, devSearch: dev.get("search")! });
          if (dev.get("tab")) set({ tab: dev.get("tab") as Tab });
          if (dev.get("dialog") === "provider") set({ addingProvider: true });
          if (dev.get("dialog") === "import") set({ importing: true });
        }
      })
      .catch(report),
  open: (cwd: string, path?: string) =>
    call<string | undefined>({ type: "session.open", cwd, path })
      .then((key) => {
        if (key) set({ active: key, tab: "sessions", mark: undefined }); // openAt sets a new mark after this
        return key;
      })
      .catch((e) => (report(e), undefined)),
  setView: (key: string, view: "chat" | "tree") => set((s) => ({ view: { ...s.view, [key]: view } })),
  takeDraft: (key: string) => {
    const text = state.drafts[key];
    if (text !== undefined) set((s) => ({ drafts: Object.fromEntries(Object.entries(s.drafts).filter(([k]) => k !== key)) }));
    return text;
  },
  tree: (key: string) => call<SessionTree>({ type: "session.tree", key }).catch((e) => (report(e), undefined)),
  /** Switch to a point; returns the new tree. A user message comes back as a draft to edit and send. */
  navigate: async (key: string, id: string, summarize: boolean) => {
    try {
      const r = await call<{ editorText?: string; tree: SessionTree }>({ type: "session.navigate", key, id, summarize });
      set((s) => ({ view: { ...s.view, [key]: "chat" }, drafts: r.editorText ? { ...s.drafts, [key]: r.editorText } : s.drafts, treeStamp: s.treeStamp + 1 }));
      return r.tree;
    } catch (e) {
      report(e as Error);
    }
  },
  label: (key: string, id: string, label: string) =>
    call<SessionTree>({ type: "session.label", key, id, label })
      .then((t) => (set((s) => ({ treeStamp: s.treeStamp + 1 })), t))
      .catch((e) => (report(e), undefined)),
  fork: async (key: string, id: string, at: boolean) => {
    try {
      const r = await call<{ cancelled: boolean; editorText?: string }>({ type: "session.fork", key, id, at });
      if (r.cancelled) return;
      set((s) => ({ view: { ...s.view, [key]: "chat" }, drafts: r.editorText ? { ...s.drafts, [key]: r.editorText } : s.drafts, treeStamp: s.treeStamp + 1 }));
      notice(at ? "Cloned into a new session" : "Forked into a new session", "info");
      await actions.refresh();
    } catch (e) {
      report(e as Error);
    }
  },
  /** Open a session at its tree (the Fork item in the session menus). */
  openTree: async (cwd: string, path: string) => {
    const key = await actions.open(cwd, path);
    if (key) actions.setView(key, "tree");
  },
  /** Reads one scope. Clears the page first (no edits on the old scope's values) and ignores a reply that is not the newest. */
  loadModels: (cwd?: string) => {
    const ask = ++modelsAsk;
    set({ modelsPage: undefined, modelsCwd: cwd, modelsError: undefined });
    return call<ModelsPage>({ type: "settings.models", cwd }).then(
      (modelsPage) => ask === modelsAsk && set({ modelsPage }),
      (e: Error) => ask === modelsAsk && set({ modelsError: e.message }), // an old request's error is not news
    );
  },
  setModels: (patch: Partial<Record<keyof ModelSettings, unknown>>, cwd?: string) =>
    call<ModelSettings>({ type: "settings.setModels", cwd, patch })
      .then((settings) => set((s) => (s.modelsCwd !== cwd ? { savedAt: Date.now() } : { savedAt: Date.now(), modelsPage: s.modelsPage && { ...s.modelsPage, settings, global: cwd ? s.modelsPage.global : settings } })))
      .catch(report),
  /** Board 5 "Add key" / 5b subscription login. pi's questions come as dialogs; links open in the browser. */
  login: async (providerId: string, method: "api_key" | "oauth") => {
    const mine = { providerId, method, startedAt: Date.now() };
    set({ login: mine });
    try {
      await call({ type: "providers.login", providerId, method });
      notice("Connected", "info");
    } catch (e) {
      if (!/cancel/i.test((e as Error).message)) report(e as Error);
    } finally {
      if (state.login?.startedAt === mine.startedAt) set({ login: undefined }); // not a newer login's state
      actions.loadModels(state.modelsCwd); // the scope the page shows now
    }
  },
  setAddingProvider: (addingProvider: boolean) => set({ addingProvider }),
  setImporting: (importing: boolean) => set({ importing }),
  scanImport: () => call<ImportScan>({ type: "import.scan" }),
  /** undefined = the user cancelled main's confirmation. */
  runImport: async (items: ImportItem[]) => {
    if (!(await window.tau.confirmImport(items))) return undefined;
    const results = await call<ImportResult[]>({ type: "import.run", items });
    actions.refresh();
    return results;
  },
  cancelLogin: () => call({ type: "providers.cancelLogin" }).catch(report),
  logout: (providerId: string) =>
    call({ type: "providers.logout", providerId })
      .then(() => (notice("Logged out", "info"), actions.loadModels(state.modelsCwd)))
      .catch(report),
  findModels: (baseUrl: string, api: string, apiKey?: string) => call<FoundModel[]>({ type: "providers.find", baseUrl, api, apiKey }),
  addProvider: (provider: CustomProvider) =>
    call({ type: "providers.add", provider }).then(() => (notice(`Added ${provider.name}`, "info"), actions.loadModels(state.modelsCwd))),
  openSettings: (settingsPage: "models" | "trust") => set({ tab: "settings", settingsPage }),
  setTrust: (cwd: string, trusted: boolean | null) =>
    call<Packages["trust"]>({ type: "trust.set", cwd, trusted })
      .then((trust) => set((s) => ({ savedAt: Date.now(), packages: s.packages ? { ...s.packages, trust } : { global: [], projects: [], trust } })))
      .catch(report),
  loadPackages: () =>
    call<Packages>({ type: "packages.list" })
      .then((packages) => set({ packages }))
      .catch(report),
  /** Install asks main's own dialog first (installing runs code); the agent refuses an install main did not confirm. */
  changePackage: async (action: "install" | "remove" | "update", source: string, cwd?: string) => {
    if (action !== "remove" && !(await window.tau.confirmInstall(action, source, cwd))) return false;
    set((s) => ({ packageWork: { ...s.packageWork, [source]: { action } } }));
    try {
      set({ packages: await call<Packages>({ type: "packages.change", action, source, cwd }) });
      notice(`${action === "install" ? "Installed" : action === "remove" ? "Removed" : "Updated"} ${source}. Changes load after Reload or a new session.`, "info");
      return true;
    } catch (e) {
      report(e as Error);
      return false;
    } finally {
      set((s) => {
        const { [source]: _, ...rest } = s.packageWork;
        return { packageWork: rest };
      });
    }
  },
  gallery: (query: string) => call<GalleryItem[]>({ type: "packages.gallery", query }),
  reloadPackages: () =>
    call<number>({ type: "packages.reload" })
      .then((n) => notice(n ? `Reloaded ${n} open ${n === 1 ? "session" : "sessions"}` : "No open session to reload", "info"))
      .catch(report),
  search: (query: string, titlesOnly: boolean, cwd?: string) =>
    call<SearchResult[]>({ type: "sessions.search", query, titlesOnly, cwd }).catch((e) => (report(e), [] as SearchResult[])),
  setSearching: (searching: boolean) => set({ searching }),
  /** Open a search result and mark the message (or only open it, for a title match). */
  openAt: async (cwd: string, path: string, at?: number) => {
    set({ searching: false });
    const key = await actions.open(cwd, path);
    // The mark is in the chat: show the chat, also if this session was on its tree.
    set((s) => ({ mark: key && at ? { key, at } : undefined, view: key ? { ...s.view, [key]: "chat" } : s.view }));
  },
  addProject: async () => {
    const cwd = await window.tau.pickFolder();
    if (cwd) await call<Pick<State, "projects" | "sessions" | "noProject">>({ type: "project.add", cwd }).then(set).catch(report);
  },
  /** True when pi accepted it (the run itself may still fail later, as a notice). */
  prompt: (key: string, text: string, behavior?: "steer" | "followUp", images?: string[]) =>
    call({ type: "session.prompt", key, text, behavior, images }).then(
      () => true,
      (e) => (report(e), false),
    ),
  commands: (key: string) => call<SlashCommand[]>({ type: "session.commands", key }).catch((e) => (report(e), [] as SlashCommand[])),
  models: (key: string) => call<ModelChoice[]>({ type: "session.models", key }).catch((e) => (report(e), [] as ModelChoice[])),
  setModel: (key: string, provider: string, id: string) => call({ type: "session.model", key, provider, id }).catch(report),
  dequeue: (key: string) => call<{ text: string; images: string[] }[]>({ type: "session.dequeue", key }).catch((e) => (report(e), [])),
  compact: (key: string) => call({ type: "session.compact", key }).catch(report),
  reload: (key: string) =>
    call({ type: "session.reload", key })
      .then(() => notice("Context reloaded", "info"))
      .catch(report),
  setTools: (key: string, names: string[]) => call({ type: "session.tools", key, names }).catch(report),
  searchFiles: (cwd: string, query: string) => call<string[]>({ type: "files.search", cwd, query }).catch(() => [] as string[]),
  abort: (key: string) => call({ type: "session.abort", key }).catch(report),
  thinking: (key: string, level: string) => call({ type: "session.thinking", key, level }).catch(report),
  answer: (id: string, value: unknown) => call({ type: "ui.answer", id, value }).catch(report),

  rename: (path: string, name: string) =>
    call<Pick<State, "projects" | "sessions" | "noProject">>({ type: "session.rename", path, name })
      .then((r) => (set(r), notice("Session renamed", "info")))
      .catch(report),
  clone: (cwd: string, path: string) =>
    call<string | undefined>({ type: "session.clone", cwd, path })
      .then((key) => {
        if (!key) return;
        set({ active: key, tab: "sessions" });
        return actions.refresh();
      })
      .catch(report),
  exportHtml: async (cwd: string, path: string, title: string) => {
    try {
      const temp = await call<string>({ type: "session.export", cwd, path });
      const saved = await window.tau.saveHtml(temp, title);
      if (saved) notice(`Exported to ${saved}`, "info");
    } catch (e) {
      report(e as Error);
    }
  },
  /** Close it if it is open, then move its file to the Trash. */
  deleteSession: async (path: string) => {
    try {
      await call({ type: "session.close", path });
      await window.tau.trashSession(path);
      notice("The session is in the Trash", "info");
      await actions.refresh();
    } catch (e) {
      report(e as Error);
    }
  },
  showInFolder: (path: string) => window.tau.showInFolder(path),
  removeProject: (cwd: string) =>
    call<Pick<State, "projects" | "sessions" | "noProject">>({ type: "project.remove", cwd })
      .then(set)
      .catch(report),
};
