// Files are the truth. Everything here reads and writes `.tenon/canvases/<slug>/`.
import { appendFile, copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";

export type Target = { tid: string; text: string; box: number[] };
export type NoteState = "open" | "sent" | "work" | "done";
export type Note = { board: string; target: Target; text: string; state: NoteState; by: string; at: string };
export type BoardMeta = {
  title: string; x: number; y: number; w: number; h: number; rev: number; by: string; at?: string; approved?: number;
};
export type Canvas = {
  v: 1; title: string; designSystem: string;
  boards: Record<string, BoardMeta>; order: string[]; notes: Record<string, Note>;
  /** Boards pi says it will make (board C4): the canvas shows a place for each until it exists. */
  plan?: { key: string; title: string; w: number; h: number }[];
  /** Boards pi is writing or editing right now. */
  editing?: string[];
};

const NAME = /^[A-Za-z0-9][\w-]*$/;
export const slug = (s: string) => {
  if (!NAME.test(s)) throw new Error(`Bad name "${s}": use letters, digits, - and _`);
  return s;
};
/** "cart", "cart.html" and "boards/cart.html" all give "boards/cart.html". */
export const boardKey = (b: string) => `boards/${slug(b.replace(/^boards\//, "").replace(/\.html$/, ""))}.html`;
const BOARD_DIR = "boards/";
const BOARD_EXT = ".html";
/** "boards/cart.html" gives "cart". */
const nameOf = (key: string) => key.slice(BOARD_DIR.length, -BOARD_EXT.length);
export const canvasDir = (root: string, canvas: string) => join(root, slug(canvas));
export const RAW_BOARD = /(?:\.tenon|\/sessions\/[^/]+)\/canvases\/[^/]+\/boards\/[^/]+\.html$/;
/** canvas.json (it holds approvals), approved/ and history/ change only through the tools and the viewer. */
export const RAW_STATE = /(?:\.tenon|\/sessions\/[^/]+)\/canvases\/[^/]+\/(canvas\.json|approved\/.+|history\/.+)$/;

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

/** A phone screen: the size of a planned board that has no size. */
const PHONE = { w: 390, h: 844 };

const canvasFile = (dir: string) => join(dir, "canvas.json");
const writeCanvas = (dir: string, c: Canvas) => writeFile(canvasFile(dir), JSON.stringify(c, null, 2));
const emptyCanvas = (title: string): Canvas => ({ v: 1, title, designSystem: "../../design-system", boards: {}, order: [], notes: {} });

/** The key and the meta of a board. Throws if the canvas has no such board. */
function boardOf(c: Canvas, board: string) {
  const key = boardKey(board);
  const meta = c.boards[key];
  if (!meta) throw new Error(`Board ${key} not found`);
  return { key, meta };
}

export async function readCanvas(root: string, canvas: string): Promise<Canvas> {
  try {
    return JSON.parse(await readFile(canvasFile(canvasDir(root, canvas)), "utf8"));
  } catch {
    throw new Error(`Canvas "${canvas}" not found`);
  }
}

/** True when the canvas has its canvas.json. */
export const canvasExists = (root: string, canvas: string) => existsSync(canvasFile(canvasDir(root, canvas)));

export async function listCanvases(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const dirs = await readdir(root, { withFileTypes: true });
  return dirs.filter((d) => d.isDirectory() && existsSync(canvasFile(join(root, d.name)))).map((d) => d.name);
}

async function save(dir: string, c: Canvas, key: string, html: string, by: string, why: string, extra: object = {}) {
  const m = c.boards[key];
  const rev = m.rev + 1;
  const out = stamp(html);
  await mkdir(join(dir, "boards"), { recursive: true });
  await mkdir(join(dir, "history"), { recursive: true });
  await writeFile(join(dir, key), out);
  await writeFile(join(dir, "history", `${nameOf(key)}.r${rev}.html`), out);
  await appendFile(join(dir, "history", "log.jsonl"),
    JSON.stringify({ board: key, rev, by, at: new Date().toISOString(), why, ...extra }) + "\n");
  Object.assign(m, { rev, by, at: new Date().toISOString() });
  await writeCanvas(dir, c);
}

/** An id that the viewer page makes for a note or an edit. */
const PAGE_ID = /^[\w-]{1,40}$/;

/** A new board is always rev 1. Makes the canvas if needed. */
export async function createBoard(root: string, a: {
  canvas: string; board: string; title: string; w: number; h: number; html: string; canvasTitle?: string;
}) {
  const dir = canvasDir(root, a.canvas);
  await locked(dir, async () => {
    const key = boardKey(a.board);
    const c = existsSync(canvasFile(dir)) ? await readCanvas(root, a.canvas) : emptyCanvas(a.canvasTitle ?? a.canvas);
    if (c.boards[key]) throw new Error(`Board ${key} exists at rev ${c.boards[key].rev}. Use canvas_edit.`);
    const x = Object.values(c.boards).reduce((m, b) => Math.max(m, b.x + b.w + 80), 0);
    c.boards[key] = { title: a.title, x, y: 0, w: a.w, h: a.h, rev: 0, by: "pi" };
    c.order.push(key);
    c.plan = c.plan?.filter((p) => p.key !== key); // it exists now
    c.editing = c.editing?.filter((k) => k !== key);
    await save(dir, c, key, a.html, "pi", "created");
  });
}

export async function readBoard(root: string, canvas: string, board: string) {
  const { key, meta } = boardOf(await readCanvas(root, canvas), board);
  return { ...meta, html: await readFile(join(canvasDir(root, canvas), key), "utf8") };
}

/** The write guard: fails when the board moved on since `baseRev`. So the new rev is always `baseRev + 1`. */
export async function editBoard(root: string, a: {
  canvas: string; board: string; baseRev: number; html?: string;
  edits?: { find: string; replace: string }[]; by?: string; why?: string;
}) {
  const dir = canvasDir(root, a.canvas);
  await locked(dir, async () => {
    const c = await readCanvas(root, a.canvas);
    const { key, meta: m } = boardOf(c, a.board);
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
    await save(dir, c, key, html, a.by ?? "pi", a.why ?? "");
  });
}

const STYLE_PROPS = new Set(["color", "margin-top", "padding", "font-size", "line-height", "font-weight"]);
const TOKEN_VALUE = /^var\(--[A-Za-z0-9][\w-]*\)$/;
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Your edit in edit mode: the text of one element, or design-system values for its style. Saved as a rev by "you".
 * `id` comes from the page and goes in the history log, so the page can undo this edit by its id.
 */
export async function patchBoard(root: string, a: {
  canvas: string; board: string; id: string; tid: string; text?: string; style?: Record<string, string>; tell?: boolean;
}) {
  const dir = canvasDir(root, a.canvas);
  if (!PAGE_ID.test(a.id)) throw new Error("Bad edit id");
  if (!/^\d+$/.test(a.tid)) throw new Error("Bad tid");
  for (const [k, v] of Object.entries(a.style ?? {}))
    if (!STYLE_PROPS.has(k) || !TOKEN_VALUE.test(v)) throw new Error(`Only design-system values: ${k}: ${v}`);
  if (a.text != null && a.text.length > 500) throw new Error("Text is too long");
  await locked(dir, async () => {
    const c = await readCanvas(root, a.canvas);
    const { key } = boardOf(c, a.board);
    const { html, why } = patchHtml(await readFile(join(dir, key), "utf8"), a);
    await save(dir, c, key, html, "you", why, { edit: a.id, ...(a.tell === false ? { quiet: true } : {}) });
  });
}

/** The board HTML with one element changed: its own text, or its style. `why` says what changed, for the history log. */
export function patchHtml(html: string, p: { tid: string; text?: string; style?: Record<string, string> }) {
  const at = html.indexOf(`data-tid="${p.tid}"`);
  if (at < 0) throw new Error(`Element ${p.tid} not found: the board changed`);
  const start = html.lastIndexOf("<", at);
  const end = html.indexOf(">", at);
  const tag = html.slice(start, end + 1);
  const rest = html.slice(end + 1);
  const changed = p.text != null ? withOwnText(tag, rest, p.text) : withStyle(tag, rest, p.style ?? {});
  const why = p.text != null ? changed.why : `${changed.why} of element ${p.tid}`;
  return { html: html.slice(0, start) + changed.tag + changed.rest, why };
}

/** Replace the text right after the tag (the element's own text, before its first child). */
function withOwnText(tag: string, rest: string, text: string) {
  const lead = rest.slice(0, Math.max(0, rest.indexOf("<")));
  if (tag.endsWith("/>") || !lead.trim()) throw new Error("This element has no text of its own");
  const ws = lead.match(/^\s*/)![0], tw = lead.match(/\s*$/)![0];
  const why = `text “${lead.trim().slice(0, 30)}” → “${text.slice(0, 30)}”`;
  return { tag, rest: ws + esc(text) + tw + rest.slice(lead.length), why };
}

/** Merge `style` into the tag's style attribute. */
function withStyle(tag: string, rest: string, style: Record<string, string>) {
  const decls = new Map<string, string>();
  const m = tag.match(/\sstyle="([^"]*)"/);
  for (const d of (m?.[1] ?? "").split(";")) {
    const i = d.indexOf(":");
    if (i > 0) decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
  }
  for (const [k, v] of Object.entries(style)) decls.set(k, v);
  const attr = ` style="${[...decls].map(([k, v]) => `${k}: ${v}`).join("; ")}"`;
  const styled = m ? tag.replace(m[0], attr) : tag.replace(/\s*(\/?)>$/, `${attr}$1>`);
  return { tag: styled, rest, why: Object.keys(style).join(", ") };
}

