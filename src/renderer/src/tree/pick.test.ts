import { expect, test } from "vitest";
import type { BranchCard, PreviewRow } from "#protocol";
import { pickTargets } from "./pick";

// Partial rows and cards: pickTargets reads only these fields.
const row = (id: string, kind: PreviewRow["kind"]) => ({ id, kind }) as PreviewRow;
const card = (over: Partial<BranchCard>) => ({ id: "c1", leafId: "a5", forkId: "a1", current: false, ...over }) as BranchCard;
const tree = { leafId: "a9", here: "u2" };

test("a row: switch to it and label it; fork only from your own message; a tool row counts as its entry", () => {
  expect(pickTargets({ kind: "row", row: row("u2", "you") }, tree)).toEqual({ target: "u2", forkId: "u2", labelId: "u2", isHere: true, leavesBranch: false });
  expect(pickTargets({ kind: "row", row: row("a3:tool", "pi") }, tree)).toEqual({ target: "a3", forkId: undefined, labelId: "a3", isHere: false, leavesBranch: false });
});

test("a card: switch to its end, fork from its first message, and a summary only when it is another branch", () => {
  expect(pickTargets({ kind: "card", card: card({}) }, tree)).toEqual({ target: "a5", forkId: "a1", labelId: "c1", isHere: false, leavesBranch: true });
  expect(pickTargets({ kind: "card", card: card({ current: true, leafId: "a9" }) }, tree)).toMatchObject({ isHere: true, leavesBranch: false });
});

test("no pick: no targets", () => {
  expect(pickTargets(undefined, tree)).toEqual({ isHere: false, leavesBranch: false });
});
