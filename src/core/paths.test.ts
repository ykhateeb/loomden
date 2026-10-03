import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { TENON_AGENT_DIR, exportFile, revealPath } from "./paths";

test("an export id makes a temporary HTML path, and nothing else does", () => {
  const id = "0b7c3f6e-2a41-4d8e-9c55-1f2e3d4c5b6a";
  expect(exportFile(id)).toBe(join(tmpdir(), `tenon-export-${id}.html`));
  for (const bad of [undefined, "", "../../.zshrc", `${id}/../x`, 42]) expect(() => exportFile(bad)).toThrow("Not a Tenon export");
});

test("only a folder or a Tenon session file can be shown in the folder", () => {
  const dir = mkdtempSync(join(tmpdir(), "tenon-paths-"));
  const file = join(dir, "notes.txt");
  writeFileSync(file, "");
  const session = join(TENON_AGENT_DIR, "sessions", "p", "s.jsonl");
  expect(revealPath(dir)).toBe(dir);
  expect(revealPath(session)).toBe(session);
  for (const bad of [undefined, "", 42, file, join(dir, "missing")]) expect(() => revealPath(bad)).toThrow("Not a Tenon session file");
});
