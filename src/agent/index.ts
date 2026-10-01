// The agent process (Electron utilityProcess). pi and every extension run here, never in the window's process.
import { initTheme, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { createGrants } from "#core/grants";
import { SHARED_AUTH_PATH } from "#core/paths";
import { createDialogs } from "#core/sessions/extension-ui";
import { createRegistry } from "#core/sessions/registry";
import type { AgentOut, Command, Request } from "#protocol";
import { createHandle } from "./handlers";
import { packageCommands } from "./package-commands";
import { projectCommands } from "./project-commands";
import { providerCommands } from "./provider-commands";
import { sessionCommands } from "./session-commands";

type Port = Electron.MessagePortMain;
const ports = new Set<Port>();

const send = (msg: AgentOut) => {
  for (const port of ports) port.postMessage(msg);
};

initTheme(); // extensions read ctx.ui.theme
const modelRuntime = await ModelRuntime.create({ authPath: SHARED_AUTH_PATH });
const grants = createGrants();
const dialogs = createDialogs(send);
const sessions = createRegistry({ send, modelRuntime, grants, dialogs });

const deps = { send, modelRuntime, grants, dialogs, sessions };
const handle = createHandle({ ...sessionCommands(deps), ...projectCommands(deps), ...providerCommands(deps), ...packageCommands(deps) });

// One port for each window load. A reloaded window gets a new port and the open dialogs again.
process.parentPort.on("message", ({ data, ports: [port] }) => {
  // Main sends the paths the user picked or dropped on this channel, which the window cannot use.
  if (data?.grant) return grants.grant(data.grant.kind, data.grant.path);
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
  dialogs.resendPending();
});
