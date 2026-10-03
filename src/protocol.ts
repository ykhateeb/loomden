// The messages between the renderer and the agent process. Type-only pi imports: nothing loads in the renderer.
import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";

export type AgentMessage = Extract<AgentSessionEvent, { type: "message_end" }>["message"];
export type ThinkingLevel = AgentSession["thinkingLevel"];

/** Main's dialogs throw this when the user cancels them. The window does not show it as an error. */
export const DIALOG_CANCELLED = "Cancelled in the dialog";

export interface Project {
  cwd: string;
  name: string;
}

export interface SessionRow {
  path: string;
  cwd: string;
  /** The session this one was forked or cloned from. */
  parent?: string;
  title: string;
  modified: number;
  messageCount: number;
  /** pi's session id (for `pi --session`). */
  id: string;
  /** Text of every message, for the search box. */
  text: string;
  model?: string;
  branches: number;
}

/** A short line of a session, for board 1's preview (and the tree later). */
export interface PreviewRow {
  id: string;
  kind: "you" | "pi" | "compacted" | "summary";
  text: string;
  /** Set when pi used a tool: read, edit, bash… */
  tool?: string;
  label?: string;
  /** More than one branch continues from here. */
  branchPoint: boolean;
  at: number;
}

/** Board 1a: one session with matches, and up to 3 matching lines. */
export interface SearchResult {
  path: string;
  cwd: string;
  title: string;
  modified: number;
  /** All matches in the session (the title counts as one). */
  total: number;
  /** `at` is the message's timestamp: the chat marks that message. `parts` = [before, match, after]. */
  lines: { who: "you" | "pi"; at: number; parts: [string, string, string] }[];
}

/** Board 3: one branch after a branch point. */
export interface BranchCard {
  /** The first entry of the branch (what "Fork" and "Label" use). */
  id: string;
  /** Its newest point (what "Switch to branch" goes to); for the current branch, pi's current point. */
  leafId: string;
  /** The first message you wrote on it: pi forks from a user message. */
  forkId?: string;
  current: boolean;
  label?: string;
  name: string;
  /** "you: …" or "pi: …" */
  first: string;
  tools: { tool: string; files: string[]; count: number; failed: number; added: number; removed: number }[];
  at: number;
}

/** Board 3: rows up to the last branch point, and the branches at each branch point. */
export interface SessionTree {
  rows: PreviewRow[];
  /** Cards by the row they follow ("" = before the first row). At the last split: every branch; earlier: the others. */
  branchesAt: Record<string, BranchCard[]>;
  /** The row of the last split, where the rows end and every branch shows as a card. */
  last?: string;
  /** The row of pi's current point ("" = before the first row). */
  here: string;
  /** How many branches the session has (the "Tree 2" count). */
  count: number;
  leafId: string | null;
}

/** Board 4: a package from settings.json (global) or a project's .pi/settings.json. */
export interface InstalledPackage {
  source: string;
  name: string;
  version?: string;
  kind: "npm" | "git" | "local";
  /** "npm · name", "git repo · github.com/me/repo", "folder · ./path" */
  where: string;
  scope: "global" | "project";
  cwd?: string;
  installed: boolean;
  installedAt?: number;
  resources: { extensions: string[]; skills: string[]; prompts: string[]; themes: string[] };
}

export interface GalleryItem {
  name: string;
  version: string;
  description: string;
  kind: "extension" | "skills" | "prompts" | "theme";
}

/** Board 5: the model settings of one settings file. */
export interface ModelSettings {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: string;
  /** Quick switch favorites (⌃P), as provider/model patterns. */
  enabledModels?: string[];
}

/** Board 5: one provider and how pi is connected to it. */
export interface ProviderRow {
  id: string;
  name: string;
  configured: boolean;
  /** Where the credential comes from: "stored" (auth.json), "environment", "models_json_key"… */
  source?: string;
  subscription: boolean;
  canKey: boolean;
  canLogin: boolean;
  custom: boolean;
  baseUrl?: string;
  models: number;
  available: number;
}

