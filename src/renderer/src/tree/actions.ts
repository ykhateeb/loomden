import type { SessionTree } from "#protocol";
import { call } from "#renderer/port";
import { sessionActions } from "#renderer/sessions/actions";
import { notice, report, set } from "#renderer/store";

export const treeActions = {
  tree: (key: string) => call<SessionTree>({ type: "session.tree", key }).catch((e) => (report(e), undefined)),
  /** Switch to a point; returns the new tree. A user message comes back as a draft to edit and send. */
  navigate: async (key: string, id: string, summarize: boolean) => {
    try {
      const r = await call<{ editorText?: string; tree: SessionTree }>({ type: "session.navigate", key, id, summarize });
      showChangedChat(key, r.editorText);
      return r.tree;
    } catch (e) {
      report(e as Error);
    }
  },
  label: (key: string, id: string, label: string) =>
    call<SessionTree>({ type: "session.label", key, id, label })
      .then((t) => (set((s) => ({ treeStamp: s.treeStamp + 1 })), t))
      .catch((e) => (report(e), undefined)),
  fork: async (key: string, id: string, at: boolean) => {
    try {
      const r = await call<{ cancelled: boolean; editorText?: string }>({ type: "session.fork", key, id, at });
      if (r.cancelled) return;
      showChangedChat(key, r.editorText);
      notice(at ? "Cloned into a new session" : "Forked into a new session", "info");
      await sessionActions.refresh();
    } catch (e) {
      report(e as Error);
    }
  },
};

/** After a switch or fork: show the chat, give back the user message pi returned, and tell tree views to fetch again. */
function showChangedChat(key: string, editorText?: string) {
  set((s) => ({ view: { ...s.view, [key]: "chat" }, drafts: editorText ? { ...s.drafts, [key]: editorText } : s.drafts, treeStamp: s.treeStamp + 1 }));
}
