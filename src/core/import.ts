import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { DefaultPackageManager, getAgentDir, type ProgressEvent, ProjectTrustStore, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { ImportItem, ImportResult, ImportScan } from "#protocol";
import { PI_AGENT_DIR } from "./paths";
import { readModelsFile } from "./providers";
import { writeModelSettings } from "./settings";

const SETTING_KEYS = ["defaultProvider", "defaultModel", "defaultThinkingLevel", "enabledModels"] as const;
const FOLDERS = ["extensions", "skills", "prompts", "themes"];
const TOP_FILES = ["AGENTS.md", "SYSTEM.md", "APPEND_SYSTEM.md"];

function json(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

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
      let kind: "dir" | "file" | undefined = e.isDirectory() ? "dir" : e.isFile() ? "file" : undefined;
      if (e.isSymbolicLink()) {
        try {
          const st = statSync(full);
          kind = st.isDirectory() ? "dir" : st.isFile() ? "file" : undefined;
        } catch {
          kind = undefined; // a broken link
        }
      }
      if (kind === "dir") walk(full);
      if (kind === "file") out.push(relative(PI_AGENT_DIR, full));
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

function resourceFiles(deps = new Set<string>()) {
  return [...FOLDERS.flatMap((f) => filesIn(f, deps)), ...TOP_FILES.filter((f) => existsSync(join(PI_AGENT_DIR, f)))];
}
type PackageEntry = string | ({ source: string } & Record<string, unknown>);

/** pi's global packages, with a local path made absolute (pi wrote it relative to ~/.pi/agent). Bad entries are skipped. */
function piPackages(): PackageEntry[] {
  const list = json(join(PI_AGENT_DIR, "settings.json")).packages;
  if (!Array.isArray(list)) return [];
  const local = (s: string) => !/^(npm:|git:|https?:\/\/)/.test(s) && !isAbsolute(s);
  const fix = (s: string) => (local(s) ? resolve(PI_AGENT_DIR, s) : s);
  return list.flatMap((p): PackageEntry[] =>
    typeof p === "string" && p ? [fix(p)] : p && typeof p === "object" && typeof (p as { source?: unknown }).source === "string" ? [{ ...(p as object), source: fix((p as { source: string }).source) }] : [],
  );
}
const sourceOf = (p: PackageEntry) => (typeof p === "string" ? p : p.source);

/** Board 5c: what terminal pi has that Loomden can take. Reads ~/.pi/agent; changes nothing there. */
export function scanImport(): ImportScan {
  const settings = json(join(PI_AGENT_DIR, "settings.json"));
  const keys = Object.keys(json(join(PI_AGENT_DIR, "auth.json")));
  const providers = Object.keys((json(join(PI_AGENT_DIR, "models.json")).providers as object) ?? {});
  const trust = Object.keys(json(join(PI_AGENT_DIR, "trust.json")));
  const files = resourceFiles();
  const packages = piPackages();
  const settingCount = SETTING_KEYS.filter((k) => settings[k] !== undefined).length;
  const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  return {
    found: existsSync(PI_AGENT_DIR),
    items: [
      // Loomden already uses pi's auth.json, so keys are linked from the start.
      { id: "keys", label: "Keys and logins", action: "Linked", detail: n(keys.length, "provider"), count: keys.length, done: true },
      { id: "settings", label: "Default model, thinking, favorites", action: "Copy settings.json", detail: n(settingCount, "setting"), count: settingCount },
      { id: "providers", label: "Custom providers", action: "Copy", detail: n(providers.length, "provider"), count: providers.length },
      { id: "trust", label: "Trust decisions", action: "Copy", detail: n(trust.length, "project"), count: trust.length },
      { id: "files", label: "Extensions, skills, prompts, AGENTS.md", action: "Copy", detail: n(files.length, "file"), count: files.length },
      { id: "packages", label: "Global packages", action: "Install again", detail: n(packages.length, "package"), count: packages.length },
    ],
  };
}

/** Items that bring code into Loomden: they need the confirmation in main's own dialog. */
export const codeItems: ImportItem[] = ["files", "packages"];

/** Board 5d: import the picked items, one result for each. A failure in one item does not stop the others. */
export async function runImport(items: ImportItem[], onPackage: (e: ProgressEvent) => void): Promise<ImportResult[]> {
  const loomden = getAgentDir();
  const results: ImportResult[] = [];
  const step = async (id: ImportItem, run: () => Promise<Omit<ImportResult, "id">> | Omit<ImportResult, "id">) => {
    if (!items.includes(id)) return;
    try {
      results.push({ id, ...(await run()) });
    } catch (e) {
      results.push({ id, status: "failed", detail: (e as Error).message, errors: [] });
    }
  };

  await step("settings", () => {
    const s = json(join(PI_AGENT_DIR, "settings.json"));
    const errors: string[] = [];
    let copied = 0;
    for (const k of SETTING_KEYS.filter((k) => s[k] !== undefined)) {
      try {
        writeModelSettings({ [k]: s[k] }); // one by one: a value Loomden refuses does not stop the others
        copied++;
      } catch (e) {
        errors.push(`${k}: ${(e as Error).message}`);
      }
    }
    return { status: errors.length ? (copied ? "partial" : "failed") : "done", detail: `copied · ${copied} ${copied === 1 ? "setting" : "settings"}`, errors };
  });

  await step("providers", () => {
    const theirs = (json(join(PI_AGENT_DIR, "models.json")).providers ?? {}) as Record<string, unknown>;
    const file = join(loomden, "models.json");
    const ours: { providers?: Record<string, unknown> } = readModelsFile(); // throws on a file it cannot read: nothing is lost
    const added = Object.keys(theirs).filter((k) => !ours.providers?.[k]); // Loomden's own entries win
    ours.providers = { ...ours.providers, ...Object.fromEntries(added.map((k) => [k, theirs[k]])) };
    mkdirSync(loomden, { recursive: true });
    writeFileSync(file, `${JSON.stringify(ours, null, 2)}\n`, { mode: 0o600 });
    chmodSync(file, 0o600); // it can hold keys
    return { status: "done", detail: `copied · ${added.length} ${added.length === 1 ? "provider" : "providers"}`, errors: [] };
  });

  await step("trust", () => {
    const theirs = json(join(PI_AGENT_DIR, "trust.json"));
    const ours = json(join(loomden, "trust.json"));
    // Loomden's own decision wins: an import never turns "do not trust" into "trust" (that would run the project's code).
    const updates = Object.entries(theirs)
      .filter(([path, v]) => (v === true || v === false) && !(path in ours))
      .map(([path, decision]) => ({ path, decision: decision as boolean }));
    new ProjectTrustStore(loomden).setMany(updates);
    return { status: "done", detail: `copied · ${updates.length} ${updates.length === 1 ? "project" : "projects"}`, errors: [] };
  });

  await step("files", () => {
    const deps = new Set<string>();
    const files = resourceFiles(deps);
    const errors: string[] = [];
    // Not an error: a retry would not change it. A note the user acts on.
    const notes = [...deps].map((d) => `${d}: has dependencies (node_modules) that were not copied — run npm install there`);
    let copied = 0;
    for (const f of files) {
      const to = join(loomden, f);
      if (existsSync(to)) continue; // Loomden's own file wins
      try {
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(join(PI_AGENT_DIR, f), to);
        copied++;
      } catch (e) {
        errors.push(`${f}: ${(e as NodeJS.ErrnoException).code === "EACCES" ? "permission denied" : (e as Error).message}`);
      }
    }
    return { status: errors.length ? "partial" : "done", detail: `${copied} of ${files.length} copied`, errors, notes };
  });

  await step("packages", async () => {
    const pm = new DefaultPackageManager({ cwd: loomden, agentDir: loomden, settingsManager: SettingsManager.create(loomden, loomden) });
    pm.setProgressCallback(onPackage);
    const errors: string[] = [];
    const all = piPackages();
    const filtered: Extract<PackageEntry, object>[] = [];
    for (const entry of all) {
      const source = sourceOf(entry);
      try {
        await pm.installAndPersist(source);
        if (typeof entry !== "string") filtered.push(entry);
      } catch (e) {
        errors.push(`${source}: ${(e as Error).message}`);
      }
    }
    // Keep pi's filters (which extensions, skills… load): the installs saved only the sources. One pass after all of
    // them, because each install writes the whole list from memory. pi saves a local path relative to Loomden's folder.
    if (filtered.length) {
      const path = join(loomden, "settings.json");
      const s = json(path);
      const same = (saved: string, source: string) => saved === source || (!/^(npm:|git:|https?:\/\/)/.test(saved) && resolve(loomden, saved) === resolve(source));
      if (Array.isArray(s.packages)) {
        s.packages = s.packages.map((p) => {
          const hit = typeof p === "string" && filtered.find((f) => same(p, f.source));
          return hit ? { ...hit, source: p } : p;
        });
        writeFileSync(path, `${JSON.stringify(s, null, 2)}\n`);
      }
    }
    const ok = all.length - errors.length;
    return { status: errors.length ? (ok ? "partial" : "failed") : "done", detail: `${ok} of ${all.length} installed`, errors };
  });

  return results;
}

