import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { CustomProvider, FoundModel, ModelChoice, ProviderRow, Send } from "../protocol";
import { ask } from "./sessions/extension-ui";

/** Board 5's table: every provider pi knows, with how it is connected. */
export function listProviders(rt: ModelRuntime): ProviderRow[] {
  const available = rt.getAvailableSnapshot();
  return rt.getProviders().map((p) => {
    const status = rt.getProviderAuthStatus(p.id);
    return {
      id: p.id,
      name: p.name,
      configured: status.configured,
      source: status.source,
      subscription: rt.isUsingSubscription(p.id),
      canKey: !!p.auth.apiKey?.login,
      canLogin: !!p.auth.oauth,
      custom: customIds().has(p.id) || !!rt.getRegisteredProviderConfig(p.id),
      baseUrl: p.baseUrl,
      models: p.getModels().length,
      available: available.filter((m) => m.provider === p.id).length,
    };
  });
}

export const availableModels = (rt: ModelRuntime): ModelChoice[] => rt.getAvailableSnapshot().map((m) => ({ provider: m.provider, id: m.id, name: m.name ?? m.id }));

// One login at a time; Cancel in the window aborts it.
let running: AbortController | undefined;

/**
 * Board 5 "Add key" and 5b "Log in with a subscription": pi asks through the dialogs in the window and
 * reports links and codes as auth events. pi saves the credential in the shared auth.json itself.
 */
export async function login(rt: ModelRuntime, providerId: string, type: "api_key" | "oauth", send: Send) {
  running?.abort();
  const controller = (running = new AbortController());
  const cancelled = () => new Error("Login cancelled");
  try {
    await rt.login(providerId, type, {
      signal: controller.signal,
      prompt: async (p) => {
        // pi can cancel one prompt (the browser answered before you pasted a code): then its dialog closes too.
        const signal = p.signal ? AbortSignal.any([controller.signal, p.signal]) : controller.signal;
        if (p.type === "select") {
          const label = await ask<string | undefined>(send, { method: "select", title: p.message, options: p.options.map((o) => o.label) }, undefined, { signal });
          const hit = p.options.find((o) => o.label === label);
          if (!hit) throw cancelled();
          return hit.id;
        }
        const value = await ask<string | undefined>(send, { method: "input", title: p.message, placeholder: p.placeholder, secret: p.type === "secret" }, undefined, { signal });
        if (value === undefined) throw cancelled();
        return value;
      },
      notify: (event) => send({ type: "auth.event", providerId, event }),
    });
  } finally {
    if (running === controller) running = undefined;
    send({ type: "auth.event", providerId, event: { type: "done" } });
  }
}

export function cancelLogin() {
  running?.abort();
}

export const API_KINDS = ["openai-completions", "openai-responses", "anthropic-messages"] as const;
const modelsFile = () => join(getAgentDir(), "models.json");

/** A missing file is empty. Any other problem stops the change: a rewrite would drop what Tau could not read. */
export function readModelsFile(): { providers?: Record<string, Record<string, unknown>> } {
  let text: string;
  try {
    text = readFileSync(modelsFile(), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Cannot read models.json: ${(e as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("models.json has comments or an error: change it by hand, or remove the comments first");
  }
}

/**
 * pi reads a models.json key as a config value: "!cmd" runs a command, "$NAME" reads the environment.
 * A key the user types is a literal: "$" becomes "$$", and a leading "!" becomes "$!".
 */
export function literalKey(key: string) {
  const escaped = key.replace(/\$/g, "$$$$");
  return escaped.startsWith("!") ? `$${escaped}` : escaped;
}

/** Providers the user added in models.json. */
const customIds = () => new Set(Object.keys(readModelsFile().providers ?? {}));

/** Board 5a "Find models": ask the server which models it has (OpenAI- and Anthropic-style /models lists). */
export async function findModels(baseUrl: string, api: string, apiKey?: string): Promise<FoundModel[]> {
  if (!/^https?:\/\//.test(baseUrl)) throw new Error("The base URL must start with http:// or https://");
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  const headers: Record<string, string> = api === "anthropic-messages" ? { "anthropic-version": "2023-06-01", ...(apiKey ? { "x-api-key": apiKey } : {}) } : apiKey ? { authorization: `Bearer ${apiKey}` } : {};
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const body = (await res.json()) as { data?: Record<string, unknown>[]; models?: Record<string, unknown>[] };
  return (body.data ?? body.models ?? []).flatMap((m) => {
    const id = typeof m.id === "string" ? m.id : typeof m.name === "string" ? m.name : undefined;
    if (!id) return [];
    const ctx = [m.context_length, m.context_window, m.max_model_len, m.max_context_length].find((v) => typeof v === "number") as number | undefined;
    return [{ id, contextWindow: ctx, embeddings: /embed/i.test(id) }];
  });
}

/**
 * Board 5a "Add provider": a provider in Tau's models.json, then pi reads the file again.
 * The window is not trusted: the name, URL, API and model ids are checked.
 */
export async function addCustomProvider(rt: ModelRuntime, p: CustomProvider) {
  if (!/^[a-z0-9][a-z0-9._-]{0,40}$/i.test(p.name)) throw new Error("Use letters, digits, . _ or - for the name");
  if (!/^https?:\/\/[^\s]+$/.test(p.baseUrl)) throw new Error("The base URL must start with http:// or https://");
  if (!(API_KINDS as readonly string[]).includes(p.api)) throw new Error("Pick one of the APIs");
  if (!p.models.length || !p.models.every((m) => typeof m.id === "string" && m.id.length > 0 && m.id.length <= 200)) throw new Error("Add at least one model");
  if (!p.models.every((m) => m.contextWindow === undefined || (Number.isInteger(m.contextWindow) && m.contextWindow > 0))) throw new Error("A context window must be a whole number");
  if (p.apiKey !== undefined && (typeof p.apiKey !== "string" || p.apiKey.length > 4000)) throw new Error("Not a valid key");
  const file = readModelsFile();
  // A name already in models.json is ours to change; any other known provider is built in.
  if (!file.providers?.[p.name] && rt.getProviders().some((x) => x.id === p.name)) throw new Error(`${p.name} is a built-in provider: pick another name`);
  // An entry that exists keeps its other fields (headers, compat, overrides, other models) and its key if none is given.
  const old = file.providers?.[p.name] ?? {};
  const oldModels = Array.isArray(old.models) ? (old.models as { id: string }[]) : [];
  const newIds = new Set(p.models.map((m) => m.id));
  file.providers = {
    ...file.providers,
    [p.name]: {
      ...old,
      baseUrl: p.baseUrl,
      api: p.api,
      // A keyless local server still needs some key for pi to call it.
      apiKey: p.apiKey?.trim() ? literalKey(p.apiKey.trim()) : (old.apiKey ?? "none"),
      models: [...oldModels.filter((m) => !newIds.has(m.id)), ...p.models.map((m) => ({ id: m.id, ...(m.contextWindow ? { contextWindow: m.contextWindow } : {}) }))],
    },
  };
  mkdirSync(getAgentDir(), { recursive: true });
  writeFileSync(modelsFile(), `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  chmodSync(modelsFile(), 0o600); // also for a file that existed with wider permissions: it can hold a key
  await rt.refresh({ providers: [p.name] });
  const problem = rt.getError();
  if (problem) throw new Error(`pi could not load models.json: ${problem}`);
  return listProviders(rt);
}
