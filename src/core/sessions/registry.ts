import { execFile } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { type ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import type { AgentMessage, ModelChoice, Send, SlashCommand } from "#protocol";
import { readImage } from "#core/attachments";
import type { Grants } from "#core/grants";
import { forwardEvents } from "./events";
import { assertNewKey } from "./keys";
import { liveState, type OpenSession, type Session, trimQueued } from "./live-state";
import { copyToFolder, moveFreeCanvases } from "./move";
import type { Dialogs } from "./extension-ui";
import { createRuntimes } from "./runtime";
import type { Entry as FileEntry } from "./summary";
import { buildTree } from "./tree";
import { availableModels } from "#core/providers";
import { exportFile, NO_PROJECT_DIR } from "#core/paths";

type ThinkingLevel = Session["thinkingLevel"];

const GIT_TIMEOUT_MS = 3000;

/** Where to open a session, and the key it gets. */
type OpenTarget = { key: string; cwd: string; path?: string };

export function createRegistry({ send, modelRuntime, grants, dialogs }: { send: Send; modelRuntime: ModelRuntime; grants: Grants; dialogs: Dialogs }) {
  const live = new Map<string, OpenSession>();
  // Session files the user opened (not only an export): an export never closes these.
  const wanted = new Set<string>();
  // Opens in progress, by session file.
  const opening = new Map<string, Promise<void>>();
  const runtimes = createRuntimes({ send, modelRuntime, ask: dialogs.ask });

  const notify = (level: "info" | "warning" | "error", message: string, key?: string) => send({ type: "notify", key, level, message });
  const sendMessages = (key: string, session: Session) => send({ type: "messages", key, messages: session.messages as AgentMessage[] });
  // A run can end after its session was closed (deleted while it streamed): then there is nothing to send.
  const sendState = (key: string) => live.has(key) && send({ type: "state", state: liveState(key, get(key)) });

  // Called on open and after pi replaces the session (fork, new, switch): subscriptions belong to the old one.
  async function bind(key: string) {
    const entry = get(key);
    entry.unsubscribe?.();
    // A replaced session starts clean: the old one's agent_settled and tool ends never arrive here.
    entry.runStartedAt = undefined;
    entry.runningTools.clear();
    entry.queued = [];
    const { rt } = entry;
    entry.branch = await gitBranch(rt.cwd);
    const session = rt.session;
    await session.bindExtensions({
      uiContext: dialogs.uiContextFor(key),
      mode: "rpc",
      commandContextActions: {
        waitForIdle: () => session.waitForIdle(),
        newSession: (options) => rt.newSession(options),
        fork: async (entryId, options) => ({ cancelled: (await rt.fork(entryId, options)).cancelled }),
        navigateTree: async (targetId, options) => ({
          cancelled: (await session.navigateTree(targetId, options)).cancelled,
        }),
        switchSession: (path, options) => rt.switchSession(path, options),
        reload: () => session.reload(),
      },
      onError: (err) => notify("error", `${err.extensionPath}: ${err.error}`, key),
    });
    const forward = forwardEvents(key, send, () => sendState(key));
    entry.unsubscribe = session.subscribe((event) => {
      if (event.type === "tool_execution_start") entry.runningTools.add(event.toolCallId);
      if (event.type === "tool_execution_end") entry.runningTools.delete(event.toolCallId);
      if (event.type === "agent_start") entry.runStartedAt ??= Date.now();
      if (event.type === "agent_settled") entry.runStartedAt = undefined;
      if (event.type === "compaction_end") sendMessages(key, session);
      if (event.type === "queue_update") entry.queued = trimQueued(entry.queued, event.steering.length + event.followUp.length);
      forward(event);
    });
    sendMessages(key, session);
    sendState(key);
  }

  const keyOf = (path: string) => [...live].find(([, { rt }]) => rt.session.sessionFile === path)?.[0];

  async function drop(key: string) {
    const entry = get(key);
    entry.unsubscribe?.();
    live.delete(key);
    dialogs.cancelFor(key);
    await entry.rt.dispose();
    send({ type: "closed", key });
  }

  function get(key: string) {
    const entry = live.get(key);
    if (!entry) throw new Error(`No open session ${key}`);
    return entry;
  }

  /** Two quick opens of one file (a double-click) must not make two runtimes that both write to it. */
  function openOnce(target: OpenTarget & { path: string }) {
    const pending = opening.get(target.path) ?? openNow(target).finally(() => opening.delete(target.path));
    opening.set(target.path, pending);
    return pending;
  }

  /**
   * Opens under `key`. A file that is open already keeps its own key. If the user cancels the trust dialog, nothing opens.
   * `createManager` opens a session manager made elsewhere (a clone).
   */
  async function openNow({ key, cwd, path, createManager }: OpenTarget & { createManager?: () => SessionManager }) {
    const found = path && keyOf(path);
    if (found) {
      // Already bound: only send it again. A new bind in the middle of a run would lose its timer and tool spinners.
      sendMessages(found, get(found).rt.session);
      sendState(found);
      return;
    }
    if (!(await runtimes.ensureTrust(cwd))) return;
    const rt = await runtimes.create(cwd, createManager ? createManager() : path ? SessionManager.open(path) : SessionManager.create(cwd));
    live.set(key, { rt, runningTools: new Set(), queued: [] });
    rt.setRebindSession(() => bind(key));
    await bind(key);
  }

  return {
    /** No `path` = a new session. The window finds the key in the state it gets: `key`, or the key of the open file. */
    open(target: OpenTarget) {
      assertNewKey(target.key, live);
      if (!target.path) return openNow(target);
      wanted.add(target.path);
      return openOnce({ ...target, path: target.path });
    },

    /**
     * Resolves when pi accepted the message (its checks passed: model, key, not compacting), and rejects
     * with pi's reason if not. The run itself continues; its errors arrive as notices.
     */
    async prompt(key: string, text: string, behavior?: "steer" | "followUp", imagePaths: string[] = []) {
      const entry = get(key);
      const s = entry.rt.session;
      const images = await Promise.all(imagePaths.map((path) => readImage(grants, path)));
      const streaming = s.isStreaming;
      const queuedBefore = s.pendingMessageCount;
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const settle = (error?: Error) => {
          if (done) return false;
          done = true;
          if (error) reject(error);
          else resolve();
          return true;
        };
        // A failed preflight is always followed by pi's throw, which carries the reason: settle on that.
        s.prompt(text, { images, streamingBehavior: streaming ? (behavior ?? "steer") : undefined, preflightResult: (ok) => ok && settle() })
          .then(() => settle())
          .catch((e: Error) => {
            // Already settled: pi accepted the message, so a later run error is only a notice.
            if (!settle(e) && live.has(key)) notify("error", e.message, key);
          })
          .finally(() => sendState(key));
      });
      // Only a message pi really queued gets a "Queued" row (an extension command runs at once, input handlers can take it).
      // ponytail: compares counts; a queued message delivered in the same moment can hide the new one.
      if (streaming && s.pendingMessageCount > queuedBefore) entry.queued.push({ text, images: imagePaths });
      sendState(key);
    },

    abort: (key: string) => get(key).rt.session.abort(),

    /** Board 2c: extension commands, prompt templates and skills, as terminal pi offers them. */
    commands(key: string): SlashCommand[] {
      const s = get(key).rt.session;
      return [
        ...s.extensionRunner.getRegisteredCommands().map((c) => ({ name: c.invocationName, description: c.description ?? "", source: "extension" as const })),
        ...s.promptTemplates.map((p) => ({ name: p.name, description: p.description, source: "prompt" as const })),
        ...s.resourceLoader.getSkills().skills.map((k) => ({ name: `skill:${k.name}`, description: k.description, source: "skill" as const })),
      ];
    },

    models: (key: string): ModelChoice[] => availableModels(get(key).rt.session.modelRuntime),

    async setModel(key: string, provider: string, id: string) {
      const s = get(key).rt.session;
      const model = s.modelRuntime.getAvailableSnapshot().find((m) => m.provider === provider && m.id === id);
      if (!model) throw new Error(`Model ${provider}/${id} is not available`);
      await s.setModel(model);
      sendState(key);
    },

    /** Board 3: the tree around pi's current point. */
    tree(key: string) {
      const sm = get(key).rt.session.sessionManager;
      return buildTree(sm.getEntries() as unknown as FileEntry[], sm.getLeafId());
    },

    /**
     * Board 3: "Switch to branch" (or to any point). On a user message pi goes to the point before it and gives
     * the message back to edit and send again. `summarize` keeps what pi learned on the branch you leave.
     */
    async navigate(key: string, id: string, summarize: boolean) {
      const s = get(key).rt.session;
      const r = await s.navigateTree(id, { summarize });
      sendMessages(key, s);
      sendState(key);
      return { editorText: r.editorText, tree: this.tree(key) };
    },

    /** Board 3a: an empty label removes it. */
    label(key: string, id: string, label: string) {
      get(key).rt.session.sessionManager.appendLabelChange(id, label.trim() || undefined);
    },

    /**
     * Board 3: Fork (a new session with the history before this point) or Clone (with the history through it).
     * pi then works in the new session; bind() sends it to the window under the same key.
     */
    async fork(key: string, id: string, at: boolean) {
      const r = await get(key).rt.fork(id, at ? { position: "at" } : undefined);
      return { cancelled: r.cancelled, editorText: r.selectedText };
    },

    /** Board 2: "Compact now". Long; the state shows it running, errors come as a notice. */
    compact(key: string) {
      const s = get(key).rt.session;
      s.compact().catch((e: Error) => notify("error", `Compact failed: ${e.message}`, key)).finally(() => sendState(key));
      sendState(key);
    },

    /** Board 2: "Reload" — read context files, skills, prompts and extensions again. */
    async reload(key: string) {
      await get(key).rt.session.reload();
      sendState(key);
    },

    /** Board 4: "Reload" — open sessions read their extensions, skills, prompts and themes again. */
    async reloadAll() {
      for (const [key, { rt }] of live) {
        await rt.session.reload();
        sendState(key);
      }
      return live.size;
    },

    setTools(key: string, names: string[]) {
      const s = get(key).rt.session;
      const known = new Set(s.getAllTools().map((t) => t.name));
      s.setActiveToolsByName(names.filter((n) => known.has(n)));
      sendState(key);
    },

    /** Take the queued messages back, as typed and with their images, to edit them in the message box. */
    dequeue(key: string) {
      const entry = get(key);
      // Read ours first: clearQueue() fires queue_update at once, and that handler trims this list.
      const back = entry.queued;
      entry.queued = [];
      entry.rt.session.clearQueue();
      sendState(key);
      return back;
    },

    /**
     * Board 1.2: the session moves to `cwd` with its chat. Its file gets the new folder in its header and goes to that
     * folder's sessions; pi then works in `cwd` under the same key. If the user cancels the trust dialog, nothing moves.
     */
    async move(key: string, cwd: string) {
      const { rt } = get(key);
      if (rt.session.isStreaming) throw new Error("pi is working. Wait until it is done, then move the session.");
      if (rt.cwd === cwd) return;
      if (!(await runtimes.ensureTrust(cwd))) return;
      const from = rt.session.sessionFile;
      // pi writes the file after pi's first reply: before that there is nothing to move, so start in the project.
      if (!from || !existsSync(from)) {
        await drop(key);
        return openNow({ key, cwd });
      }
      const to = copyToFolder(from, SessionManager.create(cwd).getSessionDir(), cwd);
      const freeId = rt.cwd === NO_PROJECT_DIR ? rt.session.sessionManager.getSessionId() : undefined;
      const r = await rt.switchSession(to);
      if (r.cancelled) {
        rmSync(to);
        throw new Error("An extension stopped the move.");
      }
      rmSync(from);
      if (wanted.delete(from)) wanted.add(to);
      if (freeId) await moveFreeCanvases(freeId, cwd, (level, message) => notify(level, message, key));
    },

    /** A copy of the whole session, opened under `key`. */
    clone({ key, cwd, path }: OpenTarget & { path: string }) {
      assertNewKey(key, live);
      return openNow({ key, cwd, createManager: () => SessionManager.forkFrom(path, cwd) });
    },

    rename(path: string, name: string) {
      const key = keyOf(path);
      if (key) {
        get(key).rt.session.setSessionName(name);
        sendState(key);
      } else SessionManager.open(path).appendSessionInfo(name);
    },

    /** Export to the temporary file of export `id`. The main process moves it to the path the user picks. */
    async exportHtml({ id, cwd, path }: { id: string; cwd: string; path: string }) {
      const file = exportFile(id);
      const wasOpen = keyOf(path);
      // Not open() here: an export alone does not make the file one the user opened.
      if (!wasOpen) await openOnce({ key: randomUUID(), cwd, path });
      const key = keyOf(path);
      if (!key) throw new Error("Export cancelled");
      try {
        await get(key).rt.session.exportToHtml(file);
      } finally {
        // Opened only for this export, and the user did not open it meanwhile: close it again.
        if (!wasOpen && !wanted.has(path)) await this.close(path);
      }
    },

    /** Stop and forget an open session (before its file goes to the Trash). */
    async close(path: string) {
      const key = keyOf(path);
      if (!key) return;
      wanted.delete(path);
      await drop(key);
    },

    setThinking(key: string, level: string) {
      get(key).rt.session.setThinkingLevel(level as ThinkingLevel);
      sendState(key);
    },

    /** A new window port knows nothing: send every open session again. */
    resendAll() {
      for (const [key, { rt }] of live) {
        sendMessages(key, rt.session);
        sendState(key);
      }
    },
  };
}

async function gitBranch(cwd: string) {
  try {
    // symbolic-ref works in a repo with no commits, and fails on a detached HEAD (no branch to show).
    const { stdout } = await promisify(execFile)("git", ["symbolic-ref", "--short", "HEAD"], { cwd, timeout: GIT_TIMEOUT_MS });
    return stdout.trim() || undefined;
  } catch {
    return undefined; // not a git repository, or no git
  }
}