/** Undo your edit `edit` (its id from patchBoard): the content before it comes back as a new rev. Only while nothing else changed the board. */
export async function undoBoard(root: string, canvas: string, board: string, edit: string) {
  const dir = canvasDir(root, canvas);
  await locked(dir, async () => {
    const c = await readCanvas(root, canvas);
    const key = boardKey(board);
    const m = c.boards[key];
    const e = (await readHistory(root, canvas, board)).find((x) => x.edit === edit);
    const undoable = m && e && m.rev === e.rev && e.rev > 1; // your edit is still the last change, and there is a rev before it
    if (!undoable) throw new Error("The board changed since: nothing to undo");
    const html = await readFile(join(dir, "history", `${nameOf(key)}.r${e.rev - 1}.html`), "utf8");
    // pi hears about the undo if it heard about the edit; a quiet edit is undone quietly.
    await save(dir, c, key, html, "you", `undo rev ${e.rev}`, e.quiet ? { quiet: true } : {});
  });
}

/** The revs of one board, newest first. */
export async function readHistory(root: string, canvas: string, board: string) {
  const key = boardKey(board);
  const log = await readFile(join(canvasDir(root, canvas), "history", "log.jsonl"), "utf8").catch(() => "");
  return log.split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.board === key).reverse();
}

