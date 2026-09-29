// Files are the truth. Everything here reads and writes `.tau/canvases/<slug>/`.
import { appendFile, copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type Target = { tid: string; text: string; box: number[] };
export type NoteState = "open" | "sent" | "work" | "done";
export type Note = { board: string; target: Target; text: string; state: NoteState; by: string; at: string };
export type BoardMeta = {
  title: string; x: number; y: number; w: number; h: number; rev: number; by: string; at?: string; approved?: number;
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
export const RAW_BOARD = /(?:\.tau|\/sessions\/[^/]+)\/canvases\/[^/]+\/boards\/[^/]+\.html$/;
/** canvas.json (it holds approvals), approved/ and history/ change only through the tools and the viewer. */
export const RAW_STATE = /(?:\.tau|\/sessions\/[^/]+)\/canvases\/[^/]+\/(canvas\.json|approved\/.+|history\/.+)$/;

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

const STYLE_PROPS = new Set(["color", "margin-top", "padding", "font-size", "line-height", "font-weight"]);
const TOKEN_VALUE = /^var\(--[A-Za-z0-9][\w-]*\)$/;
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Your edit in edit mode: the text of one element, or design-system values for its style. Saved as a rev by "you". */
export async function patchBoard(root: string, a: {
  canvas: string; board: string; tid: string; text?: string; style?: Record<string, string>; tell?: boolean;
}) {
  const dir = canvasDir(root, a.canvas);
  if (!/^\d+$/.test(a.tid)) throw new Error("Bad tid");
  for (const [k, v] of Object.entries(a.style ?? {}))
    if (!STYLE_PROPS.has(k) || !TOKEN_VALUE.test(v)) throw new Error(`Only design-system values: ${k}: ${v}`);
  if (a.text != null && a.text.length > 500) throw new Error("Text is too long");
  return locked(dir, async () => {
    const c = await readCanvas(root, a.canvas);
    const key = boardKey(a.board);
    if (!c.boards[key]) throw new Error(`Board ${key} not found`);
    let html = await readFile(join(dir, key), "utf8");
    const at = html.indexOf(`data-tid="${a.tid}"`);
    if (at < 0) throw new Error(`Element ${a.tid} not found: the board changed`);
    const start = html.lastIndexOf("<", at);
    const end = html.indexOf(">", at);
    let tag = html.slice(start, end + 1);
    let why: string;
    let rest = html.slice(end + 1);
    if (a.text != null) {
      const lead = rest.slice(0, Math.max(0, rest.indexOf("<")));
      if (tag.endsWith("/>") || !lead.trim()) throw new Error("This element has no text of its own");
      const ws = lead.match(/^\s*/)![0], tw = lead.match(/\s*$/)![0];
      why = `text “${lead.trim().slice(0, 30)}” → “${a.text.slice(0, 30)}”`;
      rest = ws + esc(a.text) + tw + rest.slice(lead.length);
    } else {
      const decls = new Map<string, string>();
      const m = tag.match(/\sstyle="([^"]*)"/);
      for (const d of (m?.[1] ?? "").split(";")) {
        const i = d.indexOf(":");
        if (i > 0) decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
      }
      for (const [k, v] of Object.entries(a.style ?? {})) decls.set(k, v);
      const attr = ` style="${[...decls].map(([k, v]) => `${k}: ${v}`).join("; ")}"`;
      tag = m ? tag.replace(m[0], attr) : tag.replace(/\s*(\/?)>$/, `${attr}$1>`);
      why = `${Object.keys(a.style ?? {}).join(", ")} of element ${a.tid}`;
    }
    html = html.slice(0, start) + tag + rest;
    return { rev: await save(dir, c, key, html, "you", why, a.tell === false ? { quiet: true } : {}) };
  });
}

/** Undo your last edit: the content before it comes back as a new rev. Only while nothing else changed the board. */
export async function undoBoard(root: string, canvas: string, board: string, rev: number) {
  const dir = canvasDir(root, canvas);
  return locked(dir, async () => {
    const c = await readCanvas(root, canvas);
    const key = boardKey(board);
    const m = c.boards[key];
    if (!m || m.rev !== rev || rev < 2) throw new Error("The board changed since: nothing to undo");
    const html = await readFile(join(dir, "history", `${nameOf(key)}.r${rev - 1}.html`), "utf8");
    // pi hears about the undo if it heard about the edit; a quiet edit is undone quietly.
    const edit = (await readHistory(root, canvas, board)).find((e) => e.rev === rev);
    return { rev: await save(dir, c, key, html, "you", `undo rev ${rev}`, edit?.quiet ? { quiet: true } : {}) };
  });
}

/** The revs of one board, newest first. */
export async function readHistory(root: string, canvas: string, board: string) {
  const key = boardKey(board);
  const log = await readFile(join(canvasDir(root, canvas), "history", "log.jsonl"), "utf8").catch(() => "");
  return log.split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.board === key).reverse();
}

