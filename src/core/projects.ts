import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { Project, SessionRow } from "#protocol";
import type { Grants } from "./grants";
import { readEntries, summarize } from "./sessions/summary";
import { NO_PROJECT_DIR, LOOMDEN_DIR } from "./paths";

const PROJECTS_FILE = join(LOOMDEN_DIR, "projects.json");

function readAdded(): string[] {
  try {
    return JSON.parse(readFileSync(PROJECTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

/** Only a folder the user picked in the main process's folder dialog. */
export async function addProject(grants: Grants, path: string) {
  const cwd = await grants.assertGranted("folder", path);
  const added = readAdded();
  if (added.includes(cwd)) return;
  mkdirSync(LOOMDEN_DIR, { recursive: true });
  writeFileSync(PROJECTS_FILE, JSON.stringify([...added, cwd], null, 2));
}

// Model and branch count need a read of the file: keep them until the file changes.
// Keyed on the file's own time: pi's "modified" is the last message, and a model change or a label is not one.
const detailCache = new Map<string, { modified: number; model?: string; branches: number }>();

function details(path: string) {
  let modified = 0;
  try {
    modified = statSync(path).mtimeMs;
  } catch {
    return { branches: 1 };
  }
  const hit = detailCache.get(path);
  if (hit?.modified === modified) return { model: hit.model, branches: hit.branches };
  try {
    const d = summarize(readEntries(path));
    detailCache.set(path, { modified, ...d });
    return d;
  } catch {
    return { branches: 1 }; // a file pi can list but not parse: show it without details
  }
}

// The project folders from the last list, so a check does not read every session file again.
// ponytail: module state (this and detailCache), one copy per agent process; a factory when tests need a clean copy.
let known = new Set<string>();

/** Only folders in the project list may be searched from the window. */
export async function assertProject(cwd: string) {
  if (!known.has(cwd)) await listSessions();
  if (!known.has(cwd)) throw new Error("Not a Loomden project");
}

/** Remove a project from the list. Only one with no sessions: its sessions would show it again. The folder stays. */
export async function removeProject(cwd: string) {
  const { sessions } = await listSessions();
  if (sessions.some((s) => s.cwd === cwd)) throw new Error("Only a project with no sessions can be removed.");
  mkdirSync(LOOMDEN_DIR, { recursive: true });
  writeFileSync(PROJECTS_FILE, JSON.stringify(readAdded().filter((c) => c !== cwd), null, 2));
}

/** Projects = folders you added + folders that have sessions. Sessions with no project are in NO_PROJECT_DIR, which is not a project. */
export async function listSessions(): Promise<{ projects: Project[]; sessions: SessionRow[]; noProject: string }> {
  const infos = await SessionManager.listAll();
  const sessions = infos
    .map((i) => ({
      path: i.path,
      cwd: i.cwd,
      parent: i.parentSessionPath,
      title: i.name || i.firstMessage || "New session",
      modified: i.modified.getTime(),
      messageCount: i.messageCount,
      id: i.id,
      text: i.allMessagesText,
      ...details(i.path),
    }))
    .sort((a, b) => b.modified - a.modified);
  const cwds = new Set([...readAdded(), ...sessions.map((s) => s.cwd).filter(Boolean)]);
  cwds.delete(NO_PROJECT_DIR);
  known = new Set([...cwds, NO_PROJECT_DIR]);
  const projects = [...cwds].map((cwd) => ({ cwd, name: basename(cwd) })).sort((a, b) => a.name.localeCompare(b.name));
  return { projects, sessions, noProject: NO_PROJECT_DIR };
}
