import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readModelSettings, writeModelSettings } from "./settings";

test("project settings: change only the model keys, keep the rest, null removes, bad values refused", () => {
  const cwd = mkdtempSync(join(tmpdir(), "tenon-settings-"));
  mkdirSync(join(cwd, ".pi"));
  writeFileSync(join(cwd, ".pi", "settings.json"), JSON.stringify({ packages: ["npm:x"], defaultModel: "old" }));
  writeModelSettings({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-5", enabledModels: ["anthropic/*"] }, cwd);
  expect(readModelSettings(cwd)).toEqual({
    defaultProvider: "anthropic",
    defaultModel: "claude-sonnet-5",
    defaultThinkingLevel: undefined,
    enabledModels: ["anthropic/*"],
  });
  writeModelSettings({ defaultModel: null }, cwd);
  expect(JSON.parse(readFileSync(join(cwd, ".pi", "settings.json"), "utf8"))).toEqual({ packages: ["npm:x"], defaultProvider: "anthropic", enabledModels: ["anthropic/*"] });
  expect(() => writeModelSettings({ defaultThinkingLevel: "ultra" }, cwd)).toThrow("Not a valid defaultThinkingLevel");
  expect(() => writeModelSettings({ enabledModels: "anthropic/*" }, cwd)).toThrow();
  expect(readModelSettings(cwd).defaultThinkingLevel).toBeUndefined();
});
