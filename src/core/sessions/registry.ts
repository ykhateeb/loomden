import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  type AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  hasTrustRequiringProjectResources,
  type ModelRuntime,
  ProjectTrustStore,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { AgentMessage, LiveState, ModelChoice, Send, SlashCommand, TrustAnswer } from "#protocol";
import { readImage } from "#core/attachments";
import { forwardEvents } from "./events";
import { ask, cancelFor, uiContextFor } from "./extension-ui";
import type { Entry as FileEntry } from "./summary";
import { buildTree } from "./tree";
import { resourceName, settingsWithoutMissing } from "#core/packages";
import { availableModels } from "#core/providers";
import { EXPORT_PREFIX, FREE_CANVAS_DIR, NO_PROJECT_DIR } from "#core/paths";
import loomdenCanvas from "#canvas/extension";
import { designSystemDir, ensureGitignore, freeRoot, moveCanvases, moveDesignSystem, projectRoot } from "#canvas/store";

type Session = AgentSessionRuntime["session"];
type ThinkingLevel = Session["thinkingLevel"];

type Entry = {
  rt: AgentSessionRuntime;
  unsubscribe?: () => void;
  runningTools: Set<string>;
  branch?: string;
  runStartedAt?: number;
  /** What the user queued, as typed and with image paths (pi keeps only the expanded text). */
  queued: { text: string; images: string[] }[];
};

const GIT_TIMEOUT_MS = 3000;
const TITLE_MAX_LENGTH = 80;

