import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { Grants } from "./grants";
import { NO_PROJECT_DIR, TENON_DIR } from "./paths";
import { writeJson } from "./settings";

const PROJECTS_FILE = join(TENON_DIR, "projects.json");

/** The folders you added as projects. */
export function addedFolders(): string[] {
  try {
    return JSON.parse(readFileSync(PROJECTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

/** Only a folder the user picked in the main process's folder dialog. */
export async function addProject(grants: Grants, path: string) {
  const cwd = await grants.assertGranted("folder", path);
  const added = addedFolders();
  if (added.includes(cwd)) return;
  writeJson(PROJECTS_FILE, [...added, cwd]);
}


// The project folders, so a check does not read every session file again. A miss reads them again.
// ponytail: module state, one copy per agent process; a factory when tests need a clean copy.
let known = new Set<string>();

/** Only folders in the project list may be searched from the window. */
export async function assertProject(cwd: string) {
  if (!known.has(cwd)) known = new Set([...projectFolders(addedFolders(), await SessionManager.listAll()), NO_PROJECT_DIR]);
  if (!known.has(cwd)) throw new Error("Not a Tenon project");
}

/** Remove a project from the list. Only one with no sessions: its sessions would show it again. The folder stays. */
export async function removeProject(cwd: string) {
  const sessions = await SessionManager.listAll();
  if (sessions.some((s) => s.cwd === cwd)) throw new Error("Only a project with no sessions can be removed.");
  writeJson(PROJECTS_FILE, addedFolders().filter((c) => c !== cwd));
  known.delete(cwd);
}


/** Projects = folders you added + folders that have sessions, except the folder of sessions with no project. */
export function projectFolders(added: readonly string[], sessions: readonly { cwd: string }[]): Set<string> {
  const cwds = new Set([...added, ...sessions.map((s) => s.cwd).filter(Boolean)]);
  cwds.delete(NO_PROJECT_DIR);
  return cwds;
}
