import { expect, test } from "vitest";
import { buildTree, firstRow } from "./tree";

let t = 0;
const at = () => new Date(Date.UTC(2026, 8, 29, 3, 12 + t++)).toISOString();
const user = (id: string, parentId: string | null, content: string) => ({ type: "message", id, parentId, timestamp: at(), message: { role: "user", content } });
const pi = (id: string, parentId: string, content: unknown[]) => ({ type: "message", id, parentId, timestamp: at(), message: { role: "assistant", content } });
const result = (id: string, parentId: string, toolCallId: string, extra: object = {}) => ({ type: "message", id, parentId, timestamp: at(), message: { role: "toolResult", toolCallId, content: [], ...extra } });

// Board 3: 4 shared rows, then "main" (share in-flight) and "try a lock" (mutex, tests failed).
const entries = [
  { type: "session", id: "file" },
  user("u1", null, "The refresh test fails about 1 in 5 runs on CI."),
  pi("p1", "u1", [{ type: "toolCall", id: "r", name: "read", arguments: { path: "src/refresh.ts" } }]),
  result("r1", "p1", "r"),
  pi("p2", "r1", [{ type: "text", text: "Two requests both see an expired token." }]),
  { type: "label", id: "l1", parentId: "p2", targetId: "p2", label: "cause found" },
  user("u2", "l1", "Fix it without changing how callers get a token."),
  // branch A: the mutex try
  user("a1", "u2", "Use a mutex around the refresh instead."),
  pi("a2", "a1", [{ type: "toolCall", id: "e1", name: "edit", arguments: { path: "src/refresh.ts" } }]),
  result("a3", "a2", "e1", { details: { diff: "+1 a\n+2 b\n-3 c" } }),
  pi("a4", "a3", [{ type: "toolCall", id: "b1", name: "bash", arguments: { command: "npm test" } }]),
  result("a5", "a4", "b1", { isError: true }),
  { type: "label", id: "a6", parentId: "a5", targetId: "a1", label: "try a lock" },
  // branch B (current): share one in-flight refresh
  pi("b1", "u2", [{ type: "text", text: "share one in-flight refresh" }]),
  // a label added while on u2 is a child of u2 too, but shows nothing: not a branch
  { type: "label", id: "x", parentId: "u2", targetId: "u1", label: "start" },
];

test("board 3: rows to the branch point, a card for each branch, the current one marked", () => {
  const tree = buildTree(entries, "b1");
  expect(tree.rows.map((r) => [r.kind, r.tool ?? "", r.label ?? "", r.branchPoint])).toEqual([
    ["you", "", "start", false],
    ["pi", "read", "", false],
    ["pi", "", "cause found", false],
    ["you", "", "", true],
  ]);
  expect(tree.last).toBe("u2");
  expect(tree.here).toBe("b1");
  expect(tree.count).toBe(2);
  const [lock, main] = tree.branchesAt.u2;
  // The branch ends at its last tool result: the label after it is not conversation.
  expect(lock).toMatchObject({ id: "a1", leafId: "a5", forkId: "a1", label: "try a lock", current: false, name: "try a lock", first: "you: Use a mutex around the refresh instead." });
  expect(lock.tools).toEqual([
    { tool: "edit", files: ["refresh.ts"], count: 1, failed: 0, added: 2, removed: 1 },
    { tool: "bash", files: [], count: 1, failed: 1, added: 0, removed: 0 },
  ]);
  expect(main).toMatchObject({ id: "b1", leafId: "b1", current: true, first: "pi: share one in-flight refresh" });
});

test("no branch point: every row, no cards", () => {
  const tree = buildTree(entries.slice(0, 7), "u2");
  expect(tree.rows).toHaveLength(4);
  expect(tree.last).toBeUndefined();
  expect(tree.count).toBe(1);
});

test("standing on the branch point (after a switch back): all branches are cards, none current", () => {
  const tree = buildTree(entries, "u2");
  expect(tree.last).toBe("u2");
  expect(tree.branchesAt.u2.map((c) => c.current)).toEqual([false, false]);
});

test("continue from the first message: the old conversation is a card before the first row", () => {
  const tree = buildTree(entries, null);
  expect(tree.rows).toEqual([]);
  expect(tree.here).toBe("");
  expect(tree.branchesAt[""].map((c) => [c.id, c.current])).toEqual([["u1", false]]);
});

test("continue from a middle message: the branch you left is a card at once", () => {
  const tree = buildTree(entries, "p2");
  expect(tree.last).toBe("p2");
  expect(tree.here).toBe("p2");
  expect(tree.branchesAt.p2.map((c) => c.id)).toEqual(["l1"]); // the label, then the rest of the old conversation
  expect(tree.branchesAt.p2[0].forkId).toBe("u2");
});

test("a split on a hidden entry (a model change) shows its cards under the row before it", () => {
  const es = [
    user("m1", null, "hello"),
    { type: "model_change", id: "mc", parentId: "m1", timestamp: at(), modelId: "gpt-5" },
    user("m2", "mc", "first try"),
    user("m3", "mc", "second try"),
  ];
  const tree = buildTree(es, "m3");
  expect(tree.last).toBe("m1");
  expect(tree.rows.map((r) => [r.id, r.branchPoint])).toEqual([["m1", true]]);
  expect(tree.branchesAt.m1.map((c) => [c.id, c.current])).toEqual([["m2", false], ["m3", true]]);
});

test("firstRow: who wrote the first row and its text on one line, cut with …", () => {
  expect(firstRow(undefined)).toBe("");
  expect(firstRow({ type: "message", id: "u", message: { role: "user", content: "fix\n  the test" } })).toBe("you: fix the test");
  expect(firstRow({ type: "compaction", id: "c" })).toBe("pi: compacted");
  expect(firstRow({ type: "message", id: "p", message: { role: "assistant", content: "x".repeat(100) } })).toBe(`pi: ${"x".repeat(79)}…`);
});
