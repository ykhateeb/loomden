import { expect, test } from "vitest";
import { currentBranch, rowsFor, summarize } from "./summary";

const msg = (id: string, parentId: string | null, message: { role: string; content?: unknown; model?: string }) => ({ type: "message", id, parentId, timestamp: "2026-09-29T10:00:00Z", message });

// start → you → pi(edit) → [you "try tabs" | you "keep one scroll view" → pi]
const entries = [
  { type: "session", id: "file-id", version: 3 },
  msg("a", null, { role: "user", content: "Split the settings screen." }),
  msg("b", "a", { role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text: "Proposed 4 section components" }, { type: "toolCall", id: "t", name: "edit", arguments: { path: "src/AccountSection.tsx" } }] }),
  msg("c", "b", { role: "user", content: "Try tabs instead." }),
  msg("d", "b", { role: "user", content: [{ type: "text", text: "Keep one scroll view but group rows." }] }),
  { type: "label", id: "e", parentId: "d", targetId: "b", label: "plan agreed" },
  { type: "compaction", id: "f", parentId: "e", tokensBefore: 50000 },
  msg("g", "f", { role: "assistant", model: "gpt-5", content: [{ type: "text", text: "Done.\nMore text" }] }),
];

test("model = the last one used; branches = leaves", () => {
  expect(summarize(entries)).toEqual({ model: "gpt-5", branches: 2 });
});

test("rows of the current branch: short, with labels, tools and the branch point", () => {
  const rows = rowsFor(currentBranch(entries), entries).map((r) => [r.kind, r.tool ?? "", r.text, r.label ?? "", r.branchPoint]);
  expect(rows).toEqual([
    ["you", "", "Split the settings screen.", "", false],
    ["pi", "", "Proposed 4 section components", "plan agreed", true],
    ["pi", "edit", "AccountSection.tsx", "", false],
    ["you", "", "Keep one scroll view but group rows.", "", false],
    ["compacted", "", "compacted · 50,000 tokens summarized", "", false],
    ["pi", "", "Done.", "", false],
  ]);
});

import { visibleBranch } from "./summary";

test("visible branch: current branch, only what the last compaction kept", () => {
  const ids = (es: { id?: string }[]) => es.map((e) => e.id);
  expect(ids(visibleBranch(entries))).toEqual(["f", "g"]); // compaction "f" kept nothing before it
  const kept = entries.map((e) => (e.id === "f" ? { ...e, firstKeptEntryId: "d" } : e));
  expect(ids(visibleBranch(kept))).toEqual(["d", "e", "f", "g"]);
});

test("a pi message with only a tool call keeps its label and branch point", () => {
  const es = [
    msg("a", null, { role: "user", content: "go" }),
    msg("b", "a", { role: "assistant", content: [{ type: "toolCall", id: "t", name: "bash", arguments: { command: "npm test" } }] }),
    msg("c", "b", { role: "user", content: "one" }),
    msg("d", "b", { role: "user", content: "two" }),
    { type: "label", id: "e", parentId: "d", targetId: "b", label: "tests" },
  ];
  expect(rowsFor(currentBranch(es), es)[1]).toMatchObject({ id: "b", tool: "bash", branchPoint: true, label: "tests" });
});
