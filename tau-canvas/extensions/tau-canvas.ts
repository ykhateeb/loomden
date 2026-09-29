import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Type } from "typebox";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { startServer, type CanvasServer } from "./server.js";
import {
  RAW_BOARD, RAW_STATE, RAW_TOKENS, createBoard, proposeTokens, editBoard, ensureGitignore, listCanvases, readBoard, readCanvas, setNoteState,
} from "./store.js";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: undefined });

export default function (pi: ExtensionAPI) {
  let server: CanvasServer | undefined;
  let lastTurn = new Date().toISOString();
  const rootOf = (dir: string) => join(dir, ".tau", "canvases");
  // Tau shows the canvas in a panel and reads the address from the status. Terminal pi opens the browser.
  const inTau = () => !!process.env.TAU_APP;
  const announced = new Set<string>();
  const show = async (ctx: { cwd: string; ui: { setStatus(id: string, text: string | undefined): void } }, name: string) => {
    server ??= await startServer({ root: rootOf(ctx.cwd), onSend: (t) => pi.sendUserMessage(t, { deliverAs: "followUp" }) });
    announced.add(name);
    ctx.ui.setStatus("tau-canvas", server.url(name));
    return server.url(name);
  };

  const canvasTools = [
    defineTool({
      name: "canvas_create",
      label: "Canvas create",
      description: "Create a design canvas, or add a board (one HTML file) to it. Writes rev 1. Read the tau-design skill first.",
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
        const r = await createBoard(rootOf(ctx.cwd), a);
        const ignored = r.isNew && (await ensureGitignore(ctx.cwd));
        if (inTau() && !announced.has(a.canvas)) await show(ctx, a.canvas); // the panel opens as the first board appears
        return text(`Created ${a.canvas}/${a.board} at rev ${r.rev}.` +
          (ignored ? " Added .tau/canvases/*/history/ to .gitignore; show this change in the review." : ""));
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
        const root = rootOf(ctx.cwd);
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
        const r = await editBoard(rootOf(ctx.cwd), a);
        return text(`Saved ${a.canvas}/${a.board} at rev ${r.rev}.`);
      },
    }),
    defineTool({
      name: "canvas_note_done",
      label: "Note done",
      description: "Mark notes done after you checked the board. You cannot approve boards; only a person does.",
      parameters: Type.Object({ canvas: Type.String(), ids: Type.Array(Type.String()) }),
      async execute(_id, a, _s, _u, ctx) {
        await setNoteState(rootOf(ctx.cwd), a.canvas, a.ids, "done");
        return text(`Marked ${a.ids.join(", ")} done.`);
      },
    }),
  ];
  canvasTools.push(defineTool({
    name: "design_system_propose",
    label: "Propose design system",
    description: "Propose a new .tau/design-system/tokens.json, read from the project's code (for example src/theme.ts). Give the full tokens object. A person reviews it in the canvas and accepts it; you cannot write tokens.json.",
    parameters: Type.Object({
      tokens: Type.Any({ description: "tokens.json content: { name, version, source, color:{tokens:[{name,value,usage}]}, type:{families,styles}, spacing:{tokens}, radius:{tokens} }" }),
    }),
    async execute(_id, a, _s, _u, ctx) {
      const n = await proposeTokens(join(ctx.cwd, ".tau", "design-system"), a.tokens);
      return text(`Proposed ${n} tokens. Tell the person to review them in the Design system tab of /canvas.`);
    },
  }));
  canvasTools.forEach((t) => pi.registerTool(t));

  // Write guard: board files change only through canvas_edit.
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return undefined;
    const p = resolve(ctx.cwd, String((event.input as any).path ?? ""));
    const posix = p.split("\\").join("/");
    if (RAW_TOKENS.test(posix)) return { block: true, reason: "tokens.json changes only when a person accepts a proposal: use design_system_propose" };
    if (RAW_STATE.test(posix)) return { block: true, reason: "canvas.json, approved/ and history/ change only through the canvas tools. Only a person approves." };
    if (RAW_BOARD.test(posix)) return { block: true, reason: "Board files change only through the tools: use canvas_edit" };
    return undefined;
  });

  // Short context for pi: open notes, design system, and what the person changed since the last turn.
  pi.on("before_agent_start", async (_e, ctx) => {
    const root = rootOf(ctx.cwd);
    const since = lastTurn;
    lastTurn = new Date().toISOString();
    const lines: string[] = [];
    for (const name of await listCanvases(root)) {
      const c = await readCanvas(root, name);
      lines.push(`Canvas ${name}: ${Object.entries(c.boards).map(([k, b]) => `${k} rev ${b.rev}`).join(", ")}`);
      const sent = Object.entries(c.notes).filter(([, n]) => n.state === "sent").map(([id]) => id);
      if (sent.length) await setNoteState(root, name, sent, "work");
      for (const [id, n] of Object.entries(c.notes).filter(([, n]) => n.state !== "done"))
        lines.push(`  note ${id} (${n.state}) on ${n.board}, tid ${n.target.tid} “${n.target.text}”: ${n.text}`);
      const log = await readFile(join(root, name, "history", "log.jsonl"), "utf8").catch(() => "");
      for (const l of log.split("\n").filter(Boolean)) {
        const e = JSON.parse(l);
        if (e.by === "you" && !e.quiet && e.at > since) lines.push(`  You changed ${e.board} (rev ${e.rev})${e.why ? ": " + e.why : ""}`);
      }
    }
    if (!lines.length) return undefined;
    const ds = await readFile(join(ctx.cwd, ".tau", "design-system", "tokens.json"), "utf8").then((s) => JSON.parse(s), () => undefined);
    if (ds) lines.push(`Design system: ${ds.name}. Use its tokens as var(--name).`);
    return { message: { customType: "tau-canvas", content: lines.join("\n"), display: false } };
  });

  pi.registerCommand("canvas", {
    description: "Open a design canvas in the browser",
    async handler(args, ctx) {
      const root = rootOf(ctx.cwd);
      const name = args.trim() || (await listCanvases(root))[0];
      if (!name) return ctx.ui.notify(`No canvas yet in ${ctx.cwd}. Ask pi to design a screen.`, "info");
      if (inTau()) return void (await show(ctx, name));
      server ??= await startServer({ root, onSend: (t) => pi.sendUserMessage(t, { deliverAs: "followUp" }) });
      const url = server.url(name);
      ctx.ui.notify(`Canvas: ${url}`, "info");
      if (!process.env.TAU_NO_OPEN) spawn(process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open", [url], { stdio: "ignore", detached: true }).unref();
    },
  });

  // Idempotent: safe to call twice.
  pi.on("session_shutdown", () => {
    server?.close();
    server = undefined;
    announced.clear();
  });
}
