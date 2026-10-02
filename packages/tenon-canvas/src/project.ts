// A canvas comes into a project: free canvases and the design system move there, and history/ stays out of git.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listCanvases } from "./store.js";

export type CanvasMove = { from: string; to: string };

/** Add to project: where each canvas folder goes in the project. A taken name gets -2, -3… */
export async function canvasMoves(fromRoot: string, toRoot: string): Promise<CanvasMove[]> {
  const moves: CanvasMove[] = [];
  for (const name of await listCanvases(fromRoot)) {
    let to = name;
    for (let n = 2; existsSync(join(toRoot, to)) || moves.some((m) => m.to === to); n++) to = `${name}-${n}`;
    moves.push({ from: name, to });
  }
  return moves;
}

/** Add to project: move the canvas folders, as canvasMoves() planned. */
export async function moveCanvases({ fromRoot, toRoot, moves }: { fromRoot: string; toRoot: string; moves: CanvasMove[] }) {
  await mkdir(toRoot, { recursive: true });
  for (const m of moves) {
    await cp(join(fromRoot, m.from), join(toRoot, m.to), { recursive: true, errorOnExist: true, force: false });
    await rm(join(fromRoot, m.from), { recursive: true });
  }
}

/** Add to project: the session's design system comes too, unless the project has one already. */
export async function moveDesignSystem(fromDs: string, toDs: string) {
  if (!existsSync(join(fromDs, "tokens.json")) || existsSync(toDs)) return;
  await cp(fromDs, toDs, { recursive: true });
  await rm(fromDs, { recursive: true });
}

const HISTORY_IGNORE = ".tenon/canvases/*/history/";

/** True when the project is a git repository and its .gitignore does not keep history/ out yet. */
export async function gitignoreMissing(project: string) {
  if (!existsSync(join(project, ".git"))) return false;
  const cur = await readFile(join(project, ".gitignore"), "utf8").catch(() => "");
  return !cur.split("\n").includes(HISTORY_IGNORE);
}

/** Keep history/ out of git. */
export async function ensureGitignore(project: string) {
  if (!(await gitignoreMissing(project))) return;
  const f = join(project, ".gitignore");
  const cur = await readFile(f, "utf8").catch(() => "");
  await writeFile(f, cur + (cur && !cur.endsWith("\n") ? "\n" : "") + HISTORY_IGNORE + "\n");
}
