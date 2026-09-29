import { readFileSync } from "node:fs";
import { migrateSessionEntries, parseSessionEntries } from "@earendil-works/pi-coding-agent";
import type { PreviewRow } from "../../protocol";

/** One line of a session file. Only the fields Tau reads. */
export type Entry = {
  type: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  message?: { role: string; content?: unknown; model?: string; timestamp?: number };
  modelId?: string;
  targetId?: string;
  label?: string;
  tokensBefore?: number;
  summary?: string;
};

/** Read a session file without opening it in pi (no runtime, no write). */
export function readEntries(path: string): Entry[] {
  const entries = parseSessionEntries(readFileSync(path, "utf8"));
  migrateSessionEntries(entries); // old formats → the current tree, in memory only
  return entries as Entry[];
}

export type Node = Entry & { id: string };
const tree = (entries: Entry[]) => entries.filter((e): e is Node => typeof e.id === "string" && e.type !== "session");

/** Conversation: any message, a compaction, a branch summary, an extension message. Not: labels, names, model or thinking changes. */
export const isContent = (e: Entry) => e.type === "message" || e.type === "compaction" || e.type === "branch_summary" || e.type === "custom_message";

/** An entry the lists show as a row: what you and pi said, compactions, branch summaries. */
export const isRow = (e: Entry) =>
  (e.type === "message" && (e.message?.role === "user" || (e.message?.role === "assistant" && saysSomething(e.message.content)))) || e.type === "compaction" || e.type === "branch_summary";

/** An aborted run or a thinking-only answer has no text and no tool call: rowsFor() makes no row for it. */
function saysSomething(content: unknown) {
  return Array.isArray(content) ? content.some((c) => (c?.type === "text" && typeof c.text === "string" && c.text.trim()) || c?.type === "toolCall") : typeof content === "string" && !!content.trim();
}

/**
 * The session tree, with branches counted the way the user sees them: a child counts as a branch only if
 * conversation follows it (a label or a model change alone does not). Shared by the list, the preview and the tree.
 */
export function structure(entries: Entry[]) {
  const nodes = tree(entries);
  const byId = new Map(nodes.map((e) => [e.id, e]));
  const kids = new Map<string | null, Node[]>();
  for (const e of nodes) kids.set(e.parentId ?? null, [...(kids.get(e.parentId ?? null) ?? []), e]);
  const memo = new Map<string, boolean>();
  const hasContent = (e: Node): boolean => {
    let v = memo.get(e.id);
    if (v === undefined) memo.set(e.id, (v = isContent(e) || (kids.get(e.id) ?? []).some(hasContent)));
    return v;
  };
  const branches = (id: string | null) => (kids.get(id) ?? []).filter(hasContent);
  /** The row a hidden entry belongs to: itself if it is a row, else the nearest row above it ("" = before the first row). */
  const ownerOf = (id: string | null): string => {
    for (let e = id ? byId.get(id) : undefined; e; e = e.parentId ? byId.get(e.parentId) : undefined) if (isRow(e)) return e.id;
    return "";
  };
  /** Rows (by owner) where the conversation splits. */
  const points = new Set<string>();
  if (branches(null).length > 1) points.add("");
  for (const e of nodes) if (branches(e.id).length > 1) points.add(ownerOf(e.id));
  return { nodes, byId, kids, branches, ownerOf, points };
}

/** The last model used, and how many branches the tree has (conversation leaves). */
export function summarize(entries: Entry[]) {
  const { nodes, branches } = structure(entries);
  let model: string | undefined;
  for (const e of nodes) {
    if (e.type === "model_change" && e.modelId) model = e.modelId;
    if (e.type === "message" && e.message?.role === "assistant" && e.message.model) model = e.message.model;
  }
  return { model, branches: Math.max(1, nodes.filter((e) => isContent(e) && !branches(e.id).length).length) };
}

const firstLine = (s: string) => s.split("\n").find((l) => l.trim())?.trim().slice(0, 140) ?? "";

function text(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((c) => (c && typeof c === "object" && "text" in c && typeof c.text === "string" ? c.text : "")).join("\n");
}

function toolLine(content: unknown): { tool: string; text: string } | undefined {
  if (!Array.isArray(content)) return undefined;
  const calls = content.filter((c) => c?.type === "toolCall");
  if (!calls.length) return undefined;
  const args = calls.map((c) => c.arguments ?? {});
  const what = args.map((a) => a.path ?? a.file_path ?? a.command ?? a.pattern).filter((v): v is string => typeof v === "string");
  return { tool: calls[0].name, text: what.map((w) => w.split("/").pop()).join(", ") || firstLine(text(content)) };
}

/** The current branch: from the root to the last entry. */
export function currentBranch(entries: Entry[]): Entry[] {
  const nodes = tree(entries);
  const byId = new Map(nodes.map((e) => [e.id, e]));
  const branch: Entry[] = [];
  for (let e = nodes.at(-1); e; e = e.parentId ? byId.get(e.parentId) : undefined) branch.unshift(e);
  return branch;
}

/** What the chat shows: the current branch, and after a compaction only what it kept. */
export function visibleBranch(entries: Entry[]): Entry[] {
  const branch = currentBranch(entries);
  const last = branch.findLastIndex((e) => e.type === "compaction");
  if (last < 0) return branch;
  const kept = branch.findIndex((e) => e.id === (branch[last] as { firstKeptEntryId?: string }).firstKeptEntryId);
  return branch.slice(kept >= 0 && kept < last ? kept : last);
}

/** Board 1's preview: the current branch (up from the last entry), short, newest last. */
export function previewRows(entries: Entry[]): PreviewRow[] {
  return rowsFor(currentBranch(entries), entries);
}

/** Labels by the entry they mark (the last label entry wins; an empty one removes it). */
export function labelsOf(entries: Entry[]) {
  const labels = new Map<string, string>();
  for (const e of tree(entries)) if (e.type === "label" && e.targetId) (e.label ? labels.set(e.targetId, e.label) : labels.delete(e.targetId));
  return labels;
}

/** Short rows for a list of entries (a branch, or part of one). */
export function rowsFor(branch: Entry[], entries: Entry[]): PreviewRow[] {
  const labels = labelsOf(entries);
  const { points } = structure(entries);

  const rows: PreviewRow[] = [];
  for (const e of branch) {
    const at = e.timestamp ? Date.parse(e.timestamp) : 0;
    const base = { id: e.id!, at, label: labels.get(e.id!), branchPoint: points.has(e.id!) };
    if (e.type === "compaction") rows.push({ ...base, kind: "compacted", text: `compacted · ${(e.tokensBefore ?? 0).toLocaleString()} tokens summarized` });
    if (e.type === "branch_summary") rows.push({ ...base, kind: "summary", text: firstLine(e.summary ?? "") });
    if (e.type !== "message" || !e.message) continue;
    const role = e.message.role;
    if (role === "user") rows.push({ ...base, kind: "you", text: firstLine(text(e.message.content)) });
    if (role === "assistant") {
      const tool = toolLine(e.message.content);
      const said = firstLine(text(e.message.content));
      if (said) rows.push({ ...base, kind: "pi", text: said });
      // The label and the branch point go on the message's first row: the text, or the tool row when there is no text.
      if (tool) rows.push(said ? { ...base, id: `${e.id}:tool`, kind: "pi", tool: tool.tool, text: tool.text, branchPoint: false, label: undefined } : { ...base, kind: "pi", tool: tool.tool, text: tool.text });
    }
  }
  return rows;
}
