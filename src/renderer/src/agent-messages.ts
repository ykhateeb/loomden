// What the agent sends without a request (session state, messages, dialogs, notices), applied to the store.
import { designActions } from "./design/actions";
import { type AgentMessageOut, call, listenForAgent } from "./port";
import { openDevView, sessionActions } from "./sessions/actions";
import { getState, notice, report, set, without } from "./store";

listenForAgent({
  // After a reload the agent sends its open sessions and dialogs again; after a restart it has none.
  connect: () => {
    set({ agent: "ready", live: {}, messages: {}, dialogs: [] });
    sessionActions.refreshSidebar().then(() => openDevView());
  },
  // The host restarts pi unless it stopped at startup; a new port then arrives.
  exit: () => set({ agent: "stopped", live: {}, messages: {}, active: undefined, dialogs: [] }),
  message: receive,
});

function receive(msg: AgentMessageOut) {
  switch (msg.type) {
    case "state": {
      const before = getState().live[msg.state.key];
      set((s) => ({ live: { ...s.live, [msg.state.key]: msg.state } }));
      if (before?.streaming && !msg.state.streaming) sessionActions.refreshSidebar(); // titles and counts changed
      return;
    }
    case "messages":
      return set((s) => ({ messages: { ...s.messages, [msg.key]: msg.messages } }));
    case "closed":
      return set((s) => {
        return { live: without(s.live, msg.key), messages: without(s.messages, msg.key), dialogs: s.dialogs.filter((d) => d.key !== msg.key), active: s.active === msg.key ? undefined : s.active };
      });
    case "import.result":
      return set((s) => ({ importResults: [...s.importResults.filter((r) => r.id !== msg.result.id), msg.result] })); // a retry replaces its item
    case "draft":
      return set((s) => ({ drafts: { ...s.drafts, [msg.key]: msg.text } }));
    case "canvas.build": {
      // The pack starts a new session in the same folder, so this chat stays as it was.
      const cwd = msg.cwd ?? (msg.key && getState().live[msg.key]?.cwd);
      if (!cwd) return;
      const key = crypto.randomUUID();
      void sessionActions.open(cwd, undefined, key).then(async () => {
        const opened = key in getState().live;
        if (!opened) return; // the trust dialog was cancelled
        notice(`Build session started from “${msg.title}”`, "info");
        await call({ type: "session.prompt", key, text: msg.text });
      }).catch(report);
      return;
    }
    case "canvas": {
      const cwd = getState().live[msg.key]?.cwd;
      if (cwd) designActions.loadDesign(cwd); // a new canvas shows in the Design row
      return set((s) => ({ canvas: { ...s.canvas, [msg.key]: { url: msg.url, open: true } } }));
    }
    case "message":
      return set((s) => {
        const list = s.messages[msg.key] ?? [];
        const next = msg.push || list.length === 0 ? [...list, msg.message] : [...list.slice(0, -1), msg.message];
        return { messages: { ...s.messages, [msg.key]: next } };
      });
    case "ui.request":
      return set((s) => ({ dialogs: [...s.dialogs.filter((d) => d.id !== msg.request.id), msg.request] }));
    case "ui.done":
      return set((s) => ({ dialogs: s.dialogs.filter((d) => d.id !== msg.id) }));
    case "notify":
      return notice(msg.message, msg.level);
    case "auth.event": {
      const e = msg.event;
      const login = getState().login;
      if (!login || login.providerId !== msg.providerId) return; // an older login that was replaced
      if (e.type === "done") return set({ login: undefined });
      if (e.type === "auth_url") {
        window.tenon.openExternal(e.url); // main opens only https links
        return set((s) => ({ login: s.login && { ...s.login, url: e.url, message: e.instructions } }));
      }
      if (e.type === "device_code") return set((s) => ({ login: s.login && { ...s.login, code: { userCode: e.userCode, verificationUri: e.verificationUri } } }));
      return set((s) => ({ login: s.login && { ...s.login, message: e.message } }));
    }
    case "package.progress":
      return set((s) => {
        const work = { ...s.packageWork };
        if (msg.phase === "complete" || msg.phase === "error") delete work[msg.source];
        else work[msg.source] = { action: msg.action, message: msg.message };
        return { packageWork: work };
      });
  }
}
