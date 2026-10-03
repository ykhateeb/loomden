import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { Type } from "typebox";
import { defineTool, type BeforeAgentStartEventResult, type ExtensionAPI, type ExtensionCommandContext, type ToolCallEvent, type ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { startServer, type CanvasServer } from "./server.js";
import { RAW_BOARD, RAW_STATE, STATUS_BUILD, STATUS_CANVAS, boardKey, canvasExists, designSystemDir, projectRoot, createBoard, readLog, type Canvas, type LogEntry, clearEditing, clearPlan, createCanvas, freeCanvasName, freeRoot, planBoards, markEditing, unmarkEditing, editBoard, listCanvases, readBoard, readCanvas, setNoteState } from "./store.js";
import { RAW_TOKENS, dsItems, proposeTokens, readTokens } from "./tokens.js";
import { compareBoard, readCompares } from "./compare.js";
import { gitignoreMissing, ensureGitignore } from "./project.js";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: undefined });

type Ctx = { cwd: string; sessionManager: { getSessionId(): string } };
type StatusUi = { setStatus(id: string, text: string | undefined): void };
type BoardRef = { canvas?: string; board?: string };

/** What the tools, the event handlers, and /canvas share in one pi session. */
type CanvasSession = {
  readonly pi: ExtensionAPI;
  server?: CanvasServer;
  ui?: StatusUi;
  readonly announced: Set<string>;
  readonly planned: Set<string>; // canvases this session planned boards for
  lastRoot?: string;
  lastTurn: string;
};

export default function (pi: ExtensionAPI) {
  const session: CanvasSession = { pi, announced: new Set(), planned: new Set(), lastTurn: new Date().toISOString() };
  for (const tool of canvasTools(session)) pi.registerTool(tool);

  const busy = createBusyBoards();
  pi.on("tool_result", (event) => busy.clear(event.toolCallId));
  pi.on("agent_end", async () => {
    await busy.clear(); // a stopped run leaves nothing marked
    await clearUnmadePlans(session);
  });
  pi.on("session_start", (_e, ctx) => clearStaleMarks(session, ctx));
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "canvas_create" || event.toolName === "canvas_edit") {
      await busy.mark(event.toolCallId, rootOf(ctx), event.input as BoardRef);
      return undefined;
    }
    return writeGuard(event, ctx.cwd);
  });
  pi.on("before_agent_start", (_e, ctx) => turnContext(session, ctx));
  pi.registerCommand("canvas", {
    description: "Open a design canvas in the browser",
    handler: (args, ctx) => runCanvasCommand(session, args, ctx),
  });
  // Idempotent: safe to call twice.
  pi.on("session_shutdown", () => {
    session.server?.close();
    session.server = undefined;
    session.announced.clear();
  });
}

/** What pi hears about one canvas before its turn: the boards, the open notes, and the person's changes since `since`. */
export function canvasContext({ name, canvas, log, since }: { name: string; canvas: Canvas; log: readonly LogEntry[]; since: string }): string[] {
  return [
    `Canvas ${name}: ${Object.entries(canvas.boards).map(([key, b]) => `${key} rev ${b.rev}`).join(", ")}`,
    ...Object.entries(canvas.notes).filter(([, n]) => n.state !== "done")
      .map(([id, n]) => `  note ${id} (${n.state}) on ${n.board}, tid ${n.target.tid} “${n.target.text}”: ${n.text}`),
    ...log.filter((e) => isYourChangeSince(e, since)).map((e) => `  You changed ${e.board} (rev ${e.rev})${e.why ? ": " + e.why : ""}`),
  ];
}

/** A change the person made in the viewer and told pi about, after `since`. */
const isYourChangeSince = (e: LogEntry, since: string) => e.by === "you" && !e.quiet && e.at > since;

/** pi gets the sent notes with this turn: they become "work". */
async function markSentAsWork(root: string, name: string, canvas: Canvas) {
  const sent = Object.entries(canvas.notes).filter(([, n]) => n.state === "sent").map(([id]) => id);
  if (sent.length) await setNoteState(root, name, sent, "work");
}

export type CanvasArgs = { mode: "new" | "auto"; title: string } | { mode: "open"; name: string };

/** The arguments of /canvas: "new <title>" (the + Canvas button), "auto <title>" (Canvas ⇧C), or the name of a canvas. */
export function parseCanvasArgs(args: string): CanvasArgs {
  const made = args.trim().match(/^(new|auto)(?:\s+(.*))?$/);
  if (!made) return { mode: "open", name: args.trim() };
  const mode = made[1] as "new" | "auto"; // the regex matches only these two words
  return { mode, title: (made[2] ?? "").trim() || "Untitled canvas" };
}

