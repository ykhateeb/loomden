// A board against the app (board C12), and the design pack that a build session starts from.
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { boardKey, boardOf, canvasDir, locked, nameOf, readCanvas, readJson } from "./store.js";
import { dsItems, readTokens } from "./tokens.js";

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
  const tokens = dsItems(await readTokens(ds)).filter((i) => i.decls.some(([n]) => used.has(n)));
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
  const vars = new Map(dsItems(await readTokens(ds)).flatMap((i) => i.decls));
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
