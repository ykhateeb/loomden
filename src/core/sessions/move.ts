import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { FREE_CANVAS_DIR } from "#core/paths";
import { designSystemDir, ensureGitignore, freeRoot, moveCanvases, moveDesignSystem, projectRoot } from "#canvas/store";

type Notify = (level: "info" | "error", message: string) => void;

/** Where copyToFolder() puts a session file in `dir`: the same file name. */
export function folderCopyPath(from: string, dir: string) {
  return join(dir, basename(from));
}

/** Copy a session file to `to`, with `cwd` in its header (pi reads the folder to work in from there). Never overwrites. */
export function copyToFolder({ from, to, cwd }: { from: string; to: string; cwd: string }) {
  const [header, ...rest] = readFileSync(from, "utf8").split("\n");
  writeFileSync(to, [JSON.stringify({ ...JSON.parse(header), cwd }), ...rest].join("\n"), { flag: "wx" });
}

/** Board C14: the canvases of a session with no project move into the project, where the team gets them with git. */
export async function moveFreeCanvases(sessionId: string, cwd: string, notify: Notify) {
  const freeDir = freeRoot(FREE_CANVAS_DIR, sessionId);
  try {
    const moved = await moveCanvases(freeDir, projectRoot(cwd));
    await moveDesignSystem(designSystemDir(freeDir), designSystemDir(projectRoot(cwd)));
    if (moved.length) {
      await ensureGitignore(cwd);
      notify("info", `Canvas moved to ${basename(cwd)}/.tenon/canvases/${moved.join(", ")}`);
    }
  } catch (e) {
    notify("error", `The session moved, but its canvas did not: ${(e as Error).message}. It is still in ${freeDir}`);
  }
}
