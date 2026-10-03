import { resolve } from "node:path";
import { CODE_IMPORT_ITEMS } from "#protocol";

/** main's grant arrives on its own channel, a moment after the window's command: wait up to 20 × 25 ms. */
const GRANT_POLL_TRIES = 20;
const GRANT_POLL_MS = 25;

export type GrantKind = "folder" | "file" | "package";
export type Grants = ReturnType<typeof createGrants>;

/** The key main grants for a package install or update the user confirmed. */
export const packageGrant = (action: string, source: string, cwd?: string) => `${action}|${cwd ?? ""}|${source}`;

/** The picked import items that bring code into Tenon, always in the order of CODE_IMPORT_ITEMS. */
export const importCodeItems = (items: readonly unknown[]) => CODE_IMPORT_ITEMS.filter((i) => items.includes(i));

/** The key main grants for an import the user confirmed. Main and the agent must build the same key. */
export const importGrant = (items: readonly unknown[]) => packageGrant("import", importCodeItems(items).join(","));

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

    /** The full path of a folder or file the user picked. Throws if main did not grant it. */
    async assertGranted(kind: "folder" | "file", path: string) {
      const full = resolve(path);
      if (!(await waitForGrant(kind, full))) throw new Error(`Not a ${kind} you picked: ${path}`);
      return full;
    },

    /** Use main's confirmation of a package install, update or import. A later request for the same package asks again. */
    async consumePackageGrant(key: string) {
      if (!(await waitForGrant("package", key))) throw new Error("Not confirmed in Tenon's install dialog");
      granted.package.delete(key);
    },
  };

  /** The grant comes from main on its own channel; the window's command can arrive a moment before it. */
  async function waitForGrant(kind: GrantKind, value: string) {
    for (let i = 0; i < GRANT_POLL_TRIES && !granted[kind].has(value); i++) await new Promise((r) => setTimeout(r, GRANT_POLL_MS));
    return granted[kind].has(value);
  }
}

// A package grant is "<install|update|import>|<project folder or empty>|<source>", not a path. It is good for one use.
const norm = (kind: GrantKind, value: string) => (kind === "package" ? value : resolve(value));
