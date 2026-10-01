// Everything the UI can do. Each feature keeps its actions in its own folder.
import { chatActions } from "./chat/actions";
import { designActions } from "./design/actions";
import { packageActions } from "./packages/actions";
import { call } from "./port";
import { sessionActions } from "./sessions/actions";
import { settingsActions } from "./settings/actions";
import { report, set, type Tab } from "./store";
import { treeActions } from "./tree/actions";

export const actions = {
  setTab: (tab: Tab) => set({ tab }),
  /** The user's answer to an extension dialog. */
  answer: (id: string, value: unknown) => call({ type: "ui.answer", id, value }).catch(report),
  ...sessionActions,
  ...treeActions,
  ...chatActions,
  ...designActions,
  ...settingsActions,
  ...packageActions,
};
