import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { SessionRow } from "#protocol";
import { searchSessions, snippet } from "./search";

test("snippet: words around the match, marked", () => {
  expect(snippet("The refresh test fails about 1 in 5 runs on CI.", "REFRESH")).toEqual(["The ", "refresh", " test fails about 1 in 5 runs on CI."]);
  const long = `${"word ".repeat(30)}refresh ${"tail ".repeat(40)}`;
  const [before, hit, after] = snippet(long, "refresh")!;
  expect(before.startsWith("…word")).toBe(true);
  expect(hit).toBe("refresh");
  expect(after.endsWith("…")).toBe(true);
});

test("search: title counts, messages give lines, other sessions skipped without a read", () => {
  const dir = mkdtempSync(join(tmpdir(), "tenon-search-"));
  const file = join(dir, "a.jsonl");
  const line = (o: object) => JSON.stringify(o);
  writeFileSync(
    file,
    [
      line({ type: "session", version: 3, id: "s", timestamp: "2026-09-29T00:00:00Z", cwd: "/p" }),
      line({ type: "message", id: "a", parentId: null, timestamp: "2026-09-29T00:00:01Z", message: { role: "user", content: "Fix the refresh test", timestamp: 1 } }),
      line({ type: "message", id: "b", parentId: "a", timestamp: "2026-09-29T00:00:02Z", message: { role: "assistant", content: [{ type: "text", text: "I'll share one in-flight refresh." }], timestamp: 2 } }),
    ].join("\n"),
  );
  const row = (path: string, title: string, text: string): SessionRow => ({ path, cwd: "/p", title, text, modified: 0, messageCount: 2, id: "s", branches: 1 });
  const results = searchSessions([row(file, "Token refresh", "Fix the refresh test I'll share one in-flight refresh."), row("/missing.jsonl", "Other", "nothing here")], "refresh", false);
  expect(results).toHaveLength(1);
  expect(results[0].total).toBe(3); // title + 2 messages
  expect(results[0].lines.map((l) => [l.who, l.at])).toEqual([["you", 1], ["pi", 2]]);
  expect(searchSessions([row(file, "Token refresh", "")], "refresh", true)[0].lines).toEqual([]);
});
