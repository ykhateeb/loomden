import type { ModelSettings, ProviderRow } from "#protocol";

/** Providers that the page always shows, even when they are not connected. */
const MAIN = ["anthropic", "openai", "google", "openrouter"];

/** The settings that apply: each value set in `own` wins over the global one. */
export function effectiveSettings(global: ModelSettings, own: ModelSettings): ModelSettings {
  return { ...global, ...Object.fromEntries(Object.entries(own).filter(([, v]) => v !== undefined)) };
}

/** Splits the providers into the rows to show and the rest. `more` shows all of them. */
export function splitProviders(providers: ProviderRow[], more: boolean) {
  const shown = providers.filter((p) => more || p.configured || MAIN.includes(p.id) || p.custom);
  const rest = providers.filter((p) => !shown.includes(p));
  return { shown, rest };
}
