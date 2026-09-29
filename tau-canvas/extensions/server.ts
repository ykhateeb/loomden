// Local server: 127.0.0.1 only, random port, private token as the first path segment.
// Server-sent events carry file changes to the page (one-way, so no ws dependency).
// ponytail: SSE + POST instead of WebSocket; switch if the page ever needs a fast two-way channel.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { watch, mkdirSync } from "node:fs";
import { dirname, extname, join, sep } from "node:path";
import { acceptProposal, addNote, boardKey, canvasDir, canvasTabs, discardProposal, dsReport, readCanvas, setNoteState, slug, tokensCss, type NoteState } from "./store.js";
import { POINT_SCRIPT, VIEWER } from "./web.js";

const TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};

export type CanvasServer = { url: (canvas: string) => string; close: () => void };

export async function startServer(o: { root: string; onSend: (text: string) => void }): Promise<CanvasServer> {
  const token = randomBytes(16).toString("hex");
  const ds = join(dirname(o.root), "design-system");
  const clients = new Set<ServerResponse>();
  const emit = (e: object) => { for (const r of clients) r.write(`data: ${JSON.stringify(e)}\n\n`); };

  mkdirSync(o.root, { recursive: true });
  const timers = new Map<string, NodeJS.Timeout>();
  const watcher = watch(dirname(o.root), { recursive: true }, (_ev, f) => {
    if (!f) return;
    const p = f.toString().split(sep);
    let ev: object | undefined;
    if (p[0] === "canvases" && p[2] === "boards") ev = { type: "board-changed", canvas: p[1], board: `boards/${p[3]}` };
    else if (p[0] === "canvases" && p[2] === "canvas.json") ev = { type: "canvas-changed", canvas: p[1] };
    else if (p[0] === "design-system" && p[1] === "tokens.json") ev = { type: "tokens-changed" };
    else if (p[0] === "design-system" && p[1] === "tokens.proposed.json") ev = { type: "ds-changed" };
    if (!ev) return; // history/, tokens.css and the rest are ignored
    clearTimeout(timers.get(f.toString()));
    timers.set(f.toString(), setTimeout(() => emit(ev!), 60));
  });

  const send = async (canvas: string, ids: string[]) => {
    const c = await readCanvas(o.root, canvas);
    const lines = ids.filter((id) => c.notes[id]).map((id) => {
      const n = c.notes[id];
      return `On board ${c.boards[n.board]?.title ?? n.board}, element “${n.target.text}” (tid ${n.target.tid}): ${n.text}`;
    });
    if (!lines.length) return;
    await setNoteState(o.root, canvas, ids, "sent");
    o.onSend(lines.length > 1 ? `Design notes on canvas "${canvas}":\n${lines.join("\n")}` : lines[0]);
  };

  const body = (req: IncomingMessage) => new Promise<any>((ok, no) => {
    let s = "";
    req.on("data", (d) => (s += d)).on("end", () => { try { ok(JSON.parse(s || "{}")); } catch (e) { no(e); } });
  });
  const reply = (res: ServerResponse, code: number, type: string, data: string | Buffer, extra: Record<string, string> = {}) => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store", ...extra });
    res.end(data);
  };

  const route = async (req: IncomingMessage, res: ServerResponse) => {
    const port = (server.address() as any).port;
    if (req.headers.host !== `127.0.0.1:${port}`) return reply(res, 403, "text/plain", "bad host");
    const url = new URL(req.url ?? "/", "http://x");
    const [, t, ...p] = url.pathname.split("/").map(decodeURIComponent);
    if (t !== token) return reply(res, 404, "text/plain", "not found");
    const base = `/${token}`;

    if (p[0] === "events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
      res.write(": ok\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (p[0] === "canvases.json") return reply(res, 200, "application/json", JSON.stringify(await canvasTabs(o.root)));
    if (p[0] === "ds" && p[1] === "tokens.css") return reply(res, 200, "text/css", await tokensCss(ds));
    if (p[0] === "api" && req.method === "POST") {
      const b = await body(req);
      slug(b.canvas);
      if (p[1] === "note") {
        const id = await addNote(o.root, b.canvas, b.note);
        if (b.send) await send(b.canvas, [id]);
        return reply(res, 200, "application/json", JSON.stringify({ id }));
      }
      if (p[1] === "ds" && p[2] === "update") {
        o.onSend("Update the design system from code. Read the theme file (for example src/theme.ts, or the paths in `source` of .tau/design-system/tokens.json), then call design_system_propose with the full tokens.json. Do not write tokens.json yourself: I review your proposal first.");
      } else if (p[1] === "ds" && p[2] === "accept") await acceptProposal(ds);
      else if (p[1] === "ds" && p[2] === "discard") await discardProposal(ds);
      else if (p[1] === "send") await send(b.canvas, b.ids);
      else if (p[1] === "state" && ["open", "sent", "work", "done"].includes(b.state))
        await setNoteState(o.root, b.canvas, b.ids, b.state as NoteState);
      else return reply(res, 404, "text/plain", "not found");
      return reply(res, 200, "application/json", "{}");
    }
    if (p[0] !== "c" || !p[1]) return reply(res, 404, "text/plain", "not found");
    const canvas = slug(p[1]);
    const dir = canvasDir(o.root, canvas);

    if (p.length === 2) return reply(res, 200, "text/html", VIEWER.replace("__BASE__", base).replace("__CANVAS__", canvas));
    if (p[2] === "ds.json") return reply(res, 200, "application/json", JSON.stringify(await dsReport(o.root, canvas, ds)));
    if (p[2] === "canvas.json") return reply(res, 200, "application/json", await readFile(join(dir, "canvas.json")));
    if (p[2] === "boards" && p[3]) {
      let html = await readFile(join(dir, boardKey(p[3])), "utf8");
      const inject = `<link rel="stylesheet" href="${base}/ds/tokens.css"><script>${POINT_SCRIPT}</script>`;
      html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, () => inject + "</head>") : inject + html;
      const origin = `http://127.0.0.1:${port}`;
      // No network from a board: only this server for images, fonts and the token file.
      const csp = `default-src 'none'; style-src 'unsafe-inline' ${origin}; script-src 'unsafe-inline'; img-src ${origin} data:; font-src ${origin} data:; form-action 'none'`;
      return reply(res, 200, "text/html", html, { "content-security-policy": csp });
    }
    if (p[2] === "assets" && p.length > 3) {
      const name = p.slice(3).join("/");
      if (name.includes("..")) return reply(res, 400, "text/plain", "bad path");
      return reply(res, 200, TYPES[extname(name).toLowerCase()] ?? "application/octet-stream", await readFile(join(dir, "assets", name)));
    }
    return reply(res, 404, "text/plain", "not found");
  };

  const server = createServer((req, res) => {
    route(req, res).catch((e) => reply(res, 400, "text/plain", String(e?.message ?? e)));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as any).port;

  return {
    url: (canvas) => `http://127.0.0.1:${port}/${token}/c/${slug(canvas)}`,
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
