// The design-system tokens: tokens.json, its CSS variables, and pi's proposal that a person accepts.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canvasDir, NAME, readCanvas, readJson } from "./store.js";

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
      decls: [[`${s.name}-font-size`, String(s.fontSize)], [`${s.name}-line-height`, String(s.lineHeight)], [`${s.name}-font-weight`, String(s.fontWeight)]],
    });
  return out;
}

/** The top of tokens.json. dsItems() reads the token groups. */
export type Tokens = { name?: string; version?: number; [group: string]: unknown };

/** tokens.json of a design system, or undefined when it has none. */
export function readTokens(ds: string): Promise<Tokens | undefined> {
  return readJson(join(ds, "tokens.json"));
}

/** tokens.json -> CSS variables. "" when there is no tokens.json. */
export async function tokensCss(ds: string): Promise<string> {
  const t = await readTokens(ds);
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
  const old = await readTokens(ds);
  await writeFile(join(ds, "tokens.json"), JSON.stringify({ ...p, version: old ? (old.version ?? 0) + 1 : 1 }, null, 2));
  await rm(join(ds, "tokens.proposed.json"));
  await writeTokensCss(ds);
}

export const discardProposal = (ds: string) => rm(join(ds, "tokens.proposed.json"), { force: true });

/** Everything the Design system tab shows: tokens, the proposal and its changes, and where each token is used. */
export async function dsReport(root: string, canvas: string, ds: string) {
  const tokens = await readTokens(ds);
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
