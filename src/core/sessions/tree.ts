import type { BranchCard, SessionTree } from "#protocol";
import { branchCount, contentText, type Entry, isRow, labelsOf, type Node, pathTo, rowsFor, structure } from "./summary";

const NAME_MAX = 28;
const FIRST_ROW_MAX = 80;

/** `text` on one line, cut to `max` characters with "…". */
const truncate = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/**
 * Board 3: the current branch up to its last branch point as rows, and a card for each branch.
 * `leafId` is pi's current point. It moves in memory when you switch, and can sit on an entry with no row
 * (a label, a model change, a tool result) or before the first message (null): rows and cards go to the
 * nearest row, and "" is the place before the first row.
 */
export function buildTree(entries: Entry[], leafId: string | null): SessionTree {
  const { nodes, byId, branches, ownerOf } = structure(entries);
  const labels = labelsOf(entries);

  const path = pathTo(byId, leafId);
  const onPath = new Set(path.map((e) => e.id));

  // Where the conversation splits on the way to the current point. The current point also counts when
  // conversation continues from it (you switched back to an earlier message and have not sent yet).
  const points: (string | null)[] = [];
  const splits = (id: string | null) => branches(id).length > 1 || (id === leafId && branches(id).length > 0);
  if (splits(null)) points.push(null);
  for (const e of path) if (splits(e.id)) points.push(e.id);
  const lastSplit = points.at(-1);
  const ctx: CardContext = { byId, branches, labels, path, onPath };

  // At the last split every branch gets a card (the current one too); at earlier splits the ones you are not on.
  const branchesAt: Record<string, BranchCard[]> = {};
  for (const p of points) {
    const owner = ownerOf(p);
    const cards = branches(p).filter((c) => p === lastSplit || !onPath.has(c.id)).map((c) => card(c, ctx));
    branchesAt[owner] = [...(branchesAt[owner] ?? []), ...cards];
  }

  const cut = lastSplit === undefined ? path.length : lastSplit === null ? 0 : path.findIndex((e) => e.id === lastSplit) + 1;
  return {
    rows: rowsFor(path.slice(0, cut), entries),
    branchesAt,
    last: lastSplit === undefined ? undefined : ownerOf(lastSplit),
    here: ownerOf(leafId),
    count: branchCount(nodes, branches),
    leafId,
  };
}

type CardContext = Pick<ReturnType<typeof structure>, "byId" | "branches"> & {
  labels: ReadonlyMap<string, string>;
  path: readonly Node[];
  onPath: ReadonlySet<string>;
};

function card(start: Node, ctx: CardContext): BranchCard {
  const { byId, branches, labels, path, onPath } = ctx;
  const current = onPath.has(start.id);
  const end = current ? path[path.length - 1] : newestEnd(start, branches);
  const toEnd = pathTo(byId, end.id);
  const run = toEnd.slice(Math.max(0, toEnd.findIndex((e) => e.id === start.id))); // from the start of the branch to its end
  const shown = run.filter(isRow);
  const firstUser = shown.find((e) => e.type === "message" && e.message?.role === "user");
  const label = [...run].reverse().map((e) => labels.get(e.id)).find(Boolean);
  return {
    id: start.id,
    leafId: end.id,
    forkId: firstUser?.id,
    current,
    label,
    name: label ?? truncate(contentText(firstUser?.message?.content) || "branch", NAME_MAX),
    first: firstRow(shown[0]),
    tools: toolStats(run, shown),
    at: Date.parse(end.timestamp ?? "") || 0,
  };
}

/** The newest end of a branch: follow conversation only (a label added later is not where it ends). */
function newestEnd(e: Node, branches: CardContext["branches"]): Node {
  const next = branches(e.id);
  if (!next.length) return e;
  return next.map((n) => newestEnd(n, branches)).sort((a, b) => Date.parse(b.timestamp ?? "") - Date.parse(a.timestamp ?? ""))[0];
}

/** The first row of a card as "who: text" on one line, or "" when the branch shows no row. */
export function firstRow(first: Node | undefined): string {
  if (!first) return "";
  const who = first.message?.role === "user" ? "you" : "pi";
  const empty = first.type === "compaction" ? "compacted" : "…";
  return `${who}: ${truncate(contentText(first.message?.content) || empty, FIRST_ROW_MAX)}`;
}

type ToolStats = BranchCard["tools"][number];
type ToolResult = { isError?: boolean; diff?: string };

/** What each tool did on a branch: the files it touched, how often it ran and failed, and the lines its diffs added and removed. */
function toolStats(run: readonly Node[], shown: readonly Node[]): ToolStats[] {
  const results = resultsByCall(run);
  const tools = new Map<string, ToolStats>();
  for (const e of shown) {
    if (e.message?.role !== "assistant" || !Array.isArray(e.message.content)) continue;
    for (const c of e.message.content.filter((part) => part?.type === "toolCall")) {
      const t: ToolStats = tools.get(c.name) ?? { tool: c.name, files: [], count: 0, failed: 0, added: 0, removed: 0 };
      const file = c.arguments?.path ?? c.arguments?.file_path;
      const fileName = typeof file === "string" ? file.split("/").pop() : undefined;
      const result = results.get(c.id);
      const { added, removed } = countDiff(result?.diff);
      tools.set(c.name, {
        ...t,
        files: fileName && !t.files.includes(fileName) ? [...t.files, fileName] : t.files,
        count: t.count + 1,
        failed: t.failed + (result?.isError ? 1 : 0),
        added: t.added + added,
        removed: t.removed + removed,
      });
    }
  }
  return [...tools.values()];
}

/** The tool results of a branch, by the id of their tool call. */
function resultsByCall(run: readonly Node[]): Map<string, ToolResult> {
  const results = new Map<string, ToolResult>();
  for (const e of run) {
    const m = e.message as { role?: string; toolCallId?: string; isError?: boolean; details?: { diff?: unknown } } | undefined; // a tool result has these fields
    if (m?.role === "toolResult" && m.toolCallId) results.set(m.toolCallId, { isError: m.isError, diff: typeof m.details?.diff === "string" ? m.details.diff : undefined });
  }
  return results;
}

/** The lines a diff adds and removes. */
function countDiff(diff = ""): { added: number; removed: number } {
  const lines = diff.split("\n");
  return { added: lines.filter((l) => l.startsWith("+")).length, removed: lines.filter((l) => l.startsWith("-")).length };
}
