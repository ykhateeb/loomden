// What the agent sends without a request (session state, messages, dialogs, notices), applied to the store.
import { designActions } from "./design/actions";
import { type AgentMessageOut, call, listenForAgent } from "./port";
import { sessionActions } from "./sessions/actions";
import { getState, notice, report, set } from "./store";

listenForAgent({
  // After a reload the agent sends its open sessions and dialogs again; after a restart it has none.
  connect: () => {
    set({ agent: "ready", live: {}, messages: {}, dialogs: [] });
    sessionActions.refresh();
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
      if (before?.streaming && !msg.state.streaming) sessionActions.refresh(); // titles and counts changed
      return;
    }
    case "messages":
      return set((s) => ({ messages: { ...s.messages, [msg.key]: msg.messages } }));
    case "closed":
      return set((s) => {
        const { [msg.key]: _, ...live } = s.live;
        const { [msg.key]: __, ...messages } = s.messages;
        return { live, messages, dialogs: s.dialogs.filter((d) => d.key !== msg.key), active: s.active === msg.key ? undefined : s.active };
      });
    case "canvas.build": {
      // The pack starts a new session in the same folder, so this chat stays as it was.
      const cwd = msg.cwd ?? (msg.key && getState().live[msg.key]?.cwd);
      if (!cwd) return;
      void sessionActions.open(cwd).then(async (key) => {
        if (!key) return;
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
