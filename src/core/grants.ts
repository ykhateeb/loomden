import { resolve } from "node:path";

export type GrantKind = "folder" | "file" | "package";
export type Grants = ReturnType<typeof createGrants>;

/** The key main grants for a package install or update the user confirmed. */
export const packageGrant = (action: string, source: string, cwd?: string) => `${action}|${cwd ?? ""}|${source}`;

/**
 * Paths the user picked or dropped, as the main process saw them. The window is not trusted,
 * so a folder becomes a project, and a file is read as an image, only if it is here.
 */
export function createGrants() {
  const granted: Record<GrantKind, Set<string>> = { folder: new Set(), file: new Set(), package: new Set() };

  return {
    grant(kind: GrantKind, value: string) {
      granted[kind].add(norm(kind, value));
    },

    /** The grant comes from main on its own channel; the window's command can arrive a moment before it. */
    async assertGranted(kind: GrantKind, path: string) {
      const full = norm(kind, path);
      for (let i = 0; i < 20 && !granted[kind].has(full); i++) await new Promise((r) => setTimeout(r, 25));
      if (!granted[kind].has(full)) throw new Error(kind === "package" ? "Not confirmed in Loomden's install dialog" : `Not a ${kind} you picked: ${path}`);
      // A confirmation is for this one install or update: a later request for the same package asks again.
      if (kind === "package") granted.package.delete(full);
      return full;
    },
  };
}

// A package grant is "<install|update|import>|<project folder or empty>|<source>", not a path. It is good for one use.
const norm = (kind: GrantKind, value: string) => (kind === "package" ? value : resolve(value));