/** Board C3: a free name for a canvas, from what you are designing. A taken name gets -2, -3… */
export function freeCanvasName(root: string, title: string) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "canvas";
  let name = base;
  for (let n = 2; existsSync(join(root, name)); n++) name = `${base}-${n}`;
  return name;
}

/** An empty canvas. Get a free `name` with freeCanvasName(). */
export async function createCanvas(root: string, { name, title }: { name: string; title: string }) {
  await locked(canvasDir(root, name), async () => {
    await mkdir(root, { recursive: true });
    await mkdir(join(root, name)); // fails if the name was taken in the meantime
    await writeCanvas(join(root, name), emptyCanvas(title));
  });
}

/** Board C4: pi lists the boards it will make, so the canvas shows a place for each (`plan`). Makes the canvas if needed. */
export async function planBoards(root: string, canvas: string, boards: { board: string; title: string; w?: number; h?: number }[], title?: string) {
  const dir = canvasDir(root, canvas);
  await locked(dir, async () => {
    const c = existsSync(canvasFile(dir)) ? await readCanvas(root, canvas) : emptyCanvas(title ?? canvas);
    c.plan = boards.map((b) => ({ key: boardKey(b.board), title: b.title, w: b.w ?? PHONE.w, h: b.h ?? PHONE.h })).filter((p) => !c.boards[p.key]);
    await mkdir(dir, { recursive: true });
    await writeCanvas(dir, c);
  });
}

