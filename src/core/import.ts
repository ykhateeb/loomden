import { copyFileSync, type Dirent, existsSync, mkdirSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { getAgentDir, type ProgressEvent, ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import type { ImportItem, ImportResult, ImportScan } from "#protocol";
import { manager } from "./packages";
import { PI_AGENT_DIR } from "./paths";
import { readModelsFile, writeModelsFile } from "./providers";
import { MODEL_SETTING_KEYS, readJson, writeJson, writeModelSettings } from "./settings";

const FOLDERS = ["extensions", "skills", "prompts", "themes"];
const TOP_FILES = ["AGENTS.md", "SYSTEM.md", "APPEND_SYSTEM.md"];
/** A package source that is not a local path. */
const REMOTE_SOURCE = /^(npm:|git:|https?:\/\/)/;

/** "1 file", "3 files". */
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * Every file under a folder, as paths relative to pi's folder. Symlinks are followed (a linked dev checkout is
 * common). node_modules is not copied: `deps` gets the folders that have one, so the result can say so.
 */
function filesIn(folder: string, deps: Set<string>): string[] {
  const root = join(PI_AGENT_DIR, folder);
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (dir: string) => {
    let real: string;
    try {
      real = realpathSync(dir);
    } catch {
      return;
    }
    if (seen.has(real)) return; // a link loop
    seen.add(real);
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      if (e.name === "node_modules") {
        deps.add(relative(PI_AGENT_DIR, dir) || folder);
        continue;
      }
      const kind = kindOf(e, full);
      if (kind === "dir") walk(full);
      if (kind === "file") out.push(relative(PI_AGENT_DIR, full));
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

/** A folder or a file; a link counts as what it points to. undefined: a broken link, or something else. */
function kindOf(entry: Dirent, full: string): "dir" | "file" | undefined {
  if (!entry.isSymbolicLink()) return entry.isDirectory() ? "dir" : entry.isFile() ? "file" : undefined;
  try {
    const target = statSync(full);
    return target.isDirectory() ? "dir" : target.isFile() ? "file" : undefined;
  } catch {
    return undefined; // a broken link
  }
}

function resourceFiles(deps = new Set<string>()) {
  return [...FOLDERS.flatMap((f) => filesIn(f, deps)), ...TOP_FILES.filter((f) => existsSync(join(PI_AGENT_DIR, f)))];
}
type PackageEntry = string | ({ source: string } & Record<string, unknown>);

/** pi's global packages, with a local path made absolute (pi wrote it relative to ~/.pi/agent). Bad entries are skipped. */
function piPackages(): PackageEntry[] {
  const list = readJson(join(PI_AGENT_DIR, "settings.json")).packages;
  if (!Array.isArray(list)) return [];
  const local = (s: string) => !REMOTE_SOURCE.test(s) && !isAbsolute(s);
  const fix = (s: string) => (local(s) ? resolve(PI_AGENT_DIR, s) : s);
  return list.flatMap((p): PackageEntry[] => {
    if (typeof p === "string" && p) return [fix(p)];
    if (isSourceEntry(p)) return [{ ...p, source: fix(p.source) }];
    return [];
  });
}

/** A package entry with filters: an object with a source. */
function isSourceEntry(p: unknown): p is { source: string } & Record<string, unknown> {
  return !!p && typeof p === "object" && typeof (p as { source?: unknown }).source === "string";
}
const sourceOf = (p: PackageEntry) => (typeof p === "string" ? p : p.source);

/** Board 5c: what terminal pi has that Tenon can take. Reads ~/.pi/agent; changes nothing there. */
export function scanImport(): ImportScan {
  const settings = readJson(join(PI_AGENT_DIR, "settings.json"));
  const keys = Object.keys(readJson(join(PI_AGENT_DIR, "auth.json")));
  const providers = Object.keys((readJson(join(PI_AGENT_DIR, "models.json")).providers as object) ?? {});
  const trust = Object.keys(readJson(join(PI_AGENT_DIR, "trust.json")));
  const files = resourceFiles();
  const packages = piPackages();
  const settingCount = MODEL_SETTING_KEYS.filter((k) => settings[k] !== undefined).length;
  return {
    found: existsSync(PI_AGENT_DIR),
    items: [
      // Tenon already uses pi's auth.json, so keys are linked from the start.
      { id: "keys", label: "Keys and logins", action: "Linked", detail: plural(keys.length, "provider"), count: keys.length, done: true },
      { id: "settings", label: "Default model, thinking, favorites", action: "Copy settings.json", detail: plural(settingCount, "setting"), count: settingCount },
      { id: "providers", label: "Custom providers", action: "Copy", detail: plural(providers.length, "provider"), count: providers.length },
      { id: "trust", label: "Trust decisions", action: "Copy", detail: plural(trust.length, "project"), count: trust.length },
      { id: "files", label: "Extensions, skills, prompts, AGENTS.md", action: "Copy", detail: plural(files.length, "file"), count: files.length },
      { id: "packages", label: "Global packages", action: "Install again", detail: plural(packages.length, "package"), count: packages.length },
    ],
  };
}

/** Board 5d: import the picked items, and give one result for each. A failure in one item does not stop the others. */
export async function runImport(items: ImportItem[], { onPackage, onResult }: { onPackage: (e: ProgressEvent) => void; onResult: (r: ImportResult) => void }): Promise<void> {
  const tenonAgentDir = getAgentDir();
  const steps: Record<Exclude<ImportItem, "keys">, () => Outcome | Promise<Outcome>> = {
    settings: importSettings,
    providers: importProviders,
    trust: () => importTrust(tenonAgentDir),
    files: () => importFiles(tenonAgentDir),
    packages: () => importPackages(tenonAgentDir, onPackage),
  };
  for (const id of IMPORT_ORDER) if (items.includes(id)) onResult(await runStep(id, steps[id]));
}

type Outcome = Omit<ImportResult, "id">;

/** The items in the order they import. Keys need no import: Tenon shares pi's auth.json. */
const IMPORT_ORDER = ["settings", "providers", "trust", "files", "packages"] as const;

async function runStep(id: ImportItem, run: () => Outcome | Promise<Outcome>): Promise<ImportResult> {
  try {
    return { id, ...(await run()) };
  } catch (e) {
    return { id, status: "failed", detail: (e as Error).message, errors: [] };
  }
}

/** "done" with no errors, "failed" with nothing done, else "partial". */
function statusOf(errors: readonly string[], done: number): ImportResult["status"] {
  if (!errors.length) return "done";
  return done ? "partial" : "failed";
}

function importSettings(): Outcome {
  const s = readJson(join(PI_AGENT_DIR, "settings.json"));
  const errors: string[] = [];
  let copied = 0;
  for (const k of MODEL_SETTING_KEYS.filter((k) => s[k] !== undefined)) {
    try {
      writeModelSettings({ [k]: s[k] }); // one by one: a value Tenon refuses does not stop the others
      copied++;
    } catch (e) {
      errors.push(`${k}: ${(e as Error).message}`);
    }
  }
  return { status: statusOf(errors, copied), detail: `copied · ${plural(copied, "setting")}`, errors };
}

function importProviders(): Outcome {
  const theirs = (readJson(join(PI_AGENT_DIR, "models.json")).providers ?? {}) as Record<string, Record<string, unknown>>; // pi's models.json: providers by id
  const ours = readModelsFile(); // throws on a file it cannot read: nothing is lost
  const added = Object.keys(theirs).filter((k) => !ours.providers?.[k]); // Tenon's own entries win
  writeModelsFile({ ...ours, providers: { ...ours.providers, ...Object.fromEntries(added.map((k) => [k, theirs[k]])) } });
  return { status: "done", detail: `copied · ${plural(added.length, "provider")}`, errors: [] };
}

function importTrust(tenonAgentDir: string): Outcome {
  const updates = newTrust(readJson(join(PI_AGENT_DIR, "trust.json")), readJson(join(tenonAgentDir, "trust.json")));
  new ProjectTrustStore(tenonAgentDir).setMany(updates);
  return { status: "done", detail: `copied · ${plural(updates.length, "project")}`, errors: [] };
}

/** pi's trust decisions that Tenon has no decision for. Tenon's own decision wins: an import never turns "do not trust" into "trust" (that would run the project's code). */
export function newTrust(theirs: Readonly<Record<string, unknown>>, ours: Readonly<Record<string, unknown>>): { path: string; decision: boolean }[] {
  return Object.entries(theirs)
    .filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean" && !(entry[0] in ours))
    .map(([path, decision]) => ({ path, decision }));
}

function importFiles(tenonAgentDir: string): Outcome {
  const deps = new Set<string>();
  const files = resourceFiles(deps);
  const errors: string[] = [];
  // Not an error: a retry would not change it. A note the user acts on.
  const notes = [...deps].map((d) => `${d}: has dependencies (node_modules) that were not copied — run npm install there`);
  let copied = 0;
  for (const f of files) {
    const to = join(tenonAgentDir, f);
    if (existsSync(to)) continue; // Tenon's own file wins
    try {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(join(PI_AGENT_DIR, f), to);
      copied++;
    } catch (e) {
      errors.push(`${f}: ${(e as NodeJS.ErrnoException).code === "EACCES" ? "permission denied" : (e as Error).message}`);
    }
  }
  return { status: errors.length ? "partial" : "done", detail: `${copied} of ${files.length} copied`, errors, notes };
}

async function importPackages(tenonAgentDir: string, onPackage: (e: ProgressEvent) => void): Promise<Outcome> {
  const pm = manager(tenonAgentDir);
  pm.setProgressCallback(onPackage);
  const errors: string[] = [];
  const all = piPackages();
  const entriesWithFilters: Extract<PackageEntry, object>[] = [];
  for (const entry of all) {
    const source = sourceOf(entry);
    try {
      await pm.installAndPersist(source);
      if (typeof entry !== "string") entriesWithFilters.push(entry);
    } catch (e) {
      errors.push(`${source}: ${(e as Error).message}`);
    }
  }
  // Keep pi's filters (which extensions, skills… load): the installs saved only the sources. One pass after all of
  // them, because each install writes the whole list from memory.
  const path = join(tenonAgentDir, "settings.json");
  const settings = readJson(path);
  if (entriesWithFilters.length && Array.isArray(settings.packages))
    writeJson(path, { ...settings, packages: restoreFilters(settings.packages, entriesWithFilters, tenonAgentDir) });
  const installed = all.length - errors.length;
  return { status: statusOf(errors, installed), detail: `${installed} of ${all.length} installed`, errors };
}

/** Saved package entries with pi's filters back on them. pi saves a local path relative to Tenon's folder. */
export function restoreFilters(saved: readonly unknown[], entriesWithFilters: readonly Extract<PackageEntry, object>[], tenonAgentDir: string): unknown[] {
  const same = (savedSource: string, source: string) => savedSource === source || (!REMOTE_SOURCE.test(savedSource) && resolve(tenonAgentDir, savedSource) === resolve(source));
  return saved.map((p) => {
    const hit = typeof p === "string" && entriesWithFilters.find((f) => same(p, f.source));
    return hit ? { ...hit, source: p } : p;
  });
}
