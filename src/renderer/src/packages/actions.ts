import type { GalleryItem, PackageAction, PackageList, TrustRow } from "#protocol";
import { call } from "#renderer/port";
import { getState, notice, report, set, without } from "#renderer/store";
import { plural } from "#renderer/chat/format";

export const packageActions = {
  loadPackages: () =>
    call<PackageList>({ type: "packages.list" })
      .then((packages) => set({ packages }))
      .catch(report),
  /**
   * Install asks main's own dialog first (installing runs code); the agent refuses an install main did not confirm.
   * `onDone` runs when the change worked.
   */
  changePackage: async ({ action, source, cwd, onDone }: { action: PackageAction; source: string; cwd?: string; onDone?: () => void }) => {
    try {
      if (action !== "remove") await window.tenon.confirmInstall(action, source, cwd);
    } catch (e) {
      report(e as Error); // a cancel shows nothing
      return;
    }
    set((s) => ({ packageWork: { ...s.packageWork, [source]: { action } } }));
    try {
      await call({ type: "packages.change", action, source, cwd });
      await packageActions.loadPackages();
      notice(`${action === "install" ? "Installed" : action === "remove" ? "Removed" : "Updated"} ${source}. Changes load after Reload or a new session.`, "info");
      onDone?.();
    } catch (e) {
      report(e as Error);
    } finally {
      set((s) => ({ packageWork: without(s.packageWork, source) }));
    }
  },
  gallery: (query: string) => call<GalleryItem[]>({ type: "packages.gallery", query }),
  reloadPackages: () => {
    const n = Object.keys(getState().live).length; // the agent reloads each open session
    return call({ type: "packages.reload" })
      .then(() => notice(n ? `Reloaded ${plural(n, "open session")}` : "No open session to reload", "info"))
      .catch(report);
  },
  setTrust: (cwd: string, trusted: boolean | null) =>
    call({ type: "trust.set", cwd, trusted })
      .then(() => call<TrustRow[]>({ type: "trust.list" }))
      .then((trust) => set((s) => ({ savedAt: Date.now(), packages: s.packages ? { ...s.packages, trust } : { global: [], projects: [], trust } })))
      .catch(report),
};