// A project keeps its canvases in .tenon/. A Tenon session with no project keeps them in its own folder until it is added to a project.
function isFree(ctx: Ctx) {
  return !!process.env.TENON_NO_PROJECT && resolve(ctx.cwd) === resolve(process.env.TENON_NO_PROJECT);
}

function rootOf(ctx: Ctx) {
  return isFree(ctx) ? freeRoot(process.env.TENON_FREE_DIR!, ctx.sessionManager.getSessionId()) : projectRoot(ctx.cwd);
}

function dsOf(ctx: Ctx) {
  return designSystemDir(rootOf(ctx));
}

// Tenon shows the canvas in a panel and reads the address from the status. Terminal pi opens the browser.
function inTenon() {
  return !!process.env.TENON_APP;
}

function serverOptions(session: CanvasSession, root: string) {
  return {
    root,
    onSend: (t: string) => session.pi.sendUserMessage(t, { deliverAs: "followUp" }),
    // In Tenon, "Start build session" opens a new session with the pack. In a terminal, the pack comes to this session.
    onBuild: inTenon() ? (_c: string, pack: { title: string; text: string }) => session.ui?.setStatus(STATUS_BUILD, JSON.stringify(pack)) : undefined,
  };
}

async function show(session: CanvasSession, ctx: Ctx & { ui: StatusUi }, name: string) {
  session.ui = ctx.ui;
  session.server ??= await startServer(serverOptions(session, rootOf(ctx)));
  session.announced.add(name);
  ctx.ui.setStatus(STATUS_CANVAS, session.server.url(name));
}

