// Files are the truth. Everything here reads and writes `.tau/canvases/<slug>/`.
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type Target = { tid: string; text: string; box: number[] };
export type NoteState = "open" | "sent" | "work" | "done";
export type Note = { board: string; target: Target; text: string; state: NoteState; by: string; at: string };
export type BoardMeta = {
  title: string; x: number; y: number; w: number; h: number; rev: number; by: string; approved?: number;
};
export type Canvas = {
  v: 1; title: string; designSystem: string;
  boards: Record<string, BoardMeta>; order: string[]; notes: Record<string, Note>;
};

const NAME = /^[A-Za-z0-9][\w-]*$/;
export const slug = (s: string) => {
  if (!NAME.test(s)) throw new Error(`Bad name "${s}": use letters, digits, - and _`);
  return s;
};
/** "cart", "cart.html" and "boards/cart.html" all give "boards/cart.html". */
export const boardKey = (b: string) => `boards/${slug(b.replace(/^boards\//, "").replace(/\.html$/, ""))}.html`;
const nameOf = (key: string) => key.slice(7, -5);
export const canvasDir = (root: string, canvas: string) => join(root, slug(canvas));
export const RAW_BOARD = /\.tau\/canvases\/[^/]+\/boards\/[^/]+\.html$/;

// One read-modify-write at a time per canvas.
const tails = new Map<string, Promise<unknown>>();
function locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (tails.get(key) ?? Promise.resolve()).then(fn);
  tails.set(key, run.catch(() => {}));
  return run;
}

const SKIP = /^(html|head|meta|link|title|script|style|base)$/i;
/** Give every element a stable data-tid. Existing tids stay. ponytail: regex, not a parser; a ">" inside an attribute value breaks it. */
export function stamp(html: string): string {
  let n = Math.max(0, ...[...html.matchAll(/data-tid="(\d+)"/g)].map((m) => +m[1]));
  return html.replace(/<([a-zA-Z][\w-]*)((?:\s[^<>]*?)?)(\/?)>/g, (m, tag, attrs, slash) =>
    SKIP.test(tag) || /\sdata-tid=/.test(attrs) ? m : `<${tag}${attrs} data-tid="${++n}"${slash}>`);
}

export async function readCanvas(root: string, canvas: string): Promise<Canvas> {
  try {
    return JSON.parse(await readFile(join(canvasDir(root, canvas), "canvas.json"), "utf8"));
  } catch {
    throw new Error(`Canvas "${canvas}" not found`);
  }
}

export async function listCanvases(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const dirs = await readdir(root, { withFileTypes: true });
  return dirs.filter((d) => d.isDirectory() && existsSync(join(root, d.name, "canvas.json"))).map((d) => d.name);
}

async function save(dir: string, c: Canvas, key: string, html: string, by: string, why: string) {
  const m = c.boards[key];
  const rev = m.rev + 1;
  const out = stamp(html);
  await mkdir(join(dir, "boards"), { recursive: true });
  await mkdir(join(dir, "history"), { recursive: true });
  await writeFile(join(dir, key), out);
  await writeFile(join(dir, "history", `${nameOf(key)}.r${rev}.html`), out);
  await appendFile(join(dir, "history", "log.jsonl"),
    JSON.stringify({ board: key, rev, by, at: new Date().toISOString(), why }) + "\n");
  Object.assign(m, { rev, by });
  await writeFile(join(dir, "canvas.json"), JSON.stringify(c, null, 2));
  return rev;
}

export async function createBoard(root: string, a: {
  canvas: string; board: string; title: string; w: number; h: number; html: string; canvasTitle?: string;
}) {
  const dir = canvasDir(root, a.canvas);
  return locked(dir, async () => {
    const key = boardKey(a.board);
    let c: Canvas | undefined = existsSync(join(dir, "canvas.json")) ? await readCanvas(root, a.canvas) : undefined;
    const isNew = !c;
    c ??= { v: 1, title: a.canvasTitle ?? a.canvas, designSystem: "../../design-system", boards: {}, order: [], notes: {} };
    if (c.boards[key]) throw new Error(`Board ${key} exists at rev ${c.boards[key].rev}. Use canvas_edit.`);
    const x = Object.values(c.boards).reduce((m, b) => Math.max(m, b.x + b.w + 80), 0);
    c.boards[key] = { title: a.title, x, y: 0, w: a.w, h: a.h, rev: 0, by: "pi" };
    c.order.push(key);
    return { rev: await save(dir, c, key, a.html, "pi", "created"), isNew };
  });
}

