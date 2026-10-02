import type { GalleryItem } from "#protocol";
import { call } from "#renderer/port";
import { getState, notice, type Packages, report, set } from "#renderer/store";

export const packageActions = {
  loadPackages: () =>
    call<Packages>({ type: "packages.list" })
      .then((packages) => set({ packages }))
      .catch(report),
  /** Install asks main's own dialog first (installing runs code); the agent refuses an install main did not confirm. */
  changePackage: async (action: "install" | "remove" | "update", source: string, cwd?: string) => {
    try {
      if (action !== "remove") await window.tenon.confirmInstall(action, source, cwd);
    } catch (e) {
      report(e as Error); // a cancel shows nothing
      return false;
    }
    set((s) => ({ packageWork: { ...s.packageWork, [source]: { action } } }));
    try {
      await call({ type: "packages.change", action, source, cwd });
      await packageActions.loadPackages();
      notice(`${action === "install" ? "Installed" : action === "remove" ? "Removed" : "Updated"} ${source}. Changes load after Reload or a new session.`, "info");
      return true;
    } catch (e) {
      report(e as Error);
      return false;
    } finally {
      set((s) => {
        const { [source]: _, ...rest } = s.packageWork;
        return { packageWork: rest };
      });
    }
  },
  gallery: (query: string) => call<GalleryItem[]>({ type: "packages.gallery", query }),
  reloadPackages: () => {
    const n = Object.keys(getState().live).length; // the agent reloads each open session
    return call({ type: "packages.reload" })
      .then(() => notice(n ? `Reloaded ${n} open ${n === 1 ? "session" : "sessions"}` : "No open session to reload", "info"))
      .catch(report);
  },
  setTrust: (cwd: string, trusted: boolean | null) =>
    call({ type: "trust.set", cwd, trusted })
      .then(() => call<Packages["trust"]>({ type: "trust.list" }))
      .then((trust) => set((s) => ({ savedAt: Date.now(), packages: s.packages ? { ...s.packages, trust } : { global: [], projects: [], trust } })))
      .catch(report),
};
