import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

/** Tau's own folder. Its pi agent folder is TAU_DIR/agent (the host sets PI_CODING_AGENT_DIR to it). */
export const TAU_DIR = process.env.TAU_DIR ?? join(homedir(), ".tau");
export const TAU_AGENT_DIR = join(TAU_DIR, "agent");
/** The folder of sessions with no project (board 1.1). pi needs a folder; this one is empty, so it has no project files. */
export const NO_PROJECT_DIR = join(TAU_DIR, "no-project");
/** Canvases of sessions with no project: FREE_CANVAS_DIR/<session id>/canvases. They move into the project on "Add to project". */
export const FREE_CANVAS_DIR = join(TAU_DIR, "sessions");

/** A path the window sends is only used if it is a session file in Tau's sessions folder. */
export function sessionFile(path: unknown): string {
  const full = typeof path === "string" ? resolve(path) : "";
  if (!full.startsWith(resolve(TAU_AGENT_DIR, "sessions") + sep) || !full.endsWith(".jsonl")) throw new Error("Not a Tau session file");
  return full;
}

/** Temporary HTML exports start with this; the main process only moves such files. */
export const EXPORT_PREFIX = "tau-export-";

/** Terminal pi's own folder. Tau reads it (import) and shares only its auth.json. */
export const PI_AGENT_DIR = process.env.TAU_PI_DIR ?? join(homedir(), ".pi", "agent");

/** Keys and logins stay one file, shared with terminal pi. */
export const SHARED_AUTH_PATH = join(PI_AGENT_DIR, "auth.json");
