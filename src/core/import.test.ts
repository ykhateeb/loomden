import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

test("import from pi: scan, then copy settings, providers, trust and files; one unreadable file is reported", async () => {
  const root = mkdtempSync(join(tmpdir(), "loomden-import-"));
  const pi = join(root, "pi");
  const loomden = join(root, "loomden");
  process.env.TENON_PI_DIR = pi;
  process.env.PI_CODING_AGENT_DIR = loomden;
  const w = (path: string, body: string) => (mkdirSync(join(path, ".."), { recursive: true }), writeFileSync(path, body));
  w(join(pi, "settings.json"), JSON.stringify({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-5", theme: "dark", packages: ["npm:a", "npm:b"] }));
  w(join(pi, "auth.json"), JSON.stringify({ anthropic: { type: "api_key", key: "secret" } }));
  w(join(pi, "models.json"), JSON.stringify({ providers: { ollama: { baseUrl: "http://localhost:11434/v1" } } }));
  w(join(pi, "trust.json"), JSON.stringify({ "/code/app": true, "/code/other": false, "/code/ask": null }));
  w(join(pi, "extensions", "gate.ts"), "export default () => {}");
  w(join(pi, "prompts", "review.md"), "review");
  w(join(pi, "AGENTS.md"), "rules");
  chmodSync(join(pi, "prompts", "review.md"), 0o000);

  vi.resetModules(); // paths.ts reads the folders from the environment when it loads
  const { scanImport, runImport } = await import("./import");
  const scan = scanImport();
  expect(scan.items.map((i) => [i.id, i.count])).toEqual([["keys", 1], ["settings", 2], ["providers", 1], ["trust", 3], ["files", 3], ["packages", 2]]);
  expect(JSON.stringify(scan)).not.toContain("secret"); // only names leave pi's auth.json

  const results = await runImport(["settings", "providers", "trust", "files"], () => {});
  expect(results.map((r) => [r.id, r.status])).toEqual([["settings", "done"], ["providers", "done"], ["trust", "done"], ["files", "partial"]]);
  expect(results[3].errors).toEqual(["prompts/review.md: permission denied"]);
  expect(JSON.parse(readFileSync(join(loomden, "settings.json"), "utf8"))).toEqual({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-5" });
  expect(JSON.parse(readFileSync(join(loomden, "trust.json"), "utf8"))).toEqual({ "/code/app": true, "/code/other": false });
  expect(existsSync(join(loomden, "extensions", "gate.ts")) && existsSync(join(loomden, "AGENTS.md"))).toBe(true);
  expect(readFileSync(join(pi, "settings.json"), "utf8")).toContain("npm:a"); // pi's folder is not changed
  chmodSync(join(pi, "prompts", "review.md"), 0o644);
});

test("import from pi: symlinks followed, node_modules noted, Tenon's trust wins, bad package entries skipped", async () => {
  const root = mkdtempSync(join(tmpdir(), "loomden-import2-"));
  const pi = join(root, "pi");
  const loomden = join(root, "loomden");
  const dev = join(root, "dev-ext");
  process.env.TENON_PI_DIR = pi;
  process.env.PI_CODING_AGENT_DIR = loomden;
  const w = (path: string, body: string) => (mkdirSync(join(path, ".."), { recursive: true }), writeFileSync(path, body));
  w(join(dev, "index.ts"), "export default () => {}");
  w(join(dev, "node_modules", "dep", "index.js"), "");
  mkdirSync(join(pi, "extensions"), { recursive: true });
  symlinkSync(dev, join(pi, "extensions", "linked"));
  w(join(pi, "trust.json"), JSON.stringify({ "/code/app": true, "/code/new": true }));
  w(join(loomden, "trust.json"), JSON.stringify({ "/code/app": false }));
  w(join(pi, "settings.json"), JSON.stringify({ packages: [null, 42, "./local-pkg", { source: "npm:x", extensions: [] }] }));

  vi.resetModules();
  const { scanImport, runImport } = await import("./import");
  expect(scanImport().items.find((i) => i.id === "packages")?.count).toBe(2); // null and 42 skipped, no throw
  const [trust, files] = await runImport(["trust", "files"], () => {});
  expect(JSON.parse(readFileSync(join(loomden, "trust.json"), "utf8"))).toEqual({ "/code/app": false, "/code/new": true });
  expect(trust.status).toBe("done");
  expect(existsSync(join(loomden, "extensions", "linked", "index.ts"))).toBe(true);
  expect(files.status).toBe("done"); // a note, not a failure: a retry would not change it
  expect(files.notes?.[0]).toContain("run npm install there");
});

test("import keeps the filters of every filtered package, local paths too", async () => {
  const root = mkdtempSync(join(tmpdir(), "loomden-import3-"));
  const pi = join(root, "pi");
  const loomden = join(root, "loomden");
  process.env.TENON_PI_DIR = pi;
  process.env.PI_CODING_AGENT_DIR = loomden;
  for (const name of ["a", "b"]) {
    mkdirSync(join(pi, name, "extensions"), { recursive: true });
    writeFileSync(join(pi, name, "package.json"), "{}");
  }
  mkdirSync(loomden, { recursive: true });
  writeFileSync(join(pi, "settings.json"), JSON.stringify({ packages: [{ source: "./a", extensions: [] }, { source: "./b", skills: [] }] }));
  vi.resetModules();
  const { runImport } = await import("./import");
  const [packages] = await runImport(["packages"], () => {});
  expect(packages.status).toBe("done");
  const saved = JSON.parse(readFileSync(join(loomden, "settings.json"), "utf8")).packages;
  expect(saved).toHaveLength(2);
  expect(saved.map((p: { extensions?: unknown; skills?: unknown }) => [p.extensions, p.skills])).toEqual([[[], undefined], [undefined, []]]);
});
