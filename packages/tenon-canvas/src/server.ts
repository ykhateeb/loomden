// Local server: 127.0.0.1 only, random port, private token as the first path segment.
// Server-sent events carry file changes to the page (one-way, so no ws dependency).
// ponytail: SSE + POST instead of WebSocket; switch if the page ever needs a fast two-way channel.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { watch, mkdirSync } from "node:fs";
import { dirname, extname, join, sep } from "node:path";
import { addNote, approve, readFlow, restoreRev, boardKey, canvasDir, canvasTabs, designSystemDir, patchBoard, readCanvas, readHistory, undoBoard, setNoteState, slug, type NoteState } from "./store.js";
import { acceptProposal, discardProposal, dsReport, tokensCss, writeTokensCss } from "./tokens.js";
import { designPack, readCompares, setDifferenceState } from "./compare.js";
import { POINT_SCRIPT, VIEWER } from "./web.js";

const TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};

export type CanvasServer = { url: (canvas: string) => string; close: () => void };

type ServerOptions = {
  root: string;
  onSend: (text: string) => void | Promise<void>;
  /** "Start build session": Tenon opens a new session with the pack. Without it, the pack goes to the current session. */
  onBuild?: (canvas: string, pack: { title: string; text: string }) => void | Promise<void>;
};

/** File changes come in bursts (a write, then a rename): send one event after a short wait. */
const EVENT_DEBOUNCE_MS = 60;
/** The longest question that the page can send to pi. */
const MAX_ASK = 500;