function canvasTools(session: CanvasSession) {
  return [
    defineTool({
      name: "canvas_create",
      label: "Canvas create",
      description: "Create a design canvas, or add a board (one HTML file) to it. Writes rev 1. Read the tenon-design skill first.",
      parameters: Type.Object({
        canvas: Type.String({ description: "Canvas slug, e.g. checkout-redesign" }),
        board: Type.String({ description: "Board file name, e.g. cart" }),
        title: Type.String({ description: "Board title, e.g. Cart" }),
        w: Type.Number({ description: "Width in px. Phone: 390" }),
        h: Type.Number({ description: "Height in px. Phone: 844" }),
        html: Type.String({ description: "The full board HTML. See references/format.md" }),
        canvasTitle: Type.Optional(Type.String({ description: "Canvas title, for a new canvas" })),
      }),
      async execute(_id, a, _s, _u, ctx) {
        const isNew = !canvasExists(rootOf(ctx), a.canvas);
        await createBoard(rootOf(ctx), a);
        const addedGitignoreLine = isNew && (await gitignoreMissing(ctx.cwd));
        if (addedGitignoreLine) await ensureGitignore(ctx.cwd);
        if (inTenon() && !session.announced.has(a.canvas)) await show(session, ctx, a.canvas); // the panel opens as the first board appears
        return text(`Created ${a.canvas}/${a.board} at rev 1.` +
          (addedGitignoreLine ? " Added .tenon/canvases/*/history/ to .gitignore; show this change in the review." : ""));
      },
    }),
    defineTool({
      name: "canvas_read",
      label: "Canvas read",
      description: "Read canvases. No args: list canvases. `canvas`: boards and notes. `canvas` and `board`: the board HTML and its rev. Read a board before you edit it.",
      parameters: Type.Object({
        canvas: Type.Optional(Type.String()),
        board: Type.Optional(Type.String()),
      }),
      async execute(_id, a, _s, _u, ctx) {
        const root = rootOf(ctx);
        if (!a.canvas) return text(JSON.stringify(await listCanvases(root)));
        if (a.board) {
          const b = await readBoard(root, a.canvas, a.board);
          return text(`rev ${b.rev} (by ${b.by})\n${b.html}`);
        }
        return text(JSON.stringify(await readCanvas(root, a.canvas), null, 2));
      },
    }),
    defineTool({
      name: "canvas_edit",
      label: "Canvas edit",
      description: "Save a board as a new rev. Give the full `html`, or small `edits` (each `find` must match exactly once). `baseRev` is the rev you read. It fails if the board changed since: read it again and redo your change. Keep every data-tid attribute.",
      parameters: Type.Object({
        canvas: Type.String(),
        board: Type.String(),
        baseRev: Type.Number({ description: "The rev you read" }),
        html: Type.Optional(Type.String()),
        edits: Type.Optional(Type.Array(Type.Object({ find: Type.String(), replace: Type.String() }))),
        why: Type.Optional(Type.String({ description: "Short reason, kept in the history log" })),
      }),
      async execute(_id, a, _s, _u, ctx) {
        await editBoard(rootOf(ctx), a);
        return text(`Saved ${a.canvas}/${a.board} at rev ${a.baseRev + 1}.`); // the write guard makes it baseRev + 1
      },
    }),
    defineTool({
      name: "canvas_note_done",
      label: "Note done",
      description: "Mark notes done after you checked the board. You cannot approve boards; only a person does.",
      parameters: Type.Object({ canvas: Type.String(), ids: Type.Array(Type.String()) }),
      async execute(_id, a, _s, _u, ctx) {
        await setNoteState(rootOf(ctx), a.canvas, a.ids, "done");
        return text(`Marked ${a.ids.join(", ")} done.`);
      },
    }),
    defineTool({
      name: "canvas_plan",
      label: "Plan boards",
      description: "Before you make several boards, list them all. The canvas shows a place for each, marked writing or waiting, until you create it. Call this once, then canvas_create for each board in order.",
      parameters: Type.Object({
        canvas: Type.String({ description: "Canvas slug" }),
        boards: Type.Array(Type.Object({ board: Type.String(), title: Type.String(), w: Type.Optional(Type.Number()), h: Type.Optional(Type.Number()) })),
        canvasTitle: Type.Optional(Type.String()),
      }),
      async execute(_id, a, _s, _u, ctx) {
        session.lastRoot = rootOf(ctx);
        session.planned.add(a.canvas);
        const isNew = !canvasExists(rootOf(ctx), a.canvas);
        await planBoards(rootOf(ctx), a.canvas, a.boards, a.canvasTitle);
        if (isNew) await ensureGitignore(ctx.cwd);
        if (inTenon() && !session.announced.has(a.canvas)) await show(session, ctx, a.canvas); // the panel opens with the places for the boards
        const count = (await readCanvas(rootOf(ctx), a.canvas)).plan?.length ?? 0;
        return text(`Planned ${count} boards. Now call canvas_create for each, in this order.`);
      },
    }),
    defineTool({
      name: "design_compare",
      label: "Compare with the app",
      description: "Compare a board (at its approved rev) with the running app. Give what the app shows: each element's text and the style values you read from the code or the simulator. The differences show next to the board, where a person picks Fix the code or Board is wrong.",
      parameters: Type.Object({
        canvas: Type.String(),
        board: Type.String(),
        app: Type.Array(Type.Object({
          text: Type.String({ description: "The element's text, as on screen" }),
          styles: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]), { description: "For example { fontWeight: 400, marginTop: 12 }" })),
        })),
        screenshot: Type.Optional(Type.String({ description: "Path of a png, jpg or webp screenshot of the app screen" })),
      }),
      async execute(_id, a, _s, _u, ctx) {
        await compareBoard(rootOf(ctx), a.canvas, dsOf(ctx), { ...a, screenshot: a.screenshot && resolve(ctx.cwd, a.screenshot) });
        const r = (await readCompares(rootOf(ctx), a.canvas))[boardKey(a.board)];
        return text(r.differences.length
          ? `${r.differences.length} difference${r.differences.length === 1 ? "" : "s"} from board ${a.board} (rev ${r.rev}):\n${r.differences.map((d) => `- ${d.title}. ${d.detail}`).join("\n")}\nThe person sees them next to the board.`
          : `No differences from board ${a.board} (rev ${r.rev}) in what you gave.`);
      },
    }),
    defineTool({
      name: "design_system_propose",
      label: "Propose design system",
      description: "Propose a new .tenon/design-system/tokens.json, read from the project's code (for example src/theme.ts). Give the full tokens object. A person reviews it in the canvas and accepts it; you cannot write tokens.json.",
      parameters: Type.Object({
        tokens: Type.Any({ description: "tokens.json content: { name, version, source, color:{tokens:[{name,value,usage}]}, type:{families,styles}, spacing:{tokens}, radius:{tokens} }" }),
      }),
      async execute(_id, a, _s, _u, ctx) {
        await proposeTokens(dsOf(ctx), a.tokens);
        return text(`Proposed ${dsItems(a.tokens).length} tokens. Tell the person to review them in the Design system tab of /canvas.`);
      },
    }),
  ];
}

