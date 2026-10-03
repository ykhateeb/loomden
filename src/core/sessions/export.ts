import type { Session } from "./live-state";

/**
 * Export the session file `path` to `file`. A session that is not open opens only for the export. It closes again
 * after it, unless the user opened it meanwhile (`wanted`).
 */
export async function exportSessionHtml({ path, file, wanted, find, open, close }: {
  path: string;
  file: string;
  wanted: ReadonlySet<string>;
  find: (path: string) => Session | undefined;
  open: (path: string) => Promise<void>;
  close: (path: string) => Promise<void>;
}) {
  const wasOpen = find(path) !== undefined;
  if (!wasOpen) await open(path);
  const session = find(path);
  if (!session) throw new Error("Export cancelled");
  try {
    await session.exportToHtml(file);
  } finally {
    if (!wasOpen && !wanted.has(path)) await close(path);
  }
}
