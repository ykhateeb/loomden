import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import type { Grants } from "./grants";
import { promisify } from "node:util";

const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
const MAX_IMAGE = 20 * 1024 * 1024;
/** The @ menu reads the file list again after this time. */
const FILE_LIST_TTL_MS = 30_000;
const GIT_LS_TIMEOUT_MS = 5000;
/** A large repository lists many files: git's output can be this big. */
const MAX_GIT_OUTPUT = 64 * 1024 * 1024;

export const isImage = (path: string) => extname(path).toLowerCase() in IMAGE_TYPES;

/** A dropped or picked image, as pi's ImageContent. Only image files the user picked or dropped, up to 20 MB. */
export async function readImage(grants: Grants, input: string) {
  const path = await grants.assertGranted("file", input);
  const mimeType = IMAGE_TYPES[extname(path).toLowerCase()];
  if (!mimeType) throw new Error(`Not an image: ${path}`);
  if ((await stat(path)).size > MAX_IMAGE) throw new Error(`Image is larger than 20 MB: ${path}`);
  return { type: "image" as const, data: (await readFile(path)).toString("base64"), mimeType };
}

const SKIP = new Set([".git", "node_modules", "dist", "out", "build", ".next", ".turbo", "coverage"]);
const LIMIT = 20000;
// ponytail: module-level cache, one copy per agent process; a factory when tests need a clean copy.
const cache = new Map<string, { at: number; files: string[] }>();

/** Files of a project: git's list (tracked + untracked, not ignored), else a folder walk. */
async function listFiles(cwd: string): Promise<string[]> {
  const hit = cache.get(cwd);
  if (hit && Date.now() - hit.at < FILE_LIST_TTL_MS) return hit.files;
  let files: string[];
  try {
    const { stdout } = await promisify(execFile)("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd, maxBuffer: MAX_GIT_OUTPUT, timeout: GIT_LS_TIMEOUT_MS });
    files = stdout.split("\0").filter(Boolean).slice(0, LIMIT); // -z: names as they are, not quoted
  } catch {
    files = [];
    // ponytail: breadth-first walk with a file limit; a real index when projects are huge.
    const queue = [cwd];
    while (queue.length && files.length < LIMIT) {
      const dir = queue.shift()!;
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        if (SKIP.has(e.name)) continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) queue.push(full);
        else if (e.isFile()) files.push(relative(cwd, full));
      }
    }
  }
  cache.set(cwd, { at: Date.now(), files });
  return files;
}

/** The @ menu: file name matches first, then path matches. */
export async function searchFiles(cwd: string, query: string, max = 8) {
  const q = query.toLowerCase();
  const files = await listFiles(cwd);
  const score = (f: string) => {
    const name = f.slice(f.lastIndexOf("/") + 1).toLowerCase();
    if (!q) return 3;
    if (name.startsWith(q)) return 0;
    if (name.includes(q)) return 1;
    return f.toLowerCase().includes(q) ? 2 : -1;
  };
  return files
    .map((f) => ({ f, s: score(f) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.f.length - b.f.length)
    .slice(0, max)
    .map((x) => x.f);
}
