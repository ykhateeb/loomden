import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { FREE_CANVAS_DIR } from "#core/paths";
import { designSystemDir, ensureGitignore, freeRoot, moveCanvases, moveDesignSystem, projectRoot } from "#canvas/store";

type Notify = (level: "info" | "error", message: string) => void;

/** A copy of a session file in `dir`, with `cwd` in its header (pi reads the folder to work in from there). Never overwrites. */
export function copyToFolder(from: string, dir: string, cwd: string) {
  const to = join(dir, basename(from));
  const [header, ...rest] = readFileSync(from, "utf8").split("\n");
  writeFileSync(to, [JSON.stringify({ ...JSON.parse(header), cwd }), ...rest].join("\n"), { flag: "wx" });
  return to;
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
