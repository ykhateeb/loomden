// The agent process (Electron utilityProcess). pi and every extension run here, never in the window's process.
import { initTheme, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { searchFiles } from "#core/attachments";
import { assertGranted, grant, packageGrant } from "#core/grants";
import { codeItems, runImport, scanImport } from "#core/import";
import { changePackage, listPackages, searchGallery, setTrust, trustList } from "#core/packages";
import { addCustomProvider, availableModels, cancelLogin, findModels, listProviders, login } from "#core/providers";
import { readModelSettings, settingsFile, writeModelSettings } from "#core/settings";
import { designList, designOpen } from "#core/design";
import { addProject, assertProject, listSessions, removeProject } from "#core/projects";
import { mkdirSync } from "node:fs";
import { NO_PROJECT_DIR, SHARED_AUTH_PATH, sessionFile } from "#core/paths";
import { answer, resendPending } from "#core/sessions/extension-ui";
import { createRegistry } from "#core/sessions/registry";
import { searchSessions } from "#core/sessions/search";
import type { AgentOut, Command, ImportItem, Request } from "#protocol";

type Port = Electron.MessagePortMain;
const ports = new Set<Port>();

const send = (msg: AgentOut) => {
  for (const port of ports) port.postMessage(msg);
};

initTheme(); // extensions read ctx.ui.theme
const modelRuntime = await ModelRuntime.create({ authPath: SHARED_AUTH_PATH });
const sessions = createRegistry(send, modelRuntime);

async function handle(cmd: Command): Promise<unknown> {
  switch (cmd.type) {
    case "sessions.list":
      return listSessions();
    case "project.add":
      await addProject(cmd.cwd);
      return listSessions();
    case "session.open":
      await assertProject(cmd.cwd); // a folder becomes a project only through the folder picker
      if (cmd.cwd === NO_PROJECT_DIR) mkdirSync(NO_PROJECT_DIR, { recursive: true });
      return sessions.open(cmd.cwd, cmd.path && sessionFile(cmd.path));
    case "session.move":
      await assertProject(cmd.cwd); // NO_PROJECT_DIR too: Undo moves a session back
      return sessions.move(cmd.key, cmd.cwd);
    case "session.prompt":
      return sessions.prompt(cmd.key, cmd.text, cmd.behavior, cmd.images);
    case "session.canvas":
      return sessions.prompt(cmd.key, cmd.title ? `/canvas auto ${cmd.title.replace(/\s+/g, " ").trim()}` : "/canvas"); // an extension command: it runs at once, with no model call (a new canvas then asks pi to draft it)
    case "design.list":
      await assertProject(cmd.cwd);
      return designList(cmd.cwd);
    case "design.open":
      await assertProject(cmd.cwd);
      return designOpen(cmd.cwd, cmd.canvas, cmd.key, (key, text) => sessions.prompt(key, text), cmd.tab, (cwd, pack) => send({ type: "canvas.build", cwd, ...pack }));
    case "session.commands":
      return sessions.commands(cmd.key);
    case "session.models":
      return sessions.models(cmd.key);
    case "session.model":
      return sessions.setModel(cmd.key, cmd.provider, cmd.id);
    case "session.dequeue":
      return sessions.dequeue(cmd.key);
    case "sessions.search":
      return searchSessions((await listSessions()).sessions, cmd.query, cmd.titlesOnly, cmd.cwd);
    case "session.tree":
      return sessions.tree(cmd.key);
    case "session.navigate":
      return sessions.navigate(cmd.key, cmd.id, cmd.summarize);
    case "session.label":
      return sessions.label(cmd.key, cmd.id, cmd.label);
    case "session.fork":
      return sessions.fork(cmd.key, cmd.id, cmd.at);
    case "settings.models":
      if (cmd.cwd) await assertProject(cmd.cwd);
      return { settings: readModelSettings(cmd.cwd), global: readModelSettings(), providers: listProviders(modelRuntime), models: availableModels(modelRuntime), file: settingsFile(cmd.cwd) };
    case "settings.setModels":
      if (cmd.cwd) await assertProject(cmd.cwd);
      return writeModelSettings(cmd.patch, cmd.cwd);
    case "providers.login":
      await login(modelRuntime, cmd.providerId, cmd.method, send);
      return listProviders(modelRuntime);
    case "providers.cancelLogin":
      return cancelLogin();
    case "providers.find":
      return findModels(cmd.baseUrl, cmd.api, cmd.apiKey);
    case "providers.add":
      return addCustomProvider(modelRuntime, cmd.provider);
    case "providers.logout":
      await modelRuntime.logout(cmd.providerId);
      return listProviders(modelRuntime);
    case "trust.set": {
      await assertProject(cmd.cwd);
      if (cmd.trusted !== null && typeof cmd.trusted !== "boolean") throw new Error("Not a trust decision");
      setTrust(cmd.cwd, cmd.trusted);
      return trustList((await listSessions()).projects);
    }
    case "import.scan":
      return scanImport();
    case "import.run": {
      const items = cmd.items.filter((i): i is ImportItem => ["settings", "providers", "trust", "files", "packages"].includes(i));
      // Copying extensions or installing packages brings code into Loomden: only after main's own confirmation.
      const code = codeItems.filter((i) => items.includes(i));
      if (code.length) await assertGranted("package", packageGrant("import", code.join(",")));
      const results = await runImport(items, (e) => send({ type: "package.progress", source: e.source, action: e.action, phase: e.type, message: e.message }));
      await modelRuntime.refresh(); // imported providers and keys show at once
      return results;
    }
    case "packages.list": {
      const { projects } = await listSessions();
      return { ...(await listPackages(projects)), trust: trustList(projects) };
    }
    case "packages.change": {
      if (cmd.cwd) await assertProject(cmd.cwd);
      // Installing or updating runs new code (an update can install a missing package or a newer, unreviewed version):
      // only after the user confirmed it in main's own dialog. Removing needs no confirmation.
      if (cmd.action !== "remove") await assertGranted("package", packageGrant(cmd.action, cmd.source, cmd.cwd));
      const { projects } = await listSessions();
      await changePackage(cmd.action, cmd.source, cmd.cwd, (e) => send({ type: "package.progress", source: e.source, action: e.action, phase: e.type, message: e.message }), projects[0]?.cwd ?? process.cwd());
      return { ...(await listPackages(projects)), trust: trustList(projects) };
    }
    case "packages.gallery":
      return searchGallery(cmd.query);
    case "packages.reload":
      return sessions.reloadAll();
    case "session.compact":
      return sessions.compact(cmd.key);
    case "session.reload":
      return sessions.reload(cmd.key);
    case "session.tools":
      return sessions.setTools(cmd.key, cmd.names);
    case "files.search":
      await assertProject(cmd.cwd);
      return searchFiles(cmd.cwd, cmd.query);
    case "session.abort":
      return sessions.abort(cmd.key);
    case "session.thinking":
      return sessions.setThinking(cmd.key, cmd.level);
    case "session.rename":
      sessions.rename(sessionFile(cmd.path), cmd.name);
      return listSessions();
    case "session.clone":
      await assertProject(cmd.cwd);
      return sessions.clone(cmd.cwd, sessionFile(cmd.path));
    case "session.export":
      await assertProject(cmd.cwd);
      return sessions.exportHtml(cmd.cwd, sessionFile(cmd.path));
    case "session.close":
      return sessions.close(sessionFile(cmd.path));
    case "project.remove":
      await removeProject(cmd.cwd);
      return listSessions();
    case "ui.answer":
      return answer(cmd.id, cmd.value);
    default:
      // The window shows model output, so treat what it sends as untrusted.
      throw new Error(`Unknown command ${(cmd as { type: unknown }).type}`);
  }
}

// One port for each window load. A reloaded window gets a new port and the open dialogs again.
process.parentPort.on("message", ({ data, ports: [port] }) => {
  // Main sends the paths the user picked or dropped on this channel, which the window cannot use.
  if (data?.grant) return grant(data.grant.kind, data.grant.path);
  if (!port) return;
  ports.add(port);
  port.on("close", () => ports.delete(port));
  port.on("message", async ({ data }: { data: Request }) => {
    const { rid, ...cmd } = data;
    try {
      const result = await handle(cmd as Command);
      port.postMessage({ type: "reply", rid, ok: true, data: result } satisfies AgentOut);
    } catch (e) {
      port.postMessage({ type: "reply", rid, ok: false, error: (e as Error).message } satisfies AgentOut);
    }
  });
  port.start();
  sessions.resendAll();
  resendPending(send);
});
