import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

test("the project list keeps only the folder names of projects.json, and a file with no list reads as no projects", async () => {
  const root = mkdtempSync(join(tmpdir(), "tenon-projects-"));
  process.env.TENON_DIR = root;
  process.env.PI_CODING_AGENT_DIR = join(root, "agent");
  vi.resetModules(); // paths.ts reads the folders from the environment when it loads
  const { listSessions } = await import("./projects");
  const file = join(root, "projects.json");

  writeFileSync(file, JSON.stringify(["/code/a", 1, null, { cwd: "/x" }, "/code/b"]));
  expect((await listSessions()).projects.map((p) => p.cwd)).toEqual(["/code/a", "/code/b"]);

  writeFileSync(file, "null");
  expect((await listSessions()).projects).toEqual([]);
});
