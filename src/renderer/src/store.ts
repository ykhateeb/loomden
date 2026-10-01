import { useSyncExternalStore } from "react";
import type { Host } from "#preload";
import type { AgentMessage, DesignCanvas, InstalledPackage, LiveState, ModelChoice, ModelSettings, Project, ProviderRow, SessionRow, UIRequest } from "#protocol";

export type ModelsPage = { settings: ModelSettings; global: ModelSettings; providers: ProviderRow[]; models: ModelChoice[]; file: string };
export type Login = { providerId: string; method: "api_key" | "oauth"; startedAt: number; url?: string; code?: { userCode: string; verificationUri: string }; message?: string };

export type Packages = {
  global: InstalledPackage[];
  projects: { cwd: string; name: string; packages: InstalledPackage[] }[];
  trust: { cwd: string; name: string; trusted: boolean | null; from?: string }[];
};

declare global {
  interface Window {
    tenon: Host;
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

/** The agent's answer to sessions.list, and to the commands that change the list. */
export type SessionList = Pick<State, "projects" | "sessions" | "noProject">;

let state: State = { agent: "starting", tab: "sessions", projects: [], sessions: [], live: {}, messages: {}, dialogs: [], notices: [], searching: false, view: {}, drafts: {}, treeStamp: 0, packageWork: {}, addingProvider: false, importing: false, settingsPage: "models", canvas: {}, design: {} };
const listeners = new Set<() => void>();

/** The state now. Read it when you need it: `set` replaces it. */
export const getState = () => state;

export function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
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

let nextNoticeId = 1;

/** A toast that goes away after a few seconds. */
export function notice(message: string, level: Notice["level"] = "error", action?: Notice["action"]) {
  const id = nextNoticeId++;
  set((s) => ({ notices: [...s.notices, { id, message, level, action }] }));
  setTimeout(() => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })), 6000);
}

export const report = (e: Error) => notice(e.message);
