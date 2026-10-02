import type { SessionTree } from "#protocol";
import { call } from "#renderer/port";
import { sessionActions } from "#renderer/sessions/actions";
import { getState, notice, report, reportOr, set } from "#renderer/store";

export const treeActions = {
  tree: (key: string) => call<SessionTree>({ type: "session.tree", key }).catch(reportOr(undefined)),
  /** Switch to a point. A user message comes back as a draft (an agent event) to edit and send. */
  navigate: (key: string, id: string, summarize: boolean) =>
    call({ type: "session.navigate", key, id, summarize })
      .then(() => showChangedChat(key))
      .catch(report),
  label: (key: string, id: string, label: string) =>
    call({ type: "session.label", key, id, label })
      .then(() => set((s) => ({ treeStamp: s.treeStamp + 1 })))
      .catch(report),
  fork: async (key: string, id: string, at: boolean) => {
    const before = getState().live[key]?.file;
    try {
      await call({ type: "session.fork", key, id, at });
      const forked = getState().live[key]?.file !== before;
      if (!forked) return; // an extension stopped the fork
      showChangedChat(key);
      notice(at ? "Cloned into a new session" : "Forked into a new session", "info");
      await sessionActions.refresh();
    } catch (e) {
      report(e as Error);
    }
  },
};

/** After a switch or fork: show the chat, and tell tree views to fetch again. */
function showChangedChat(key: string) {
  set((s) => ({ view: { ...s.view, [key]: "chat" }, treeStamp: s.treeStamp + 1 }));
}