/** Board C6: "pi is writing" or "pi is editing" shows on a board while a tool works on it. */
export function markEditing(root: string, canvas: string, board: string) {
  return changeCanvas(root, canvas, (c) => {
    c.editing = [...new Set([...(c.editing ?? []), boardKey(board)])];
    return true;
  });
}

/** The tool is done with the board. */
export function unmarkEditing(root: string, canvas: string, board: string) {
  return changeCanvas(root, canvas, (c) => {
    c.editing = (c.editing ?? []).filter((k) => k !== boardKey(board));
    return true;
  });
}

/** After a crash: nothing is being written. */
export function clearEditing(root: string, canvas: string) {
  return changeCanvas(root, canvas, (c) => {
    if (!c.editing?.length) return false; // nothing to change: no write, no event
    c.editing = [];
    return true;
  });
}

/** After a stopped run: the boards pi never made are no longer planned. */
export function clearPlan(root: string, canvas: string) {
  return changeCanvas(root, canvas, (c) => {
    if (!c.plan?.length) return false; // nothing to change: no write, no event
    c.plan = [];
    return true;
  });
}

/** Read, change and write canvas.json under the lock. `change` returns false when it changed nothing. No canvas: nothing to do. */
async function changeCanvas(root: string, canvas: string, change: (c: Canvas) => boolean) {
  const dir = canvasDir(root, canvas);
  if (!existsSync(canvasFile(dir))) return;
  await locked(dir, async () => {
    const c = await readCanvas(root, canvas);
    if (change(c)) await writeCanvas(dir, c);
  });
}

/** Restore never deletes: the old content is saved as a new rev by you. */
export async function restoreRev(root: string, canvas: string, board: string, rev: number) {
  const dir = canvasDir(root, canvas);
  await locked(dir, async () => {
    const c = await readCanvas(root, canvas);
    const { key } = boardOf(c, board);
    const html = await readFile(join(dir, "history", `${nameOf(key)}.r${Number(rev)}.html`), "utf8").catch(() => {
      throw new Error(`Rev ${rev} not found`);
    });
    await save(dir, c, key, html, "you", `restore rev ${rev}`);
  });
}

/** Only a person approves (the viewer calls this; no pi tool does). The approved rev is copied to approved/. */
export async function approve(root: string, canvas: string, board: string) {
  const dir = canvasDir(root, canvas);
  await locked(dir, async () => {
    const c = await readCanvas(root, canvas);
    const { key, meta: m } = boardOf(c, board);
    await mkdir(join(dir, "approved"), { recursive: true });
    await copyFile(join(dir, key), join(dir, "approved", `${nameOf(key)}.html`));
    m.approved = m.rev;
    await writeCanvas(dir, c);
  });
}