/** Board 5a: a model the server listed. */
export interface FoundModel {
  id: string;
  contextWindow?: number;
  embeddings: boolean;
}

/** Board 5a: a provider for models.json. */
export interface CustomProvider {
  name: string;
  baseUrl: string;
  api: string;
  apiKey?: string;
  models: { id: string; contextWindow?: number }[];
}

/** Board 5c: an item terminal pi has. */
export type ImportItem = "keys" | "settings" | "providers" | "trust" | "files" | "packages";
export interface ImportScan {
  found: boolean;
  items: { id: ImportItem; label: string; action: string; detail: string; count: number; done?: boolean }[];
}
/** Board 5d: what happened to one item. */
export interface ImportResult {
  id: ImportItem;
  status: "done" | "partial" | "failed";
  detail: string;
  errors: string[];
  /** Things to do by hand that are not failures (for example: run npm install in a copied extension). */
  notes?: string[];
}

/** Board C1: a canvas of a project, for the Design page. */
export interface DesignCanvas {
  slug: string;
  title: string;
  boards: { title: string; rev: number; approved?: number }[];
  /** How many saved revs (history/ stays on this computer) and images (assets/). */
  revs: number;
  images: number;
  updated: number;
  openNotes: number;
  status: "draft" | "review" | "approved";
}

/** A row of the / menu (board 2c). */
export interface SlashCommand {
  name: string;
  description: string;
  source: "extension" | "prompt" | "skill";
}

export interface ModelChoice {
  provider: string;
  id: string;
  name: string;
}

/** Everything about an open session except its messages (those travel on their own). */
export interface LiveState {
  key: string;
  cwd: string;
  file?: string;
  title: string;
  /** The git branch of the project folder, if it is a git repository. */
  branch?: string;
  streaming: boolean;
  /** When the current run started (for "Working… 2m 10s"). */
  runStartedAt?: number;
  model?: string;
  provider?: string;
  thinking: string;
  thinkingLevels: ThinkingLevel[];
  cost: number;
  tokensIn: number;
  tokensOut: number;
  context?: { tokens: number | null; contextWindow: number; percent: number | null };
  /** Auto-compact starts at this many tokens; undefined when auto-compact is off. */
  compactAt?: number;
  compacting: boolean;
  /** Board 2's Context card: context files, the system prompt, skills, extensions. */
  resources: { name: string; kind: "file" | "system" | "skills" | "extension" }[];
  tools: { name: string; active: boolean }[];
  runningTools: string[];
  /** Messages waiting for the current run, as the user typed them. */
  queued: { text: string; images: string[] }[];
}

export type UIRequest = { id: string; key?: string } & (
  | { method: "confirm"; title: string; message: string }
  | { method: "select"; title: string; options: string[] }
  | { method: "input" | "editor"; title: string; placeholder?: string; secret?: boolean }
  | { method: "trust"; cwd: string; files: { name: string; detail?: string }[] }
);

export type TrustAnswer = "trust" | "once";

