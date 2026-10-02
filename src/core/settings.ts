import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/** Write a JSON file, with its folder. */
export function writeJson(path: string, data: unknown): void {
  writeJsonFile(path, data);
}

/** Write a JSON file that can hold a key: only you can read it. */
export function writePrivateJson(path: string, data: unknown): void {
  writeJsonFile(path, data, PRIVATE_FILE_MODE); // a new file is private from the start
  chmodSync(path, PRIVATE_FILE_MODE); // and so is a file that existed with wider permissions
}

const PRIVATE_FILE_MODE = 0o600;

function writeJsonFile(path: string, data: unknown, mode?: number) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, { mode });
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
  writeJson(path, s);
}