/** Restore never deletes: the old content is saved as a new rev by you. */
export async function restoreRev(root: string, canvas: string, board: string, rev: number) {
  const dir = canvasDir(root, canvas);
  return locked(dir, async () => {
    const c = await readCanvas(root, canvas);
    const key = boardKey(board);
    if (!c.boards[key]) throw new Error(`Board ${key} not found`);
    const html = await readFile(join(dir, "history", `${nameOf(key)}.r${Number(rev)}.html`), "utf8").catch(() => {
      throw new Error(`Rev ${rev} not found`);
    });
    return { rev: await save(dir, c, key, html, "you", `restore rev ${rev}`) };
  });
}

/** Only a person approves (the viewer calls this; no pi tool does). The approved rev is copied to approved/. */
export async function approve(root: string, canvas: string, board: string) {
  const dir = canvasDir(root, canvas);
  return locked(dir, async () => {
    const c = await readCanvas(root, canvas);
    const key = boardKey(board);
    const m = c.boards[key];
    if (!m) throw new Error(`Board ${key} not found`);
    await mkdir(join(dir, "approved"), { recursive: true });
    await copyFile(join(dir, key), join(dir, "approved", `${nameOf(key)}.html`));
    m.approved = m.rev;
    await writeFile(join(dir, "canvas.json"), JSON.stringify(c, null, 2));
    return { approved: m.rev };
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

/** tokens.json -> CSS variables. Writes tokens.css only when it changed (the watcher would loop otherwise). */
export async function tokensCss(ds: string): Promise<string> {
  const t = await readJson(join(ds, "tokens.json"));
  if (!t) return "";
  const v = dsItems(t).flatMap((i) => i.decls.map(([n, val]) => `--${n}: ${val};`));
  const css = `:root {\n  ${v.join("\n  ")}\n}\n`;
  const old = await readFile(join(ds, "tokens.css"), "utf8").catch(() => "");
  if (old !== css) await writeFile(join(ds, "tokens.css"), css);
  return css;
}

export const RAW_TOKENS = /(?:\.tau|\/sessions\/[^/]+)\/design-system\/tokens\.json$/;

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
  return items.length;
}

export async function acceptProposal(ds: string) {
  const p = await readJson(join(ds, "tokens.proposed.json"));
  if (!p) throw new Error("No proposal");
  const old = await readJson(join(ds, "tokens.json"));
  await writeFile(join(ds, "tokens.json"), JSON.stringify({ ...p, version: old ? (old.version ?? 0) + 1 : 1 }, null, 2));
  await rm(join(ds, "tokens.proposed.json"));
  await tokensCss(ds);
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

/** Where a session with no project keeps its canvases, until it is added to a project. */
export const freeRoot = (freeDir: string, sessionId: string) => join(freeDir, slug(sessionId), "canvases");

/** Add to project: move every canvas folder into the project. A taken name gets -2, -3… */
export async function moveCanvases(fromRoot: string, toRoot: string): Promise<string[]> {
  const moved: string[] = [];
  await mkdir(toRoot, { recursive: true });
  for (const name of await listCanvases(fromRoot)) {
    let to = name;
    for (let n = 2; existsSync(join(toRoot, to)); n++) to = `${name}-${n}`;
    await cp(join(fromRoot, name), join(toRoot, to), { recursive: true });
    await rm(join(fromRoot, name), { recursive: true });
    moved.push(to);
  }
  return moved;
}

/** Add to project: the session's design system comes too, unless the project has one already. */
export async function moveDesignSystem(fromDs: string, toDs: string): Promise<boolean> {
  if (!existsSync(join(fromDs, "tokens.json")) || existsSync(toDs)) return false;
  await cp(fromDs, toDs, { recursive: true });
  await rm(fromDs, { recursive: true });
  return true;
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
