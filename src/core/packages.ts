import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, extname } from "node:path";
import { DefaultPackageManager, getAgentDir, ProjectTrustStore, type ProgressEvent, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { GalleryItem, InstalledPackage, Project } from "#protocol";
import { isRecord } from "./settings";

/** The npm search of the gallery: a slow registry is an error, not a wait with no end. */
const GALLERY_TIMEOUT_MS = 8000;

/** pi's package manager for Tenon's agent folder, working in `cwd`. */
export const manager = (cwd: string) => new DefaultPackageManager({ cwd, agentDir: getAgentDir(), settingsManager: SettingsManager.create(cwd, getAgentDir()) });

/** A package source that is not a local path: npm, git, or a URL. */
export function isRemoteSource(source: string) {
  return /^(npm:|git:|https?:\/\/)/.test(source);
}

/** The source of a settings `packages` entry: a string, or an object with filters. */
export function packageSource(p: string | { source: string }) {
  return typeof p === "string" ? p : p.source;
}

/** "npm:pi-prompts-review@1.4.2" → name and version; "git:github.com/me/pi-ext@main" → repo and ref; "./path" → local. */
export function parseSource(source: string): { name: string; version?: string; kind: InstalledPackage["kind"]; where: string } {
  if (source.startsWith("npm:")) {
    const spec = source.slice(4);
    const at = spec.lastIndexOf("@");
    const [name, version] = at > 0 ? [spec.slice(0, at), spec.slice(at + 1)] : [spec, undefined];
    return { name, version, kind: "npm", where: `npm · ${name}` };
  }
  // npm returned above, so a remote source here is git or a URL.
  if (isRemoteSource(source)) {
    const spec = source.replace(/^git:/, "").replace(/^https?:\/\//, "");
    const at = spec.lastIndexOf("@");
    const [repo, ref] = at > 0 ? [spec.slice(0, at), spec.slice(at + 1)] : [spec, undefined];
    return { name: basename(repo).replace(/\.git$/, ""), version: ref && `@${ref}`, kind: "git", where: `git repo · ${repo}` };
  }
  return { name: basename(source), kind: "local", where: `folder · ${source}` };
}

/**
 * A resource's name from its path: an extension's folder or file, a skill's folder, a prompt's or theme's file.
 * "permission-gate" from ".../permission-gate/index.ts" or ".../permission-gate.ts".
 */
export function resourceName(kind: "extensions" | "skills" | "prompts" | "themes", path: string) {
  const file = basename(path, extname(path));
  if (kind === "extensions") return file === "index" ? basename(dirname(path)) : file;
  if (kind === "skills") return file === "SKILL" ? basename(dirname(path)) : file;
  return file;
}

async function describe(cwd: string, scope: "user" | "project"): Promise<InstalledPackage[]> {
  const pm = manager(cwd);
  const configured = pm.listConfiguredPackages().filter((p) => p.scope === scope);
  // Missing packages are listed, not installed here: installing runs code, and only the user starts that.
  const resolved = await pm.resolve(async () => "skip").catch(() => undefined);
  return configured.map((p) => {
    const info = parseSource(p.source);
    const resources = { extensions: [] as string[], skills: [] as string[], prompts: [] as string[], themes: [] as string[] };
    for (const kind of ["extensions", "skills", "prompts", "themes"] as const)
      for (const r of resolved?.[kind] ?? []) if (r.metadata.source === p.source && r.metadata.scope === scope) resources[kind].push(resourceName(kind, r.path));
    let installedAt: number | undefined;
    try {
      installedAt = p.installedPath ? statSync(p.installedPath).mtimeMs : undefined;
    } catch {
      // not installed yet
    }
    return { source: p.source, ...info, scope: scope === "user" ? "global" : "project", cwd: scope === "project" ? cwd : undefined, installed: !!installedAt, installedAt, resources };
  });
}

/** Board 4, left: global packages, then each project's own. */
export async function listPackages(projects: Project[]) {
  const global = await describe(projects[0]?.cwd ?? process.cwd(), "user");
  const perProject = await Promise.all(projects.map(async (p) => ({ cwd: p.cwd, name: p.name, packages: await describe(p.cwd, "project") })));
  return { global, projects: perProject.filter((p) => p.packages.length) };
}

/** Board 4: install, remove, update. `cwd` = one project (--local); none = global. Progress goes to `onProgress`. */
export async function changePackage(action: "install" | "remove" | "update", source: string, cwd: string | undefined, onProgress: (e: ProgressEvent) => void, anyCwd: string) {
  const pm = manager(cwd ?? anyCwd);
  pm.setProgressCallback(onProgress);
  const local = !!cwd;
  if (action === "install") await pm.installAndPersist(source, { local });
  if (action === "remove") await pm.removeAndPersist(source, { local });
  if (action === "update") await pm.update(source);
}

/** Board 4, right: packages on npm with the pi-package keyword. */
export async function searchGallery(query: string): Promise<GalleryItem[]> {
  const text = encodeURIComponent(`keywords:pi-package ${query}`.trim());
  const url = `https://registry.npmjs.org/-/v1/search?text=${text}&size=20`;
  const res = await fetch(url, { signal: AbortSignal.timeout(GALLERY_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`npm search failed (${res.status})`);
  return galleryItems(await res.json(), url);
}

/** The npm search answer comes from outside: drop each entry with a wrong shape. */
export function galleryItems(body: unknown, url: string) {
  const objects = isRecord(body) ? body.objects : undefined;
  if (!Array.isArray(objects)) throw new Error(`${url} did not answer with a list of packages`);
  return objects.flatMap((o): GalleryItem[] => {
    const p: unknown = isRecord(o) ? o.package : undefined;
    if (!isRecord(p) || typeof p.name !== "string" || typeof p.version !== "string") return [];
    const k = (Array.isArray(p.keywords) ? p.keywords.filter((w) => typeof w === "string") : []).join(" ").toLowerCase();
    const kind = /\bthemes?\b/.test(k) ? "theme" : /\bskills?\b/.test(k) ? "skills" : /\bprompts?\b/.test(k) ? "prompts" : "extension";
    return [{ name: p.name, version: p.version, description: typeof p.description === "string" ? p.description : "", kind }];
  });
}

/**
 * Settings for a session that opens without installing anything: configured packages that are not installed are
 * hidden from pi (it would install them, and one failure stops the session). Installing runs code, so it goes
 * through the confirmed Install in Packages. The check runs on every read, so a Reload sees what changed since.
 * Returns the missing sources (global, and the project's if it is trusted) to tell the user.
 */
export function settingsWithoutMissing(cwd: string) {
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(cwd, agentDir);
  // A separate manager answers "is it installed?": it must not read through the wrapped getters below.
  const probe = manager(cwd);
  const installed = (source: string, scope: "user" | "project") => {
    const path = probe.getInstalledPath(source, scope);
    return !!path && existsSync(path);
  };
  type Settings = ReturnType<typeof settingsManager.getGlobalSettings>;
  const hide = (s: Settings, scope: "user" | "project"): Settings => (s.packages ? { ...s, packages: s.packages.filter((p) => installed(packageSource(p), scope)) } : s);
  const global = settingsManager.getGlobalSettings.bind(settingsManager);
  const project = settingsManager.getProjectSettings.bind(settingsManager);
  // ponytail: hides the packages where pi's package manager reads them (the two getters); a new pi reader would need this too.
  settingsManager.getGlobalSettings = () => hide(global(), "user");
  settingsManager.getProjectSettings = () => hide(project(), "project");

  const trusted = new ProjectTrustStore(agentDir).get(cwd) === true;
  const missing = [
    ...(global().packages ?? []).map(packageSource).filter((x) => !installed(x, "user")),
    ...(trusted ? (project().packages ?? []).map(packageSource).filter((x) => !installed(x, "project")) : []),
  ];
  return { settingsManager, missing };
}

/** Settings › Project trust: trust, do not trust, or ask again (null). */
export function setTrust(cwd: string, trusted: boolean | null) {
  new ProjectTrustStore(getAgentDir()).set(cwd, trusted);
}

/** Board 4, right: what pi decided for each project's own files. */
export function trustList(projects: Project[]) {
  const store = new ProjectTrustStore(getAgentDir());
  // A decision can come from a parent folder; "Ask" only removes the project's own decision.
  return projects.map((p) => {
    const entry = store.getEntry(p.cwd);
    let own = p.cwd;
    try {
      own = realpathSync(p.cwd); // pi keeps real paths (/tmp is /private/tmp)
    } catch {
      // the folder is gone: compare as it is
    }
    return { cwd: p.cwd, name: p.name, trusted: store.get(p.cwd), from: entry && entry.path !== own && entry.path !== p.cwd ? entry.path : undefined };
  });
}
