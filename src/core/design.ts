// The Design page (board C1): the canvases of a project, from any session.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { startServer, type CanvasServer } from "#canvas/server";
import { designSystemDir, listCanvases, projectRoot, readCanvas, readHistory, type Canvas } from "#canvas/store";
import { readTokens } from "#canvas/tokens";
import type { DesignCanvas, DesignList } from "#protocol";

export async function designList(cwd: string): Promise<DesignList> {
  const root = projectRoot(cwd);
  const canvases: DesignCanvas[] = [];
  for (const slug of await listCanvases(root)) {
    try {
      const canvas = await readCanvas(root, slug);
      const dir = join(root, slug);
      const revs = existsSync(join(dir, "history")) ? readdirSync(join(dir, "history")).filter((f) => f.endsWith(".html")).length : 0;
      const images = existsSync(join(dir, "assets")) ? readdirSync(join(dir, "assets")).length : 0;
      const times = (await Promise.all(canvas.order.map((k) => readHistory(root, slug, k)))).flat().map((e) => Date.parse(e.at));
      canvases.push(canvasSummary(canvas, { slug, revs, images, times }));
    } catch {
      // one unreadable canvas must not hide the others
    }
  }
  canvases.sort((a, b) => b.updated - a.updated);
  const system: string | undefined = (await readTokens(designSystemDir(root)))?.name; // undefined: no design system yet
  return { canvases, system };
}

/** The row of one canvas on the Design page. `times` are the board history times, in ms (NaN when unreadable). */
export function canvasSummary(canvas: Canvas, { slug, revs, images, times }: { slug: string; revs: number; images: number; times: number[] }): DesignCanvas {
  const boards = canvas.order.filter((k) => canvas.boards[k]).map((k) => ({ title: canvas.boards[k].title, rev: canvas.boards[k].rev, approved: canvas.boards[k].approved }));
  const all = boards.length > 0 && boards.every((b) => b.approved === b.rev);
  return {
    slug, title: canvas.title, boards, revs, images,
    updated: Math.max(0, ...times.filter(Boolean)),
    openNotes: Object.values(canvas.notes).filter((n) => n.state !== "done").length,
    status: all ? "approved" : boards.some((b) => b.approved) ? "review" : "draft",
  };
}

// One server for each project the Design page opened. Notes go to the session that opened it.
// ponytail: module state, one copy per agent process; a factory when tests need a clean copy.
const servers = new Map<string, { server: CanvasServer; key?: string }>();

type DesignTarget = { cwd: string; canvas: string; tab?: "ds" };
type DesignHost = {
  prompt: (key: string, text: string) => Promise<void>;
  build: (cwd: string, pack: { title: string; text: string }) => void;
};

/** Start the server of a project, if it is not running. Notes go to the session `key`. */
export async function designOpen({ cwd, key }: { cwd: string; key?: string }, { prompt, build }: DesignHost) {
  let s = servers.get(cwd);
  if (!s) {
    if (!servers.size) process.once("exit", stopDesign);
    const entry: { server: CanvasServer; key?: string } = { key, server: undefined as never };
    entry.server = await startServer({
      root: projectRoot(cwd),
      onBuild: (_c, pack) => build(cwd, pack),
      onSend: (t) => {
        if (!entry.key) throw new Error("Open a session in this project to send notes to pi");
        return prompt(entry.key, t); // a failed prompt reaches the viewer, and the notes stay unsent
      },
    });
    servers.set(cwd, (s = entry));
  }
  s.key = key;
}

/** The address of one canvas. designOpen() starts the server first. */
export function designUrl({ cwd, canvas, tab }: DesignTarget) {
  const s = servers.get(cwd);
  if (!s) throw new Error("The design server of this project is not running");
  return s.server.url(canvas) + (tab ? "?tab=ds" : "");
}

export function stopDesign() {
  for (const { server } of servers.values()) server.close();
  servers.clear();
}