/** Links between boards come from the HTML: <a href="payment.html">. */
export async function flow(root: string, canvas: string) {
  const c = await readCanvas(root, canvas);
  const boards = c.order.filter((k) => c.boards[k]).map((k) => ({ key: k, title: c.boards[k].title, rev: c.boards[k].rev, approved: c.boards[k].approved }));
  const links: { from: string; fromTitle: string; text: string; name: string; to: string | null }[] = [];
  for (const b of boards) {
    const html = await readFile(join(canvasDir(root, canvas), b.key), "utf8").catch(() => "");
    for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([\w-]+)\.html(?:[?#][^"']*)?["'][^>]*>([\s\S]*?)<\/a>/g)) {
      const to = Object.keys(c.boards).find((k) => nameOf(k).toLowerCase() === m[1].toLowerCase()) ?? null; // Pay.html finds pay
      links.push({ from: b.key, fromTitle: b.title, text: m[2].replace(/<[^>]+>/g, "").trim(), name: m[1], to });
    }
  }
  return { boards, links };
}

/** A note by you. `id` comes from the page. */
export async function addNote(root: string, canvas: string, n: { id: string; board: string; target: Target; text: string }) {
  if (!PAGE_ID.test(n.id)) throw new Error("Bad note id");
  await locked(canvasDir(root, canvas), async () => {
    const c = await readCanvas(root, canvas);
    const { key: board } = boardOf(c, n.board);
    if (c.notes[n.id]) throw new Error(`Note ${n.id} exists`);
    c.notes[n.id] = { board, target: n.target, text: n.text, state: "open", by: "you", at: new Date().toISOString() };
    await writeCanvas(canvasDir(root, canvas), c);
  });
}

/** Only notes change here. `approved` has no setter on purpose: only a person sets it. */
export async function setNoteState(root: string, canvas: string, ids: string[], state: NoteState) {
  return locked(canvasDir(root, canvas), async () => {
    const c = await readCanvas(root, canvas);
    for (const id of ids) if (c.notes[id]) c.notes[id].state = state;
    await writeCanvas(canvasDir(root, canvas), c);
  });
}

export type DsItem = { group: string; name: string; value: string; usage?: string; decls: [string, string][] };
/** The tokens as a flat list. `decls` are the CSS variables each one makes. */
export function dsItems(t: any): DsItem[] {
  const out: DsItem[] = [];
  for (const g of ["color", "spacing", "radius"])
    for (const k of t?.[g]?.tokens ?? []) out.push({ group: g, name: k.name, value: String(k.value), usage: k.usage, decls: [[k.name, String(k.value)]] });
  for (const [k, v] of Object.entries(t?.type?.families ?? {}))
    out.push({ group: "type", name: `font-${k}`, value: String(v), decls: [[`font-${k}`, String(v)]] });
  for (const s of t?.type?.styles ?? [])
    out.push({
      group: "type", name: s.name, value: `${s.fontSize}/${s.lineHeight} ${s.fontWeight}`,
      decls: [[`${s.name}-font-size`, s.fontSize], [`${s.name}-line-height`, s.lineHeight], [`${s.name}-font-weight`, String(s.fontWeight)]],
    });
  return out;
}

const readJson = (f: string) => readFile(f, "utf8").then((s) => JSON.parse(s), () => undefined);

/** tokens.json -> CSS variables. "" when there is no tokens.json. */
export async function tokensCss(ds: string): Promise<string> {
  const t = await readJson(join(ds, "tokens.json"));
  if (!t) return "";
  const v = dsItems(t).flatMap((i) => i.decls.map(([n, val]) => `--${n}: ${val};`));
  return `:root {\n  ${v.join("\n  ")}\n}\n`;
}

/** Write tokens.css from tokens.json, only when it changed (the watcher would loop otherwise). */
export async function writeTokensCss(ds: string) {
  const css = await tokensCss(ds);
  if (!css) return;
  const old = await readFile(join(ds, "tokens.css"), "utf8").catch(() => "");
  if (old !== css) await writeFile(join(ds, "tokens.css"), css);
}

export const RAW_TOKENS = /(?:\.tenon|\/sessions\/[^/]+)\/design-system\/tokens\.json$/;

/** pi proposes; a person accepts. The proposal is a file next to tokens.json. */
export async function proposeTokens(ds: string, t: any) {
  if (!t || typeof t.name !== "string") throw new Error("tokens needs a name");
  const items = dsItems(t);
  if (!items.length) throw new Error("tokens has no color, type, spacing or radius entries");
  for (const i of items)
    for (const [n, val] of i.decls) {
      if (!NAME.test(n)) throw new Error(`Bad token name "${n}"`);
      if (!val || /[;{}<>]/.test(val)) throw new Error(`Bad value for "${n}": "${val}"`);
    }
  await mkdir(ds, { recursive: true });
  await writeFile(join(ds, "tokens.proposed.json"), JSON.stringify(t, null, 2));
}

export async function acceptProposal(ds: string) {
  const p = await readJson(join(ds, "tokens.proposed.json"));
  if (!p) throw new Error("No proposal");
  const old = await readJson(join(ds, "tokens.json"));
  await writeFile(join(ds, "tokens.json"), JSON.stringify({ ...p, version: old ? (old.version ?? 0) + 1 : 1 }, null, 2));
  await rm(join(ds, "tokens.proposed.json"));
  await writeTokensCss(ds);
}

export const discardProposal = (ds: string) => rm(join(ds, "tokens.proposed.json"), { force: true });

/** Everything the Design system tab shows: tokens, the proposal and its changes, and where each token is used. */
export async function dsReport(root: string, canvas: string, ds: string) {
  const tokens = await readJson(join(ds, "tokens.json"));
  const proposed = await readJson(join(ds, "tokens.proposed.json"));
  const c = await readCanvas(root, canvas);
  const htmls = await Promise.all(Object.entries(c.boards).map(async ([k, b]) =>
    ({ title: b.title, html: await readFile(join(canvasDir(root, canvas), k), "utf8").catch(() => "") })));
  const count = (html: string, v: string) => html.split(`var(--${v})`).length + html.split(`var(--${v},`).length - 2;
  const items = dsItems(tokens).map((i) => ({
    ...i,
    used: htmls.map((h) => ({ board: h.title, count: i.decls.reduce((n, [v]) => n + count(h.html, v), 0) })).filter((u) => u.count),
  }));
  const before = new Map(dsItems(tokens).map((i) => [`${i.group}/${i.name}`, i.value]));
  const after = new Map(dsItems(proposed).map((i) => [`${i.group}/${i.name}`, i.value]));
  const changes = [...new Set([...before.keys(), ...after.keys()])].flatMap((k) =>
    before.get(k) === after.get(k) ? [] : [{ name: k.split("/")[1], before: before.get(k), after: after.get(k) }]);
  return { name: tokens?.name, version: tokens?.version, items, proposal: proposed ? { name: proposed.name, changes } : undefined };
}

/** For the canvas tabs: each canvas with its number of notes not done. */
export async function canvasTabs(root: string) {
  const tabs = await Promise.all((await listCanvases(root)).map(async (slug) => {
    try {
      const c = await readCanvas(root, slug);
      return { slug, title: c.title, open: Object.values(c.notes).filter((n) => n.state !== "done").length };
    } catch {
      return undefined; // one unreadable or half-written canvas must not hide the others
    }
  }));
  return tabs.filter((t) => t !== undefined);
}

/** A project keeps its canvases in .tenon/canvases. */
export const projectRoot = (project: string) => join(project, ".tenon", "canvases");
/** The design system sits next to the canvases folder: for a project, and for a session with no project. */
export const designSystemDir = (root: string) => join(dirname(root), "design-system");
/** The status ids the extension uses to tell the host the canvas address and a build pack. */
export const STATUS_CANVAS = "tenon-canvas";
export const STATUS_BUILD = "tenon-canvas-build";

/** Where a session with no project keeps its canvases, until it is added to a project. */
export const freeRoot = (freeDir: string, sessionId: string) => join(freeDir, slug(sessionId), "canvases");

export type CanvasMove = { from: string; to: string };

/** Add to project: where each canvas folder goes in the project. A taken name gets -2, -3… */
export async function canvasMoves(fromRoot: string, toRoot: string): Promise<CanvasMove[]> {
  const moves: CanvasMove[] = [];
  for (const name of await listCanvases(fromRoot)) {
    let to = name;
    for (let n = 2; existsSync(join(toRoot, to)) || moves.some((m) => m.to === to); n++) to = `${name}-${n}`;
    moves.push({ from: name, to });
  }
  return moves;
}

/** Add to project: move the canvas folders, as canvasMoves() planned. */
export async function moveCanvases({ fromRoot, toRoot, moves }: { fromRoot: string; toRoot: string; moves: CanvasMove[] }) {
  await mkdir(toRoot, { recursive: true });
  for (const m of moves) {
    await cp(join(fromRoot, m.from), join(toRoot, m.to), { recursive: true, errorOnExist: true, force: false });
    await rm(join(fromRoot, m.from), { recursive: true });
  }
}

/** Add to project: the session's design system comes too, unless the project has one already. */
export async function moveDesignSystem(fromDs: string, toDs: string) {
  if (!existsSync(join(fromDs, "tokens.json")) || existsSync(toDs)) return;
  await cp(fromDs, toDs, { recursive: true });
  await rm(fromDs, { recursive: true });
}

/** The pack a build session starts from: approved revs, done notes, and the tokens the boards use. */
export async function designPack(root: string, canvas: string, ds: string) {
  const c = await readCanvas(root, canvas);
  const keys = c.order.filter((k) => c.boards[k]);
  const open = keys.filter((k) => c.boards[k].approved !== c.boards[k].rev);
  if (!keys.length) throw new Error("This canvas has no boards");
  if (open.length) throw new Error(`Approve ${c.boards[open[0]].title} first`);
  const dir = canvasDir(root, canvas);
  const used = new Set<string>();
  const lines = keys.map((k) => `- ${c.boards[k].title} (rev ${c.boards[k].approved}): ${join(dir, "approved", `${nameOf(k)}.html`)}`);
  for (const k of keys) {
    const html = await readFile(join(dir, "approved", `${nameOf(k)}.html`), "utf8").catch(() => "");
    for (const m of html.matchAll(/var\(--([\w-]+)/g)) used.add(m[1]);
  }
  const tokens = dsItems(await readJson(join(ds, "tokens.json"))).filter((i) => i.decls.some(([n]) => used.has(n)));
  const notes = Object.values(c.notes).filter((n) => n.state === "done");
  return {
    title: c.title,
    text: [
      `${c.title} · design pack`,
      "Build the approved screens. Read each approved board (plain HTML), then write the code.",
      "",
      `Boards at their approved revs (${keys.length}):`,
      ...lines,
      "",
      `Done notes (${notes.length}):`,
      ...notes.map((n) => `- ${c.boards[n.board]?.title ?? n.board} › “${n.target.text}”: ${n.text}`),
      "",
      `Tokens used on the boards (${tokens.length}):`,
      ...tokens.map((t) => `- ${t.name} ${t.value} (${t.decls.map(([n]) => `var(--${n})`).join(", ")})`),
      "",
      `When a screen is ready, check it against its board with design_compare (canvas "${canvas}").`,
    ].join("\n"),
  };
}

type Fact = { text: string; style: Record<string, { token?: string; value: string }> };
const kebab = (p: string) => p.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
const plain = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ").replace(/(\d)px\b/g, "$1");

/** What a board says: each element with text of its own, and its inline style with tokens resolved.
 *  ponytail: regex, not a parser. Only the text before an element's first child counts, and a ">" inside an attribute breaks it. */
export function boardFacts(html: string, vars: Map<string, string>): Fact[] {
  const out: Fact[] = [];
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)\b([^<>]*)>([^<]+)/g)) {
    if (/^(title|style|script)$/i.test(m[1])) continue;
    const text = m[3].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const style: Fact["style"] = {};
    for (const d of (m[2].match(/\sstyle="([^"]*)"/)?.[1] ?? "").split(";")) {
      const i = d.indexOf(":");
      if (i < 1) continue;
      const v = d.slice(i + 1).trim();
      const t = v.match(/^var\(--([\w-]+)\)$/)?.[1];
      style[d.slice(0, i).trim()] = t ? { token: t, value: vars.get(t) ?? v } : { value: v };
    }
    out.push({ text, style });
  }
  return out;
}

