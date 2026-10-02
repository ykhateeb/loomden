import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { copyToFolder, folderCopyPath } from "./move";

test("a moved session keeps its file name and entries; only the header's cwd changes", () => {
  const root = mkdtempSync(join(tmpdir(), "tenon-move-"));
  const from = join(root, "2026-09-29T18-02-00_abc.jsonl");
  const entry = JSON.stringify({ type: "message", id: "a", parentId: null, message: { role: "user", content: "hi" } });
  writeFileSync(from, `${JSON.stringify({ type: "session", version: 3, id: "abc", cwd: "/old" })}\n${entry}\n`);

  const to = folderCopyPath(from, mkdtempSync(join(root, "dir-")));
  copyToFolder({ from, to, cwd: "/code/mobile-app" });
  const [header, ...rest] = readFileSync(to, "utf8").split("\n");
  expect(to.endsWith("2026-09-29T18-02-00_abc.jsonl")).toBe(true);
  expect(JSON.parse(header)).toEqual({ type: "session", version: 3, id: "abc", cwd: "/code/mobile-app" });
  expect(rest).toEqual([entry, ""]);
  expect(() => copyToFolder({ from, to, cwd: "/x" })).toThrow(); // never overwrites
});