export async function startServer({ root, onSend, onBuild }: ServerOptions): Promise<CanvasServer> {
  const token = randomBytes(16).toString("hex");
  const base = `/${token}`;
  const ds = designSystemDir(root);
  const clients = new Set<ServerResponse>();
  const emit = (e: FileEvent) => { for (const r of clients) r.write(`data: ${JSON.stringify(e)}\n\n`); };

  mkdirSync(root, { recursive: true });
  await writeTokensCss(ds).catch(() => {}); // tokens.json may have changed while no server ran
  const timers = new Map<string, NodeJS.Timeout>();
  const watcher = watch(dirname(root), { recursive: true }, (_ev, f) => {
    if (!f) return;
    const ev = fileEvent(f.toString().split(sep));
    if (!ev) return; // history/, tokens.css and the rest are ignored
    if (ev.type === "tokens-changed") writeTokensCss(ds).catch(() => {}); // tokens.css follows tokens.json
    clearTimeout(timers.get(f.toString()));
    timers.set(f.toString(), setTimeout(() => emit(ev), EVENT_DEBOUNCE_MS));
  });

  const sendNotesAndMarkSent = async (canvas: string, ids: string[]) => {
    const c = await readCanvas(root, canvas);
    const lines = ids.filter((id) => c.notes[id]).map((id) => {
      const n = c.notes[id];
      return `On board ${c.boards[n.board]?.title ?? n.board}, element “${n.target.text}” (tid ${n.target.tid}): ${n.text}`;
    });
    if (!lines.length) return;
    await onSend(lines.length > 1 ? `Design notes on canvas "${canvas}":\n${lines.join("\n")}` : lines[0]); // if it fails, the notes stay as they are
    await setNoteState(root, canvas, ids, "sent");
  };

  // Compare (board C12): a person picks Fix the code or Board is wrong, and pi gets it once.
  const sendDecision = async (payload: any) => {
    const state = payload.action === "fix" ? "fix" : payload.action === "wrong" ? "wrong" : undefined;
    if (!state) throw new Error("bad action");
    const title = (await readCanvas(root, payload.canvas)).boards[boardKey(payload.board)]?.title ?? payload.board;
    const compare = (await readCompares(root, payload.canvas))[boardKey(payload.board)];
    const d = compare?.differences.find((x) => x.id === payload.id);
    if (!d) throw new Error("Difference not found");
    if (d.state !== "open") return; // already sent: a second click sends nothing
    await setDifferenceState(root, payload.canvas, payload.board, payload.id, state);
    try {
      await onSend(state === "fix"
        ? `Compare with the app, board ${title}: fix the code. ${d.title}. ${d.detail}`
        : `Compare with the app, board ${title}: the board is wrong. ${d.title}. ${d.detail} Change the board with canvas_edit so it matches the app. A person approves it again.`);
    } catch (e) {
      await setDifferenceState(root, payload.canvas, payload.board, payload.id, "open"); // pi did not get it: the buttons come back
      throw e;
    }
  };

  const body = (req: IncomingMessage) => new Promise<any>((ok, no) => {
    let s = "";
    req.on("data", (d) => (s += d)).on("end", () => { try { ok(JSON.parse(s || "{}")); } catch (e) { no(e); } });
  });
  const reply = (res: ServerResponse, code: number, type: string, data: string | Buffer, extra: Record<string, string> = {}) => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store", ...extra });
    res.end(data);
  };
  const json = (res: ServerResponse, data: unknown) => reply(res, 200, "application/json", JSON.stringify(data));
  const notFound = (res: ServerResponse) => reply(res, 404, "text/plain", "not found");

  // A board page: design-system variables and the point script added, and no network.
  const board = (res: ServerResponse, page: string) => {
    const origin = `http://127.0.0.1:${port}`;
    const inject = `<link rel="stylesheet" href="${base}/ds/tokens.css"><script>${POINT_SCRIPT}</script>`;
    const html = /<\/head>/i.test(page) ? page.replace(/<\/head>/i, () => inject + "</head>") : inject + page;
    const csp = `default-src 'none'; style-src 'unsafe-inline' ${origin}; script-src 'unsafe-inline'; img-src ${origin} data:; font-src ${origin} data:; form-action 'none'`;
    return reply(res, 200, "text/html", html, { "content-security-policy": csp });
  };

  const route = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.host !== `127.0.0.1:${port}`) return reply(res, 403, "text/plain", "bad host");
    const url = new URL(req.url ?? "/", "http://x");
    const [, urlToken, ...segments] = url.pathname.split("/").map(decodeURIComponent);
    if (urlToken !== token) return notFound(res);
    if (segments[0] === "events") return listen(req, res);
    if (segments[0] === "canvases.json") return json(res, await canvasTabs(root));
    if (segments[0] === "ds" && segments[1] === "tokens.css") return reply(res, 200, "text/css", await tokensCss(ds));
    if (segments[0] === "api" && req.method === "POST") return apiRoute(segments.slice(1).join("/"), await body(req), res);
    if (segments[0] === "c" && segments[1]) return canvasRoute(slug(segments[1]), segments.slice(2), url, res);
    return notFound(res);
  };

  // Server-sent events: the page hears about each changed file.
  const listen = (req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
    res.write(": ok\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  };

  /** A command from the page. It replies {} when it worked. A bad request throws, and the reply is 400. */
  const apiRoute = async (action: string, payload: any, res: ServerResponse) => {
    slug(payload.canvas);
    switch (action) {
      case "note":
        await addNote(root, payload.canvas, payload.note);
        if (payload.send) await sendNotesAndMarkSent(payload.canvas, [payload.note.id]);
        break;
      case "send": await sendNotesAndMarkSent(payload.canvas, payload.ids); break;
      case "state":
        if (!["open", "sent", "work", "done"].includes(payload.state)) return notFound(res);
        await setNoteState(root, payload.canvas, payload.ids, payload.state as NoteState);
        break;
      case "build": {
        const pack = await designPack(root, payload.canvas, ds);
        await (onBuild ? onBuild(payload.canvas, pack) : onSend(pack.text));
        break;
      }
      case "ask":
        if (typeof payload.text !== "string" || !payload.text.trim()) throw new Error("Nothing to ask");
        await onSend(payload.text.slice(0, MAX_ASK));
        break;
      case "compare": await sendDecision(payload); break;
      case "restore": await restoreRev(root, payload.canvas, payload.board, payload.rev); break;
      case "approve": await approve(root, payload.canvas, payload.board); break;
      case "edit": await patchBoard(root, payload); break;
      case "undo": await undoBoard(root, payload.canvas, payload.board, payload.edit); break;
      case "addboard":
        await onSend(`Add a board “${String(payload.name).slice(0, 40)}” (${slug(String(payload.name))}.html) to canvas "${payload.canvas}": “${String(payload.from).slice(0, 40)}” links to it. Use canvas_create.`);
        break;
      case "custom": {
        const title = (await readCanvas(root, payload.canvas)).boards[boardKey(payload.board)]?.title ?? payload.board;
        await onSend(`On board ${title}, element “${String(payload.text).slice(0, 60)}” (tid ${Number(payload.tid)}): I need a custom value for ${String(payload.prop).slice(0, 40)}. Add it to the design system as a token, then use it.`);
        break;
      }
      case "ds/update":
        await onSend("Update the design system from code. Read the theme file (for example src/theme.ts, or the paths in `source` of .tenon/design-system/tokens.json), then call design_system_propose with the full tokens.json. Do not write tokens.json yourself: I review your proposal first.");
        break;
      case "ds/accept": await acceptProposal(ds); break;
      case "ds/discard": await discardProposal(ds); break;
      default: return notFound(res);
    }
    return json(res, {});
  };

  /** A read of one canvas: the viewer page, its JSON, a board, history, an image. */
  const canvasRoute = async (canvas: string, [part, file, ...more]: string[], url: URL, res: ServerResponse) => {
    const dir = canvasDir(root, canvas);
    if (!part) return reply(res, 200, "text/html", VIEWER.replace("__BASE__", base).replace("__CANVAS__", canvas));
    if (part === "ds.json") return json(res, await dsReport(root, canvas, ds));
    if (part === "compare.json") return json(res, await readCompares(root, canvas));
    if (part === "compare" && /^[\w-]+\.(png|jpe?g|webp)$/i.test(file ?? ""))
      return reply(res, 200, TYPES[extname(file).toLowerCase()] ?? "image/png", await readFile(join(dir, "compare", file)));
    if (part === "flow.json") return json(res, await readFlow(root, canvas));
    if (part === "history" && /^[\w-]+\.r\d+\.html$/.test(file ?? "")) return board(res, await readFile(join(dir, "history", file), "utf8"));
    if (part === "history.json") return json(res, await readHistory(root, canvas, url.searchParams.get("board") ?? ""));
    if (part === "canvas.json") return reply(res, 200, "application/json", await readFile(join(dir, "canvas.json")));
    if (part === "boards" && file) return board(res, await readFile(join(dir, boardKey(file)), "utf8"));
    if (part === "assets" && file) {
      const name = [file, ...more].join("/");
      if (name.includes("..")) return reply(res, 400, "text/plain", "bad path");
      return reply(res, 200, TYPES[extname(name).toLowerCase()] ?? "application/octet-stream", await readFile(join(dir, "assets", name)));
    }
    return notFound(res);
  };

  const server = createServer((req, res) => {
    route(req, res).catch((e) => reply(res, 400, "text/plain", String(e?.message ?? e)));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as AddressInfo).port;

  return {
    url: (canvas) => `http://127.0.0.1:${port}${base}/c/${slug(canvas)}`,
    close() {
      watcher.close();
      timers.forEach(clearTimeout);
      for (const r of clients) r.end();
      clients.clear();
      server.close();
      server.closeAllConnections?.();
    },
  };
}

export type FileEvent =
  | { type: "board-changed"; canvas: string; board: string }
  | { type: "canvas-changed"; canvas: string }
  | { type: "tokens-changed" }
  | { type: "ds-changed" };

/** The page event for a changed file (its path parts under the project's .tenon/), or undefined for a file the page does not show. */
export function fileEvent([area, item, part, file]: string[]): FileEvent | undefined {
  if (area === "canvases" && part === "boards") return { type: "board-changed", canvas: item, board: `boards/${file}` };
  if (area === "canvases" && (part === "canvas.json" || part === "compare")) return { type: "canvas-changed", canvas: item }; // compare: a comparison from pi
  if (area === "design-system" && item === "tokens.json") return { type: "tokens-changed" };
  if (area === "design-system" && item === "tokens.proposed.json") return { type: "ds-changed" };
  return undefined;
}
