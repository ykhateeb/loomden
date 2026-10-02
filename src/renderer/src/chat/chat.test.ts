import { expect, test } from "vitest";
import type { AgentMessage } from "#protocol";
import { dayLabel, diffCounts, home, plural } from "./format";
import { groupTurns } from "./turns";

test("diff counts from pi's display diff", () => {
  expect(diffCounts("+19 let a;\n 20 keep\n-21 old\n+22 new")).toEqual({ added: 2, removed: 1 });
});

test("day labels", () => {
  const now = new Date(2026, 8, 29, 12, 0).getTime();
  expect(dayLabel(now - 3600_000, now)).toMatch(/^Today · /);
  expect(dayLabel(now - 86400_000, now)).toMatch(/^Yesterday · /);
  expect(dayLabel(now - 5 * 86400_000, now)).not.toMatch(/^(Today|Yesterday)/);
});

import { applyPick, findTrigger } from "./format";

test("/ only at the start, @ after a space or at the start", () => {
  expect(findTrigger("/rev", 4)).toEqual({ kind: "/", query: "rev", start: 0, end: 4 });
  expect(findTrigger("/review now", 11)).toBeUndefined();
  expect(findTrigger("see @src/au", 11)).toEqual({ kind: "@", query: "src/au", start: 4, end: 11 });
  expect(findTrigger("mail a@b", 8)).toBeUndefined();
  expect(findTrigger("@", 1)).toEqual({ kind: "@", query: "", start: 0, end: 1 });
});

test("a pick replaces the typed token", () => {
  expect(applyPick("/rev", findTrigger("/rev", 4)!, "review")).toEqual({ text: "/review ", caret: 8 });
  const t = findTrigger("fix @ref please", 8)!;
  expect(applyPick("fix @ref please", t, "src/refresh.ts")).toEqual({ text: "fix @src/refresh.ts please", caret: 20 });
});

import { parseDiff } from "./format";

test("parseDiff: pi's exact diff-string format (sign, padded line number, one delimiter space, text)", () => {
  expect(parseDiff("+19 let inFlight: Promise<Token> | null = null;")).toEqual([{ kind: "add", n: 19, text: "let inFlight: Promise<Token> | null = null;" }]);
  expect(parseDiff("-21   if (isExpired(token)) token = await fetchToken();")).toEqual([{ kind: "del", n: 21, text: "  if (isExpired(token)) token = await fetchToken();" }]);
  expect(parseDiff("  5 return token;")).toEqual([{ kind: "ctx", n: 5, text: "return token;" }]); // width-3 padding: two leading spaces before the digit
  expect(parseDiff("   ...")).toEqual([{ kind: "skip", n: undefined, text: "..." }]);
  const multi = parseDiff("+19 a\n 20 b\n-21 c");
  expect(multi.map((l) => [l.kind, l.n])).toEqual([["add", 19], ["ctx", 20], ["del", 21]]);
});

test("plural and home folder for the UI", () => {
  expect(plural(1, "model")).toBe("1 model");
  expect(plural(3, "canvas", "canvases")).toBe("3 canvases");
  expect(home("/Users/me/code/app")).toBe("~/code/app");
  expect(home("/opt/app")).toBe("/opt/app");
});

test("groupTurns: a date line for a new day, and pi's messages with their tool results as one turn", () => {
  const day1 = new Date(2026, 8, 28, 10).getTime();
  const day2 = new Date(2026, 8, 29, 10).getTime();
  // Partial messages: groupTurns reads only role and timestamp.
  const m = (role: string, timestamp: number) => ({ role, timestamp }) as unknown as AgentMessage;
  const rows = groupTurns([m("user", day1), m("assistant", day1), m("toolResult", day1), m("assistant", day1), m("user", day1 + 1), m("user", day2)]);
  expect(rows.map((r) => (r.kind === "turn" ? `turn:${r.key}:${r.parts.length}` : `${r.kind}:${r.key}`))).toEqual([
    "day:d0", "message:0", "turn:1:2", "message:4", "day:d5", "message:5",
  ]);
});