/** "pi is writing" and "pi is editing" while a canvas tool works on a board (board C6). */
function createBusyBoards() {
  const busy = new Map<string, { root: string; canvas: string; board: string }>();
  return {
    async mark(toolCallId: string, root: string, input: BoardRef) {
      if (!input.canvas || !input.board) return;
      try {
        busy.set(toolCallId, { root, canvas: input.canvas, board: input.board });
        await markEditing(root, input.canvas, input.board);
      } catch {
        busy.delete(toolCallId); // a bad name fails in the tool itself, with its own message
      }
    },
    /** Clears the board of one tool call, or of all of them when `toolCallId` is not given. */
    async clear(toolCallId?: string) {
      for (const [k, b] of [...busy]) if (!toolCallId || k === toolCallId) { busy.delete(k); await unmarkEditing(b.root, b.canvas, b.board).catch(() => {}); }
    },
  };
}

/** Boards pi planned but did not make are not coming any more. */
async function clearUnmadePlans(session: CanvasSession) {
  for (const name of session.planned) await clearPlan(session.lastRoot!, name).catch(() => {});
  session.planned.clear();
}

/** A crash between a tool's start and end left a board marked: start clean. */
async function clearStaleMarks(session: CanvasSession, ctx: Ctx) {
  const root = rootOf(ctx);
  session.lastRoot = root;
  for (const name of await listCanvases(root)) await clearEditing(root, name).catch(() => {});
}

/**
 * Write guard: board files change only through the tools.
 * ponytail: covers write and edit only. A bash command can still write these files.
 */
function writeGuard(event: ToolCallEvent, cwd: string): ToolCallEventResult | undefined {
  if (event.toolName !== "write" && event.toolName !== "edit") return undefined;
  const p = resolve(cwd, String((event.input as { path?: unknown }).path ?? ""));
  const posix = p.split("\\").join("/").toLowerCase(); // macOS and Windows file systems ignore case
  if (RAW_TOKENS.test(posix)) return { block: true, reason: "tokens.json changes only when a person accepts a proposal: use design_system_propose" };
  if (RAW_STATE.test(posix)) return { block: true, reason: "canvas.json, approved/ and history/ change only through the canvas tools. Only a person approves." };
  if (RAW_BOARD.test(posix)) return { block: true, reason: "Board files change only through the tools: use canvas_edit" };
  return undefined;
}

/** Short context for pi: open notes, design system, and what the person changed since the last turn. */
async function turnContext(session: CanvasSession, ctx: Ctx): Promise<BeforeAgentStartEventResult | undefined> {
  const root = rootOf(ctx);
  const since = session.lastTurn;
  session.lastTurn = new Date().toISOString();
  const lines: string[] = [];
  for (const name of await listCanvases(root)) {
    const canvas = await readCanvas(root, name);
    lines.push(...canvasContext({ name, canvas, log: await readLog(root, name), since }));
    await markSentAsWork(root, name, canvas); // pi gets these notes with this turn
  }
  if (!lines.length) return undefined;
  const tokens = await readTokens(dsOf(ctx));
  if (tokens) lines.push(`Design system: ${tokens.name}. Use its tokens as var(--name).`);
  return { message: { customType: "tenon-canvas", content: lines.join("\n"), display: false } };
}

/**
 * Board C3: "/canvas new <title>" (the + Canvas button) makes an empty canvas and asks pi to draft its boards.
 * "/canvas auto <title>" (Canvas ⇧C) opens the first canvas, or makes one when there is none.
 */
async function runCanvasCommand(session: CanvasSession, args: string, ctx: ExtensionCommandContext) {
  const root = rootOf(ctx);
  const open = async (name: string) => {
    if (inTenon()) return void (await show(session, ctx, name));
    session.server ??= await startServer(serverOptions(session, root));
    const url = session.server.url(name);
    ctx.ui.notify(`Canvas: ${url}`, "info");
    if (!process.env.TENON_NO_OPEN) spawn(process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open", [url], { stdio: "ignore", detached: true }).unref();
  };
  const command = parseCanvasArgs(args);
  const firstCanvas = (await listCanvases(root))[0];
  if (command.mode === "auto" && firstCanvas) return void (await open(firstCanvas));
  if (command.mode !== "open") {
    const title = command.title;
    const name = freeCanvasName(root, title);
    await createCanvas(root, { name, title });
    await ensureGitignore(ctx.cwd);
    await open(name);
    session.pi.sendUserMessage(`Created the canvas “${title}” (canvas "${name}"). Draft the boards for what we talked about: list them with canvas_plan first, then canvas_create for each board.`, { deliverAs: "followUp" });
    return;
  }
  const name = command.name || firstCanvas;
  if (!name) return ctx.ui.notify(`No canvas yet in ${root}. Ask pi to design a screen, or run /canvas new <title>.`, "info");
  await open(name);
}
