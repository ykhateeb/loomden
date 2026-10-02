// The session list of the sidebar: every pi session file, with its project, title and details.
import { statSync } from "node:fs";
import { basename } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { Project, SessionRow } from "#protocol";
import { NO_PROJECT_DIR } from "#core/paths";
import { addedFolders, projectFolders } from "#core/projects";
import { readEntries, summarize } from "./summary";

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
  const projects = [...projectFolders(addedFolders(), sessions)].map((cwd) => ({ cwd, name: basename(cwd) })).sort((a, b) => a.name.localeCompare(b.name));
  return { projects, sessions, noProject: NO_PROJECT_DIR };
}

// Model and branch count need a read of the file: keep them until the file changes.
// ponytail: module state, one copy per agent process; a factory when tests need a clean copy.
// Keyed on the file's own time: pi's "modified" is the last message, and a model change or a label is not one.
const detailCache = new Map<string, { modified: number; model?: string; branches: number }>();

function details(path: string): { model?: string; branches: number } {
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
