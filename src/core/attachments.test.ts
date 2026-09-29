import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { isImage, readImage, searchFiles } from "./attachments";
import { grant } from "./grants";

test("@ search: name starts, then name contains, then path; skips node_modules", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tau-files-"));
  for (const f of ["src/auth/refresh.ts", "src/auth/refresh.test.ts", "docs/auth.md", "src/prefresh.ts", "node_modules/x/refresh.js"]) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    writeFileSync(join(dir, f), "");
  }
  expect(await searchFiles(dir, "refresh")).toEqual(["src/auth/refresh.ts", "src/auth/refresh.test.ts", "src/prefresh.ts"]);
  expect(await searchFiles(dir, "auth/")).toEqual(["src/auth/refresh.ts", "src/auth/refresh.test.ts"]);
});

test("only images are read as images", async () => {
  expect(isImage("a.PNG")).toBe(true);
  expect(isImage("a.txt")).toBe(false);
  await expect(readImage("/etc/hosts")).rejects.toThrow("Not a file you picked"); // the window cannot name any file
  grant("file", "/etc/hosts");
  await expect(readImage("/etc/hosts")).rejects.toThrow("Not an image");
});
