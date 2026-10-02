import { assertProject } from "#core/projects";
import { addCustomProvider, availableModels, cancelLogin, findModels, listProviders, login } from "#core/providers";
import { readModelSettings, settingsFile, writeModelSettings } from "#core/settings";
import type { ModelsPage } from "#protocol";
import type { Deps, Handlers } from "./handlers";

export function providerCommands({ modelRuntime, send, dialogs }: Deps) {
  return {
    "settings.models": async (cmd): Promise<ModelsPage> => {
      if (cmd.cwd) await assertProject(cmd.cwd);
      return { settings: readModelSettings(cmd.cwd), global: readModelSettings(), providers: listProviders(modelRuntime), models: availableModels(modelRuntime), file: settingsFile(cmd.cwd) };
    },
    "settings.setModels": async (cmd) => {
      if (cmd.cwd) await assertProject(cmd.cwd);
      writeModelSettings(cmd.patch, cmd.cwd);
    },
    "providers.login": (cmd) => login(modelRuntime, cmd.providerId, cmd.method, { send, ask: dialogs.ask }),
    "providers.cancelLogin": () => cancelLogin(),
    "providers.find":(cmd) => findModels(cmd.baseUrl, cmd.api, cmd.apiKey),
    "providers.add": (cmd) => addCustomProvider(modelRuntime, cmd.provider),
    "providers.logout": (cmd) => modelRuntime.logout(cmd.providerId),
  } satisfies Partial<Handlers>;
}