export type Difference = { id: string; title: string; detail: string; state: "open" | "fix" | "wrong" };
export type Compare = { board: string; rev: number; at: string; screenshot?: string; differences: Difference[] };

/** Board against the app (board C12): pi gives what the app shows; the differences come from the approved board. Read them with readCompares(). */
export async function compareBoard(root: string, canvas: string, ds: string, a: {
  board: string; app: AppElement[]; screenshot?: string;
}) {
  const dir = canvasDir(root, canvas);
  const { key, meta: m } = boardOf(await readCanvas(root, canvas), a.board);
  const approved = m.approved != null;
  const html = await readFile(join(dir, approved ? "approved" : "boards", `${nameOf(key)}.html`), "utf8");
  const vars = new Map(dsItems(await readJson(join(ds, "tokens.json"))).flatMap((i) => i.decls));
  const differences = diffFacts(boardFacts(html, vars), a.app);

  let screenshot: string | undefined;
  if (a.screenshot) {
    if (!/\.(png|jpe?g|webp)$/i.test(a.screenshot)) throw new Error("The screenshot must be a png, jpg or webp file");
    await mkdir(join(dir, "compare"), { recursive: true });
    screenshot = `${nameOf(key)}${extname(a.screenshot).toLowerCase() || ".png"}`;
    await copyFile(a.screenshot, join(dir, "compare", screenshot));
  }
  // Running it again keeps what a person already decided about the same difference.
  await locked(dir, async () => {
    const file = join(dir, "compare", `${nameOf(key)}.json`);
    const before: Compare | undefined = await readJson(file);
    const result: Compare = {
      board: key, rev: m.approved ?? m.rev, at: new Date().toISOString(), screenshot: screenshot ?? before?.screenshot,
      differences: keepDecisions(differences, before),
    };
    await mkdir(join(dir, "compare"), { recursive: true });
    await writeFile(file, JSON.stringify(result, null, 2));
  });
}

