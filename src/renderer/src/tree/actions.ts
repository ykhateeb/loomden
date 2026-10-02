import type { SessionTree } from "#protocol";
import { call } from "#renderer/port";
import { sessionActions } from "#renderer/sessions/actions";
import { getState, notice, report, reportOr, set } from "#renderer/store";

export const treeActions = {
  loadTree: (key: string) => call<SessionTree>({ type: "session.tree", key }).catch(reportOr(undefined)),
  /** Switch to a point. A user message comes back as a draft (an agent event) to edit and send. */
  navigate: (key: string, id: string, summarize: boolean) =>
    call({ type: "session.navigate", key, id, summarize })
      .then(() => showChangedChat(key))
      .catch(report),
  setLabel: (key: string, id: string, label: string) =>
    call({ type: "session.label", key, id, label })
      .then(() => set((s) => ({ treeStamp: s.treeStamp + 1 })))
      .catch(report),
  /** Board 3: Fork, a new session with the history before message `id`. */
  fork: (key: string, id: string) => branchOff({ key, id, done: "Forked into a new session" }),
  /** Board 3: Clone, a new session with the history through point `id`. */
  cloneAt: (key: string, id: string) => branchOff({ key, id, position: "at", done: "Cloned into a new session" }),
};

/** pi works in a new session from point `id`, under the same key. */
async function branchOff({ key, id, position, done }: { key: string; id: string; position?: "at"; done: string }) {
  const before = getState().live[key]?.file;
  try {
    await call({ type: "session.fork", key, id, position });
    const forked = getState().live[key]?.file !== before;
    if (!forked) return; // an extension stopped the fork
    showChangedChat(key);
    notice(done, "info");
    await sessionActions.refreshSidebar();
  } catch (e) {
    report(e as Error);
  }
}

/** After a switch or fork: show the chat, and tell tree views to fetch again. */
function showChangedChat(key: string) {
  set((s) => ({ view: { ...s.view, [key]: "chat" }, treeStamp: s.treeStamp + 1 }));
}
