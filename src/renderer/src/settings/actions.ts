import type { CustomProvider, FoundModel, ImportItem, ImportScan, LoginMethod, ModelSettings, ModelsPage } from "#protocol";
import { call } from "#renderer/port";
import { sessionActions } from "#renderer/sessions/actions";
import { getState, notice, report, set } from "#renderer/store";

// Each loadModels() call gets a number; only the newest one's reply is shown.
let modelsAsk = 0;

export const settingsActions = {
  openSettings: (settingsPage: "models" | "trust") => set({ tab: "settings", settingsPage }),
  /** Reads one scope. Clears the page first (no edits on the old scope's values) and ignores a reply that is not the newest. */
  loadModels: (cwd?: string) => {
    const ask = ++modelsAsk;
    set({ modelsPage: undefined, modelsCwd: cwd, modelsError: undefined });
    return call<ModelsPage>({ type: "settings.models", cwd }).then(
      (modelsPage) => {
        if (ask === modelsAsk) set({ modelsPage });
      },
      (e: Error) => {
        if (ask === modelsAsk) set({ modelsError: e.message }); // an old request's error is not news
      },
    );
  },
  setModels: (patch: Partial<Record<keyof ModelSettings, unknown>>, cwd?: string) =>
    call({ type: "settings.setModels", cwd, patch })
      .then(() => call<ModelsPage>({ type: "settings.models", cwd }))
      .then((modelsPage) => set((s) => (s.modelsCwd !== cwd ? { savedAt: Date.now() } : { savedAt: Date.now(), modelsPage })))
      .catch(report),
  /** Board 5 "Add key" / 5b subscription login. pi's questions come as dialogs; links open in the browser. */
  login: async (providerId: string, method: LoginMethod) => {
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
  /** Open or close the import dialog. Each opening starts with no results. */
  setImporting: (importing: boolean) => set({ importing, importResults: [] }),
  scanImport: () => call<ImportScan>({ type: "import.scan" }),
  /** The results arrive as agent events, in importResults. Throws DIALOG_CANCELLED if the user cancels main's confirmation. */
  runImport: async (items: ImportItem[]) => {
    await window.tenon.confirmImport(items);
    await call({ type: "import.run", items });
    sessionActions.refresh();
  },
};

/** Read the models page again, for the scope it shows now. */
const reloadModels = () => settingsActions.loadModels(getState().modelsCwd);