export type AppElement = { text: string; styles?: Record<string, string | number> };
type Found = Omit<Difference, "id" | "state">;

/** What differs between the board's facts and what the app shows. */
export function diffFacts(facts: Fact[], app: AppElement[]): Found[] {
  const differences: Found[] = [];
  const norm = (t: string) => t.replace(/\s+/g, " ").trim();
  // The same text twice (a heading and a button): the first in the app is the first on the board, and so on.
  const seen = new Map<string, number>();
  const used = new Set<Fact>();
  for (const el of app) {
    const text = norm(el.text);
    const n = seen.get(text) ?? 0;
    seen.set(text, n + 1);
    const f = facts.filter((x) => x.text === text)[n];
    if (!f) {
      differences.push({ title: `“${text.slice(0, 40)}” is not on the board`, detail: "The app shows this text and the board does not." });
      continue;
    }
    used.add(f);
    differences.push(...styleDifferences(f, el.styles ?? {}));
  }
  if (app.length)
    for (const f of facts) if (!used.has(f)) differences.push({ title: `“${f.text.slice(0, 40)}” is missing in the app`, detail: "The board shows this text and the app does not." });
  return differences;
}

function styleDifferences(f: Fact, styles: Record<string, string | number>): Found[] {
  return Object.entries(styles).flatMap(([prop, val]) => {
    const b = f.style[kebab(prop)];
    if (!b || plain(b.value) === plain(String(val))) return [];
    return [{ title: `${f.text.slice(0, 40)}: ${kebab(prop)} differs`, detail: `The board uses ${b.token ? `${b.token} (${b.value})` : b.value}. The app uses ${val}.` }];
  });
}

