import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

test("a session's settings hide packages that are not installed, and keep the rest", async () => {
  const root = mkdtempSync(join(tmpdir(), "loomden-missing-"));
  const agent = join(root, "agent");
  const local = join(root, "pkg");
  mkdirSync(join(local, "extensions"), { recursive: true });
  writeFileSync(join(local, "package.json"), "{}");
  mkdirSync(agent, { recursive: true });
  writeFileSync(join(agent, "settings.json"), JSON.stringify({ defaultModel: "m", packages: [local, "npm:not-installed@1.0.0", join(root, "gone")] }));
  process.env.PI_CODING_AGENT_DIR = agent;
  vi.resetModules();
  const { settingsWithoutMissing } = await import("./packages");
  const { settingsManager, missing } = settingsWithoutMissing(root);
  expect(missing.sort()).toEqual([join(root, "gone"), "npm:not-installed@1.0.0"].sort());
  expect(settingsManager.getGlobalSettings().packages).toEqual([local]);
  expect(settingsManager.getGlobalSettings().defaultModel).toBe("m");
});

test("the check runs on each read: a package installed later is no longer hidden", async () => {
  const root = mkdtempSync(join(tmpdir(), "loomden-missing2-"));
  const agent = join(root, "agent");
  const later = join(root, "later-pkg");
  mkdirSync(agent, { recursive: true });
  writeFileSync(join(agent, "settings.json"), JSON.stringify({ packages: [later] }));
  process.env.PI_CODING_AGENT_DIR = agent;
  vi.resetModules();
  const { settingsWithoutMissing } = await import("./packages");
  const { settingsManager, missing } = settingsWithoutMissing(root);
  expect(missing).toEqual([later]);
  expect(settingsManager.getGlobalSettings().packages).toEqual([]);
  mkdirSync(later); // "installed" now (a local package is its folder)
  expect(settingsManager.getGlobalSettings().packages).toEqual([later]);
});
