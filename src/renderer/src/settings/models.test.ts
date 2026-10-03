import { expect, test } from "vitest";
import type { ProviderRow } from "#protocol";
import { effectiveSettings, splitProviders } from "./models";

test("a set project value wins over the global one", () => {
  const global = { defaultModel: "a", defaultThinkingLevel: "low" };
  expect(effectiveSettings(global, { defaultModel: "b" })).toEqual({ defaultModel: "b", defaultThinkingLevel: "low" });
});

test("an undefined project value keeps the global one", () => {
  expect(effectiveSettings({ defaultModel: "a" }, { defaultModel: undefined })).toEqual({ defaultModel: "a" });
});

function row(id: string, extra: Partial<ProviderRow> = {}): ProviderRow {
  return { id, name: id, configured: false, subscription: false, canKey: true, canLogin: false, custom: false, models: 0, available: 0, ...extra };
}

test("shows the main, connected, and custom providers, and hides the rest", () => {
  const providers = [row("anthropic"), row("groq", { configured: true }), row("mine", { custom: true }), row("xai")];
  const { shown, rest } = splitProviders(providers, false);
  expect(shown.map((p) => p.id)).toEqual(["anthropic", "groq", "mine"]);
  expect(rest.map((p) => p.id)).toEqual(["xai"]);
});

test("more shows all providers", () => {
  const { shown, rest } = splitProviders([row("xai")], true);
  expect(shown.map((p) => p.id)).toEqual(["xai"]);
  expect(rest).toEqual([]);
});
