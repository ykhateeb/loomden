import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ModelRuntime } from "@earendil-works/pi-coding-agent";
import { API_KINDS, type CustomProvider, type FoundModel, type LoginMethod, type ModelChoice, type ProviderRow, type Send } from "#protocol";
import type { Dialogs } from "#core/sessions/extension-ui";
import { writePrivateJson } from "./settings";

/** A model list from a server that does not answer is an error, not a wait with no end. */
const FIND_MODELS_TIMEOUT_MS = 8000;
const BASE_URL_RULE = "The base URL must start with http:// or https://";
/** The API version that Anthropic-style servers need on each request. */
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_MODEL_ID = 200;
const MAX_KEY = 4000;

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
// ponytail: module state, one copy per agent process; a factory when tests need a clean copy.
let activeLogin: AbortController | undefined;

/**
 * Board 5 "Add key" and 5b "Log in with a subscription": pi asks through the dialogs in the window and
 * reports links and codes as auth events. pi saves the credential in the shared auth.json itself.
 */
export async function login(rt: ModelRuntime, providerId: string, type: LoginMethod, { send, ask }: { send: Send; ask: Dialogs["ask"] }) {
  activeLogin?.abort();
  const controller = (activeLogin = new AbortController());
  const cancelled = () => new Error("Login cancelled");
  try {
    await rt.login(providerId, type, {
      signal: controller.signal,
      prompt: async (p) => {
        // pi can cancel one prompt (the browser answered before you pasted a code): then its dialog closes too.
        const signal = p.signal ? AbortSignal.any([controller.signal, p.signal]) : controller.signal;
        if (p.type === "select") {
          const label = await ask<string | undefined>({ method: "select", title: p.message, options: p.options.map((o) => o.label) }, undefined, { signal });
          const hit = p.options.find((o) => o.label === label);
          if (!hit) throw cancelled();
          return hit.id;
        }
        const value = await ask<string | undefined>({ method: "input", title: p.message, placeholder: p.placeholder, secret: p.type === "secret" }, undefined, { signal });
        if (value === undefined) throw cancelled();
        return value;
      },
      notify: (event) => send({ type: "auth.event", providerId, event }),
    });
  } finally {
    if (activeLogin === controller) activeLogin = undefined;
    send({ type: "auth.event", providerId, event: { type: "done" } });
  }
}

export function cancelLogin() {
  activeLogin?.abort();
}

const modelsFile = () => join(getAgentDir(), "models.json");

/** A missing file is empty. Any other problem stops the change: a rewrite would drop what Tenon could not read. */
/** models.json can hold keys. */
export function writeModelsFile(data: ReturnType<typeof readModelsFile>): void {
  writePrivateJson(modelsFile(), data);
}

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
  if (!/^https?:\/\//.test(baseUrl)) throw new Error(BASE_URL_RULE);
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  const res = await fetch(url, { headers: authHeaders(api, apiKey), signal: AbortSignal.timeout(FIND_MODELS_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const body = (await res.json()) as { data?: Record<string, unknown>[]; models?: Record<string, unknown>[] };
  return (body.data ?? body.models ?? []).flatMap((m) => {
    const id = typeof m.id === "string" ? m.id : typeof m.name === "string" ? m.name : undefined;
    if (!id) return [];
    const contextWindow = [m.context_length, m.context_window, m.max_model_len, m.max_context_length].find((v): v is number => typeof v === "number");
    return [{ id, contextWindow, embeddings: /embed/i.test(id) }];
  });
}

/** Anthropic-style servers want the key in x-api-key and a version; the others want a Bearer token. */
function authHeaders(api: string, apiKey?: string): Record<string, string> {
  if (api === "anthropic-messages") return { "anthropic-version": ANTHROPIC_VERSION, ...(apiKey ? { "x-api-key": apiKey } : {}) };
  if (apiKey) return { authorization: `Bearer ${apiKey}` };
  return {};
}

/**
 * Board 5a "Add provider": a provider in Tenon's models.json, then pi reads the file again.
 * The window is not trusted: the name, URL, API and model ids are checked.
 */
export async function addCustomProvider(rt: ModelRuntime, p: CustomProvider) {
  validateCustomProvider(p);
  const file = readModelsFile();
  const isOurs = !!file.providers?.[p.name]; // a name already in models.json is ours to change
  if (!isOurs && rt.getProviders().some((x) => x.id === p.name)) throw new Error(`${p.name} is a built-in provider: pick another name`);
  file.providers = { ...file.providers, [p.name]: mergeProvider(file.providers?.[p.name] ?? {}, p) };
  writeModelsFile(file);
  await rt.refresh({ providers: [p.name] });
  const problem = rt.getError();
  if (problem) throw new Error(`pi could not load models.json: ${problem}`);
}

/** The window is not trusted: check the name, the URL, the API, the models and the key of a custom provider. */
export function validateCustomProvider(p: CustomProvider): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,40}$/i.test(p.name)) throw new Error("Use letters, digits, . _ or - for the name");
  if (!/^https?:\/\/[^\s]+$/.test(p.baseUrl)) throw new Error(BASE_URL_RULE);
  if (!(API_KINDS as readonly string[]).includes(p.api)) throw new Error("Pick one of the APIs");
  if (!p.models.length || !p.models.every(hasValidId)) throw new Error("Add at least one model");
  if (!p.models.every(hasValidContextWindow)) throw new Error("A context window must be a whole number");
  if (p.apiKey !== undefined && (typeof p.apiKey !== "string" || p.apiKey.length > MAX_KEY)) throw new Error("Not a valid key");
}

type CustomModel = CustomProvider["models"][number];
const hasValidId = (m: CustomModel) => typeof m.id === "string" && m.id.length > 0 && m.id.length <= MAX_MODEL_ID;
const hasValidContextWindow = (m: CustomModel) => m.contextWindow === undefined || (Number.isInteger(m.contextWindow) && m.contextWindow > 0);

/**
 * The models.json entry of a custom provider. An entry that exists keeps its other fields (headers, compat,
 * overrides, other models), and its key if none is given.
 */
export function mergeProvider(old: Readonly<Record<string, unknown>>, p: CustomProvider): Record<string, unknown> {
  const oldModels = Array.isArray(old.models) ? (old.models as { id: string }[]) : []; // models.json keeps an array of { id }
  const newIds = new Set(p.models.map((m) => m.id));
  return {
    ...old,
    baseUrl: p.baseUrl,
    api: p.api,
    // A keyless local server still needs some key for pi to call it.
    apiKey: p.apiKey?.trim() ? literalKey(p.apiKey.trim()) : (old.apiKey ?? "none"),
    models: [...oldModels.filter((m) => !newIds.has(m.id)), ...p.models.map((m) => ({ id: m.id, ...(m.contextWindow ? { contextWindow: m.contextWindow } : {}) }))],
  };
}
