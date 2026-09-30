import { resolve } from "node:path";

/**
 * Paths the user picked or dropped, as the main process saw them. The window is not trusted,
 * so a folder becomes a project, and a file is read as an image, only if it is here.
 */
const granted = { folder: new Set<string>(), file: new Set<string>(), package: new Set<string>() };
type Kind = keyof typeof granted;

// A package grant is "<install|update>|<project folder or empty>|<source>", not a path. It is good for one use.
const norm = (kind: Kind, value: string) => (kind === "package" ? value : resolve(value));

export function grant(kind: Kind, value: string) {
  granted[kind].add(norm(kind, value));
}

/** The key main grants for a package install or update the user confirmed. */
export const packageGrant = (action: string, source: string, cwd?: string) => `${action}|${cwd ?? ""}|${source}`;

/** The grant comes from main on its own channel; the window's command can arrive a moment before it. */
export async function assertGranted(kind: Kind, path: string) {
  const full = norm(kind, path);
  for (let i = 0; i < 20 && !granted[kind].has(full); i++) await new Promise((r) => setTimeout(r, 25));
  if (!granted[kind].has(full)) throw new Error(kind === "package" ? "Not confirmed in Loomden's install dialog" : `Not a ${kind} you picked: ${path}`);
  // A confirmation is for this one install or update: a later request for the same package asks again.
  if (kind === "package") granted.package.delete(full);
  return full;
}
