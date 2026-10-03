import { expect, test } from "vitest";
import { dayLabel, diffCounts, formatTokens, homePath } from "./format";

test("diff counts from pi's display diff", () => {
  expect(diffCounts("+19 let a;\n 20 keep\n-21 old\n+22 new")).toEqual({ added: 2, removed: 1 });
});

test("day labels", () => {
  const now = new Date(2026, 8, 29, 12, 0).getTime();
  expect(dayLabel(now - 3600_000, now)).toMatch(/^Today · /);
  expect(dayLabel(now - 86400_000, now)).toMatch(/^Yesterday · /);
  expect(dayLabel(now - 5 * 86400_000, now)).not.toMatch(/^(Today|Yesterday)/);
});

test("home path shortens only a macOS home folder", () => {
  expect(homePath("/Users/me/code/app")).toBe("~/code/app");
  expect(homePath("/Users/me")).toBe("~");
  expect(homePath("/home/me/app")).toBe("/home/me/app");
  expect(homePath("/opt/Users/me")).toBe("/opt/Users/me");
});

test("token counts show one decimal from 1000 up", () => {
  expect(formatTokens(999)).toBe("999");
  expect(formatTokens(1000)).toBe("1.0k");
  expect(formatTokens(131_072)).toBe("131.1k");
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

import { parseDiff, plural } from "./format";

test("plural picks the word for the count", () => {
  expect(plural(1, "model")).toBe("model");
  expect(plural(0, "model")).toBe("models");
  expect(plural(2, "match", "matches")).toBe("matches");
});

test("parseDiff: pi's exact diff-string format (sign, padded line number, one delimiter space, text)", () => {
  expect(parseDiff("+19 let inFlight: Promise<Token> | null = null;")).toEqual([{ kind: "add", n: 19, text: "let inFlight: Promise<Token> | null = null;" }]);
  expect(parseDiff("-21   if (isExpired(token)) token = await fetchToken();")).toEqual([{ kind: "del", n: 21, text: "  if (isExpired(token)) token = await fetchToken();" }]);
  expect(parseDiff("  5 return token;")).toEqual([{ kind: "ctx", n: 5, text: "return token;" }]); // width-3 padding: two leading spaces before the digit
  expect(parseDiff("   ...")).toEqual([{ kind: "skip", n: undefined, text: "..." }]);
  const multi = parseDiff("+19 a\n 20 b\n-21 c");
  expect(multi.map((l) => [l.kind, l.n])).toEqual([["add", 19], ["ctx", 20], ["del", 21]]);
});