/** Number the differences, and keep what a person already decided about the same one in an earlier run. */
export function keepDecisions(differences: Found[], before?: Compare): Difference[] {
  return differences.map((d, i) => ({
    ...d, id: `d${i + 1}`,
    state: before?.differences.find((x) => x.title === d.title && x.detail === d.detail)?.state ?? "open",
  }));
}

export async function readCompares(root: string, canvas: string): Promise<Record<string, Compare>> {
  const dir = join(canvasDir(root, canvas), "compare");
  const out: Record<string, Compare> = {};
  for (const f of existsSync(dir) ? await readdir(dir) : []) {
    const c = await readJson(join(dir, f)).catch(() => undefined);
    if (f.endsWith(".json") && c?.board) out[c.board] = c;
  }
  return out;
}

export async function setDifferenceState(root: string, canvas: string, board: string, id: string, state: Difference["state"]) {
  await locked(canvasDir(root, canvas), async () => {
    const f = join(canvasDir(root, canvas), "compare", `${nameOf(boardKey(board))}.json`);
    const c: Compare = await readJson(f);
    const d = c?.differences.find((x) => x.id === id);
    if (!d) throw new Error("Difference not found");
    d.state = state;
    await writeFile(f, JSON.stringify(c, null, 2));
  });
}

const HISTORY_IGNORE = ".tenon/canvases/*/history/";

/** True when the project is a git repository and its .gitignore does not keep history/ out yet. */
export async function gitignoreMissing(project: string) {
  if (!existsSync(join(project, ".git"))) return false;
  const cur = await readFile(join(project, ".gitignore"), "utf8").catch(() => "");
  return !cur.split("\n").includes(HISTORY_IGNORE);
}

/** Keep history/ out of git. */
export async function ensureGitignore(project: string) {
  if (!(await gitignoreMissing(project))) return;
  const f = join(project, ".gitignore");
  const cur = await readFile(f, "utf8").catch(() => "");
  await writeFile(f, cur + (cur && !cur.endsWith("\n") ? "\n" : "") + HISTORY_IGNORE + "\n");
}
