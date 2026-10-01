import type { CustomProvider, FoundModel, ImportItem, ImportResult, ImportScan, ModelSettings } from "#protocol";
import { call } from "#renderer/port";
import { sessionActions } from "#renderer/sessions/actions";
import { getState, type ModelsPage, notice, report, set } from "#renderer/store";

// Each loadModels() call gets a number; only the newest one's reply is shown.
let modelsAsk = 0;

export const settingsActions = {
  openSettings: (settingsPage: "models" | "trust") => set({ tab: "settings", settingsPage }),
  /** Reads one scope. Clears the page first (no edits on the old scope's values) and ignores a reply that is not the newest. */
  loadModels: (cwd?: string) => {
    const ask = ++modelsAsk;
    set({ modelsPage: undefined, modelsCwd: cwd, modelsError: undefined });
    return call<ModelsPage>({ type: "settings.models", cwd }).then(
      (modelsPage) => ask === modelsAsk && set({ modelsPage }),
      (e: Error) => ask === modelsAsk && set({ modelsError: e.message }), // an old request's error is not news
    );
  },
  setModels: (patch: Partial<Record<keyof ModelSettings, unknown>>, cwd?: string) =>
    call<ModelSettings>({ type: "settings.setModels", cwd, patch })
      .then((settings) => set((s) => (s.modelsCwd !== cwd ? { savedAt: Date.now() } : { savedAt: Date.now(), modelsPage: s.modelsPage && { ...s.modelsPage, settings, global: cwd ? s.modelsPage.global : settings } })))
      .catch(report),
  /** Board 5 "Add key" / 5b subscription login. pi's questions come as dialogs; links open in the browser. */
  login: async (providerId: string, method: "api_key" | "oauth") => {
    const mine = { providerId, method, startedAt: Date.now() };
    set({ login: mine });
    try {
      await call({ type: "providers.login", providerId, method });
      notice("Connected", "info");
    } catch (e) {
      if (!/cancel/i.test((e as Error).message)) report(e as Error);
    } finally {
      if (getState().login?.startedAt === mine.startedAt) set({ login: undefined }); // not a newer login's state
      reloadModels();
    }
  },
  cancelLogin: () => call({ type: "providers.cancelLogin" }).catch(report),
  logout: (providerId: string) =>
    call({ type: "providers.logout", providerId })
      .then(() => (notice("Logged out", "info"), reloadModels()))
      .catch(report),
  findModels: (baseUrl: string, api: string, apiKey?: string) => call<FoundModel[]>({ type: "providers.find", baseUrl, api, apiKey }),
  addProvider: (provider: CustomProvider) =>
    call({ type: "providers.add", provider }).then(() => (notice(`Added ${provider.name}`, "info"), reloadModels())),
  setAddingProvider: (addingProvider: boolean) => set({ addingProvider }),
  setImporting: (importing: boolean) => set({ importing }),
  scanImport: () => call<ImportScan>({ type: "import.scan" }),
  /** undefined = the user cancelled main's confirmation. */
  runImport: async (items: ImportItem[]) => {
    if (!(await window.loomden.confirmImport(items))) return undefined;
    const results = await call<ImportResult[]>({ type: "import.run", items });
    sessionActions.refresh();
    return results;
  },
};

/** Read the models page again, for the scope it shows now. */
const reloadModels = () => settingsActions.loadModels(getState().modelsCwd);
