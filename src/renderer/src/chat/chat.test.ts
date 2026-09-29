import { expect, test } from "vitest";
import { dayLabel, diffCounts } from "./format";

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