export function createRegistry(send: Send, modelRuntime: ModelRuntime) {
  const live = new Map<string, Entry>();
  // Session files the user opened (not only an export): an export never closes these.
  const wanted = new Set<string>();
  // Opens in progress, by session file.
  const opening = new Map<string, Promise<string | undefined>>();
  // "Open without project files" answers, for this app run only.
  const trustOnce = new Map<string, boolean>();

  const factory: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
    const trusted = new ProjectTrustStore(getAgentDir()).get(cwd) ?? trustOnce.get(cwd) ?? false;
    const { settingsManager, missing } = settingsWithoutMissing(cwd);
    if (missing.length) notify("warning", `Not installed, so not loaded: ${missing.join(", ")}. Install them in Packages.`);
    const services = await createAgentSessionServices({
      cwd,
      modelRuntime,
      settingsManager,
      // Loomden ships the design canvas itself: no `pi install` needed. Bundle is out/main/agent.js.
      resourceLoaderOptions: {
        extensionFactories: [{ name: "loomden-canvas", factory: loomdenCanvas }],
        additionalSkillPaths: [join(import.meta.dirname, "../../packages/loomden-canvas/skills")],
      },
      resourceLoaderReloadOptions: { resolveProjectTrust: async () => trusted },
    });
    return {
      ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
      services,
      diagnostics: services.diagnostics,
    };
  };

  const notify = (level: "info" | "warning" | "error", message: string, key?: string) => send({ type: "notify", key, level, message });
  const sendMessages = (key: string, session: Session) => send({ type: "messages", key, messages: session.messages as AgentMessage[] });
  // A run can end after its session was closed (deleted while it streamed): then there is nothing to send.
  const sendState = (key: string) => live.has(key) && send({ type: "state", state: state(key) });

  /** Ask once for a folder with .pi/ extensions, skills or prompts. false = the user cancelled. */
  async function ensureTrust(cwd: string): Promise<boolean> {
    const store = new ProjectTrustStore(getAgentDir());
    if (!hasTrustRequiringProjectResources(cwd) || store.get(cwd) !== null || trustOnce.has(cwd)) return true;
    const answer = await ask<TrustAnswer | undefined>(send, { method: "trust", cwd, files: piFiles(cwd) }, undefined);
    if (!answer) return false;
    if (answer === "trust") store.set(cwd, true);
    else trustOnce.set(cwd, false);
    return true;
  }

  function state(key: string): LiveState {
    const { rt, runningTools, branch, runStartedAt, queued } = get(key);
    const s = rt.session;
    const stats = s.getSessionStats();
    const active = new Set(s.getActiveToolNames());
    return {
      key,
      cwd: rt.cwd,
      file: s.sessionFile,
      title: s.sessionName ?? firstUserText(s.messages) ?? "New session",
      branch,
      streaming: s.isStreaming,
      runStartedAt,
      model: s.model?.id,
      provider: s.model?.provider,
      thinking: s.thinkingLevel,
      thinkingLevels: s.supportsThinking() ? s.getAvailableThinkingLevels() : [],
      cost: stats.cost,
      tokensIn: stats.tokens.input + stats.tokens.cacheRead,
      tokensOut: stats.tokens.output,
      context: s.getContextUsage(),
      compactAt: compactAt(s),
      compacting: s.isCompacting,
      resources: resources(s),
      tools: s.getAllTools().map((t) => ({ name: t.name, active: active.has(t.name) })),
      runningTools: [...runningTools],
      queued,
    };
  }

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
      uiContext: uiContextFor(key, send),
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
      // pi took queued messages into the run: drop them from the front of ours.
      // ponytail: assumes pi delivers in the order they were queued; mixed steer/follow-up can differ.
      if (event.type === "queue_update") {
        const stillQueued = event.steering.length + event.followUp.length;
        entry.queued = entry.queued.slice(entry.queued.length - stillQueued);
      }
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
    cancelFor(key);
    await entry.rt.dispose();
    send({ type: "closed", key });
  }

  function get(key: string) {
    const entry = live.get(key);
    if (!entry) throw new Error(`No open session ${key}`);
    return entry;
  }

  /** Two quick opens of one file (a double-click) must not make two runtimes that both write to it. */
  function openOnce(cwd: string, path: string) {
    const pending = opening.get(path) ?? openNow(cwd, path).finally(() => opening.delete(path));
    opening.set(path, pending);
    return pending;
  }

  /** `createManager` opens a session manager made elsewhere (a clone). undefined = the user cancelled the trust dialog. */
  async function openNow(cwd: string, path?: string, createManager?: () => SessionManager): Promise<string | undefined> {
    const found = path && keyOf(path);
    if (found) {
      // Already bound: only send it again. A new bind in the middle of a run would lose its timer and tool spinners.
      sendMessages(found, get(found).rt.session);
      sendState(found);
      return found;
    }
    if (!(await ensureTrust(cwd))) return undefined;
    const rt = await createAgentSessionRuntime(factory, {
      cwd,
      agentDir: getAgentDir(),
      sessionManager: createManager ? createManager() : path ? SessionManager.open(path) : SessionManager.create(cwd),
    });
    const key = randomUUID();
    live.set(key, { rt, runningTools: new Set(), queued: [] });
    rt.setRebindSession(() => bind(key));
    await bind(key);
    return key;
  }

  /** Board C14: the session's canvases move into the project, where the team gets them with git. */
  async function moveFreeCanvases(key: string, sessionId: string, cwd: string) {
    const freeDir = freeRoot(FREE_CANVAS_DIR, sessionId);
    try {
      const moved = await moveCanvases(freeDir, projectRoot(cwd));
      await moveDesignSystem(designSystemDir(freeDir), designSystemDir(projectRoot(cwd)));
      if (moved.length) {
        await ensureGitignore(cwd);
        notify("info", `Canvas moved to ${basename(cwd)}/.loomden/canvases/${moved.join(", ")}`, key);
      }
    } catch (e) {
      notify("error", `The session moved, but its canvas did not: ${(e as Error).message}. It is still in ${freeDir}`, key);
    }
  }

  return {
    /** Returns the session key, or undefined if the user cancelled the trust dialog. No `path` = a new session. */
    open(cwd: string, path?: string): Promise<string | undefined> {
      if (!path) return openNow(cwd);
      wanted.add(path);
      return openOnce(cwd, path);
    },

    /**
     * Resolves when pi accepted the message (its checks passed: model, key, not compacting), and rejects
     * with pi's reason if not. The run itself continues; its errors arrive as notices.
     */
    async prompt(key: string, text: string, behavior?: "steer" | "followUp", imagePaths: string[] = []) {
      const entry = get(key);
      const s = entry.rt.session;
      const images = await Promise.all(imagePaths.map(readImage));
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
      return this.tree(key);
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
     * folder's sessions; pi then works in `cwd` under the same key. undefined = the user cancelled the trust dialog.
     */
    async move(key: string, cwd: string): Promise<string | undefined> {
      const { rt } = get(key);
      if (rt.session.isStreaming) throw new Error("pi is working. Wait until it is done, then move the session.");
      if (rt.cwd === cwd) return key;
      if (!(await ensureTrust(cwd))) return undefined;
      const from = rt.session.sessionFile;
      // pi writes the file after pi's first reply: before that there is nothing to move, so start in the project.
      if (!from || !existsSync(from)) {
        await drop(key);
        return this.open(cwd);
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
      if (freeId) await moveFreeCanvases(key, freeId, cwd);
      return key;
    },

    /** A copy of the whole session, opened. */
    clone(cwd: string, path: string) {
      return openNow(cwd, undefined, () => SessionManager.forkFrom(path, cwd));
    },

    rename(path: string, name: string) {
      const key = keyOf(path);
      if (key) {
        get(key).rt.session.setSessionName(name);
        sendState(key);
      } else SessionManager.open(path).appendSessionInfo(name);
    },

    /** Export to a temporary file. The main process moves it to the path the user picks. */
    async exportHtml(cwd: string, path: string) {
      const wasOpen = keyOf(path);
      // Not open() here: an export alone does not make the file one the user opened.
      const key = wasOpen ?? (await openOnce(cwd, path));
      if (!key) throw new Error("Export cancelled");
      try {
        return await get(key).rt.session.exportToHtml(join(tmpdir(), `${EXPORT_PREFIX}${randomUUID()}.html`));
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

    running: () => [...live.values()].filter(({ rt }) => rt.session.isStreaming).length,
  };
}

/** A copy of a session file in `dir`, with `cwd` in its header (pi reads the folder to work in from there). Never overwrites. */
export function copyToFolder(from: string, dir: string, cwd: string) {
  const to = join(dir, basename(from));
  const [header, ...rest] = readFileSync(from, "utf8").split("\n");
  writeFileSync(to, [JSON.stringify({ ...JSON.parse(header), cwd }), ...rest].join("\n"), { flag: "wx" });
  return to;
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

/** Board 1's trust dialog: what the project's .pi folder holds. */
function piFiles(cwd: string) {
  try {
    return readdirSync(join(cwd, ".pi"), { withFileTypes: true }).map((e) => {
      if (!e.isDirectory()) return { name: `.pi/${e.name}` };
      const n = readdirSync(join(cwd, ".pi", e.name)).length;
      return { name: `.pi/${e.name}/`, detail: `${n} ${n === 1 ? "item" : "items"}` };
    });
  } catch {
    return [];
  }
}

function compactAt(s: Session) {
  const window = s.model?.contextWindow;
  if (!window || !s.autoCompactionEnabled) return undefined;
  return window - s.settingsManager.getCompactionSettings(s.model).reserveTokens;
}

function resources(s: Session): LiveState["resources"] {
  const loader = s.resourceLoader;
  const skills = loader.getSkills().skills.map((k) => k.name);
  const system = loader.getSystemPromptSource();
  return [
    ...loader.getAgentsFiles().agentsFiles.map((f) => ({ name: basename(f.path), kind: "file" as const })),
    ...(system ? [{ name: basename(system.path), kind: "system" as const }] : []),
    ...(skills.length ? [{ name: skills.join(" · "), kind: "skills" as const }] : []),
    ...loader.getExtensions().extensions.filter((e) => !e.hidden).map((e) => ({ name: resourceName("extensions", e.path), kind: "extension" as const })),
  ];
}

function firstUserText(messages: readonly AgentMessage[]): string | undefined {
  const m = messages.find((m) => m.role === "user");
  if (!m || m.role !== "user") return undefined;
  const text = typeof m.content === "string" ? m.content : m.content.find((c) => c.type === "text")?.text;
  return text?.split("\n")[0].slice(0, TITLE_MAX_LENGTH);
}