export type Command =
  | { type: "sessions.list" }
  | { type: "project.add"; cwd: string }
  /** `key` is a new id from the window. A file that is open already keeps its own key. */
  | { type: "session.open"; key: string; cwd: string; path?: string }
  /** Board 1.2: move an open session to another project folder. The chat stays; pi then works in that folder. */
  | { type: "session.move"; key: string; cwd: string }
  | { type: "session.prompt"; key: string; text: string; behavior?: "steer" | "followUp"; images?: string[] }
  | { type: "session.commands"; key: string }
  /** Open the design canvas panel of a session (it runs the extension's /canvas). */
  | { type: "session.canvas"; key: string; title?: string }
  /** Board C1: the canvases of a project, and the address of one canvas (notes go to session `key`). */
  | { type: "design.list"; cwd: string }
  /** Start the design server of a project. Notes go to the session `key`. */
  | { type: "design.open"; cwd: string; key?: string }
  | { type: "design.url"; cwd: string; canvas: string; tab?: "ds" }
  | { type: "session.models"; key: string }
  | { type: "session.model"; key: string; provider: string; id: string }
  | { type: "session.dequeue"; key: string }
  | { type: "sessions.search"; query: string; titlesOnly: boolean; cwd?: string }
  | { type: "session.tree"; key: string }
  | { type: "session.navigate"; key: string; id: string; summarize: boolean }
  | { type: "session.label"; key: string; id: string; label: string }
  | { type: "session.fork"; key: string; id: string; at: boolean }
  | { type: "settings.models"; cwd?: string }
  | { type: "settings.setModels"; cwd?: string; patch: Partial<Record<keyof ModelSettings, unknown>> }
  | { type: "providers.login"; providerId: string; method: "api_key" | "oauth" }
  | { type: "providers.cancelLogin" }
  | { type: "providers.logout"; providerId: string }
  | { type: "providers.find"; baseUrl: string; api: string; apiKey?: string }
  | { type: "providers.add"; provider: CustomProvider }
  | { type: "trust.list" }
  | { type: "trust.set"; cwd: string; trusted: boolean | null }
  | { type: "import.scan" }
  | { type: "import.run"; items: ImportItem[] }
  | { type: "packages.list" }
  | { type: "packages.change"; action: "install" | "remove" | "update"; source: string; cwd?: string }
  | { type: "packages.gallery"; query: string }
  | { type: "packages.reload" }
  | { type: "session.compact"; key: string }
  | { type: "session.reload"; key: string }
  | { type: "session.tools"; key: string; names: string[] }
  | { type: "files.search"; cwd: string; query: string }
  | { type: "session.abort"; key: string }
  | { type: "session.thinking"; key: string; level: ThinkingLevel }
  | { type: "session.rename"; path: string; name: string }
  | { type: "session.clone"; key: string; cwd: string; path: string }
  /** `id` is a new id from the window; main moves the file of that id (see exportFile()). */
  | { type: "session.export"; id: string; cwd: string; path: string }
  | { type: "session.close"; path: string }
  | { type: "project.remove"; cwd: string }
  | { type: "ui.answer"; id: string; value: unknown };

export type Request = Command & { rid: number };

export type AgentOut =
  | { type: "reply"; rid: number; ok: true; data?: unknown }
  | { type: "reply"; rid: number; ok: false; error: string }
  | { type: "state"; state: LiveState }
  | { type: "messages"; key: string; messages: AgentMessage[] }
  | { type: "closed"; key: string }
  /** A user message pi gave back after a switch or a fork, for the message box. */
  | { type: "draft"; key: string; text: string }
  /** The extension started the canvas server: show it in the panel. */
  | { type: "canvas"; key: string; url: string }
  /** "Start build session" (board C12): open a new session and send it the design pack. */
  | { type: "canvas.build"; key?: string; cwd?: string; title: string; text: string }
  | { type: "message"; key: string; message: AgentMessage; push: boolean }
  | { type: "ui.request"; request: UIRequest }
  | { type: "ui.done"; id: string }
  | { type: "notify"; key?: string; message: string; level: "info" | "warning" | "error" }
  | { type: "auth.event"; providerId: string; event: { type: "done" } | { type: "info"; message: string } | { type: "progress"; message: string } | { type: "auth_url"; url: string; instructions?: string } | { type: "device_code"; userCode: string; verificationUri: string; expiresInSeconds?: number } }
  /** One item of an import is done (board 5d). */
  | { type: "import.result"; result: ImportResult }
  | { type: "package.progress"; source: string; action: string; phase: "start" | "progress" | "complete" | "error"; message?: string };

export type Send = (msg: AgentOut) => void;
