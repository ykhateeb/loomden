import type { BranchCard, SessionTree } from "#protocol";
import { contentText, type Entry, isContent, isRow, labelsOf, type Node, rowsFor, structure } from "./summary";

const short = (s: string, n: number) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
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

  const path: Node[] = [];
  for (let e = leafId ? byId.get(leafId) : undefined; e; e = e.parentId ? byId.get(e.parentId) : undefined) path.unshift(e);
  const onPath = new Set(path.map((e) => e.id));

  // Where the conversation splits on the way to the current point. The current point also counts when
  // conversation continues from it (you switched back to an earlier message and have not sent yet).
  const points: (string | null)[] = [];
  const splits = (id: string | null) => branches(id).length > 1 || (id === leafId && branches(id).length > 0);
  if (splits(null)) points.push(null);
  for (const e of path) if (splits(e.id)) points.push(e.id);
  const last = points.at(-1);

  // The newest end of a branch: follow conversation only (a label added later is not where it ends).
  const newestEnd = (e: Node): Node => {
    const next = branches(e.id);
    return next.length ? next.map(newestEnd).sort((a, b) => Date.parse(b.timestamp ?? "") - Date.parse(a.timestamp ?? ""))[0] : e;
  };

  const card = (start: Node): BranchCard => {
    const current = onPath.has(start.id);
    const end = current ? path[path.length - 1] : newestEnd(start);
    const run: Node[] = [];
    for (let e: Node | undefined = end; e; e = e.parentId ? byId.get(e.parentId) : undefined) {
      run.unshift(e);
      if (e.id === start.id) break;
    }
    const shown = run.filter(isRow);
    const firstUser = shown.find((e) => e.type === "message" && e.message?.role === "user");
    const label = [...run].reverse().map((e) => labels.get(e.id)).find(Boolean);
    const results = new Map<string, { isError?: boolean; diff?: string }>();
    for (const e of run) {
      const m = e.message as { role?: string; toolCallId?: string; isError?: boolean; details?: { diff?: unknown } } | undefined;
      if (m?.role === "toolResult" && m.toolCallId) results.set(m.toolCallId, { isError: m.isError, diff: typeof m.details?.diff === "string" ? m.details.diff : undefined });
    }
    const tools = new Map<string, { files: Set<string>; count: number; failed: number; added: number; removed: number }>();
    for (const e of shown) {
      if (e.message?.role !== "assistant" || !Array.isArray(e.message.content)) continue;
      for (const c of e.message.content) {
        if (c?.type !== "toolCall") continue;
        const t = tools.get(c.name) ?? { files: new Set(), count: 0, failed: 0, added: 0, removed: 0 };
        const file = c.arguments?.path ?? c.arguments?.file_path;
        if (typeof file === "string") t.files.add(file.split("/").pop()!);
        t.count++;
        const r = results.get(c.id);
        if (r?.isError) t.failed++;
        for (const line of r?.diff?.split("\n") ?? []) {
          if (line.startsWith("+")) t.added++;
          if (line.startsWith("-")) t.removed++;
        }
        tools.set(c.name, t);
      }
    }
    const first = shown[0];
    return {
      id: start.id,
      leafId: end.id,
      forkId: firstUser?.id,
      current,
      label,
      name: label ?? short(contentText(firstUser?.message?.content) || "branch", 28),
      first: first ? `${first.message?.role === "user" ? "you" : "pi"}: ${short(contentText(first.message?.content) || (first.type === "compaction" ? "compacted" : "…"), 80)}` : "",
      tools: [...tools].map(([tool, t]) => ({ tool, files: [...t.files], count: t.count, failed: t.failed, added: t.added, removed: t.removed })),
      at: Date.parse(end.timestamp ?? "") || 0,
    };
  };

  // At the last split every branch gets a card (the current one too); at earlier splits the ones you are not on.
  const branchesAt: Record<string, BranchCard[]> = {};
  for (const p of points) {
    const owner = ownerOf(p);
    const cards = branches(p).filter((c) => p === last || !onPath.has(c.id)).map(card);
    branchesAt[owner] = [...(branchesAt[owner] ?? []), ...cards];
  }

  const cut = last === undefined ? path.length : last === null ? 0 : path.findIndex((e) => e.id === last) + 1;
  return {
    rows: rowsFor(path.slice(0, cut), entries),
    branchesAt,
    last: last === undefined ? undefined : ownerOf(last),
    here: ownerOf(leafId),
    count: Math.max(1, nodes.filter((e) => isContent(e) && branches(e.id).length === 0).length), // as summarize() counts
    leafId,
  };
}
