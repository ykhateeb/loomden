import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ModelSettings } from "#protocol";

export const MODEL_SETTING_KEYS = ["defaultProvider", "defaultModel", "defaultThinkingLevel", "enabledModels"] as const;

/** Global: Tenon's pi folder. Project: the project's own .pi folder (project settings win over global ones). */
export const settingsFile = (cwd?: string) => (cwd ? join(cwd, ".pi", "settings.json") : join(getAgentDir(), "settings.json"));

/** A JSON object file; a missing or broken file reads as {}. */
export function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

/** Board 5: the model settings of one file (not merged: the page edits one file at a time). */
export function readModelSettings(cwd?: string): ModelSettings {
  const s = readJson(settingsFile(cwd));
  return Object.fromEntries(MODEL_SETTING_KEYS.map((k) => [k, s[k]])) as ModelSettings;
}

const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const valid: Record<(typeof MODEL_SETTING_KEYS)[number], (v: unknown) => boolean> = {
  defaultProvider: (v) => typeof v === "string" && /^[\w.-]{1,64}$/.test(v),
  defaultModel: (v) => typeof v === "string" && v.length > 0 && v.length <= 200,
  defaultThinkingLevel: (v) => typeof v === "string" && LEVELS.includes(v),
  enabledModels: (v) => Array.isArray(v) && v.length <= 50 && v.every((x) => typeof x === "string" && x.length > 0 && x.length <= 200),
};

/**
 * Change only these keys and keep the rest of the file. `null` removes a key (the other scope then decides).
 * The window is not trusted: a value of the wrong shape is refused, not written.
 */
export function writeModelSettings(patch: Partial<Record<keyof ModelSettings, unknown>>, cwd?: string) {
  const path = settingsFile(cwd);
  const s = readJson(path);
  for (const k of MODEL_SETTING_KEYS) {
    if (!(k in patch)) continue;
    if (patch[k] === null) delete s[k];
    else if (valid[k](patch[k])) s[k] = patch[k];
    else throw new Error(`Not a valid ${k}`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(s, null, 2)}\n`);
  return readModelSettings(cwd);
}