export async function readBoard(root: string, canvas: string, board: string) {
  const key = boardKey(board);
  const m = (await readCanvas(root, canvas)).boards[key];
  if (!m) throw new Error(`Board ${key} not found`);
  return { ...m, html: await readFile(join(canvasDir(root, canvas), key), "utf8") };
}

/** The write guard: fails when the board moved on since `baseRev`. */
export async function editBoard(root: string, a: {
  canvas: string; board: string; baseRev: number; html?: string;
  edits?: { find: string; replace: string }[]; by?: string; why?: string;
}) {
  const dir = canvasDir(root, a.canvas);
  return locked(dir, async () => {
    const c = await readCanvas(root, a.canvas);
    const key = boardKey(a.board);
    const m = c.boards[key];
    if (!m) throw new Error(`Board ${key} not found`);
    if (m.rev !== a.baseRev)
      throw new Error(`Board changed by ${m.by} at rev ${m.rev} (you had rev ${a.baseRev}). Read it again with canvas_read and redo your change.`);
    let html = a.html;
    if (html == null) {
      if (!a.edits?.length) throw new Error("Give html or edits");
      html = await readFile(join(dir, key), "utf8");
      for (const e of a.edits) {
        const n = html.split(e.find).length - 1;
        if (n !== 1) throw new Error(`"${e.find.slice(0, 40)}" found ${n} times; it must be found exactly once`);
        html = html.replace(e.find, () => e.replace);
      }
    }
    return { rev: await save(dir, c, key, html, a.by ?? "pi", a.why ?? "") };
  });
}

export async function addNote(root: string, canvas: string, n: { board: string; target: Target; text: string }) {
  return locked(canvasDir(root, canvas), async () => {
    const c = await readCanvas(root, canvas);
    const board = boardKey(n.board);
    if (!c.boards[board]) throw new Error(`Board ${board} not found`);
    const id = "n" + (Math.max(0, ...Object.keys(c.notes).map((k) => +k.slice(1))) + 1);
    c.notes[id] = { board, target: n.target, text: n.text, state: "open", by: "you", at: new Date().toISOString() };
    await writeFile(join(canvasDir(root, canvas), "canvas.json"), JSON.stringify(c, null, 2));
    return id;
  });
}

/** Only notes change here. `approved` has no setter on purpose: only a person sets it. */
export async function setNoteState(root: string, canvas: string, ids: string[], state: NoteState) {
  return locked(canvasDir(root, canvas), async () => {
    const c = await readCanvas(root, canvas);
    for (const id of ids) if (c.notes[id]) c.notes[id].state = state;
    await writeFile(join(canvasDir(root, canvas), "canvas.json"), JSON.stringify(c, null, 2));
  });
}

/** tokens.json -> CSS variables. Writes tokens.css only when it changed (the watcher would loop otherwise). */
export async function tokensCss(ds: string): Promise<string> {
  let t: any;
  try { t = JSON.parse(await readFile(join(ds, "tokens.json"), "utf8")); } catch { return ""; }
  const v: string[] = [];
  for (const g of ["color", "spacing", "radius"]) for (const k of t[g]?.tokens ?? []) v.push(`--${k.name}: ${k.value};`);
  for (const [k, val] of Object.entries(t.type?.families ?? {})) v.push(`--font-${k}: ${val};`);
  for (const s of t.type?.styles ?? [])
    v.push(`--${s.name}-font-size: ${s.fontSize};`, `--${s.name}-line-height: ${s.lineHeight};`, `--${s.name}-font-weight: ${s.fontWeight};`);
  const css = `:root {\n  ${v.join("\n  ")}\n}\n`;
  const old = await readFile(join(ds, "tokens.css"), "utf8").catch(() => "");
  if (old !== css) await writeFile(join(ds, "tokens.css"), css);
  return css;
}

/** Keep history/ out of git. Returns true when it changed the file. */
export async function ensureGitignore(project: string): Promise<boolean> {
  if (!existsSync(join(project, ".git"))) return false;
  const f = join(project, ".gitignore");
  const cur = await readFile(f, "utf8").catch(() => "");
  const line = ".tau/canvases/*/history/";
  if (cur.split("\n").includes(line)) return false;
  await writeFile(f, cur + (cur && !cur.endsWith("\n") ? "\n" : "") + line + "\n");
  return true;
}
