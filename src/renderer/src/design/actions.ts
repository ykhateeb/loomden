import type { DesignCanvas } from "#protocol";
import { call } from "#renderer/port";
import { getState, report, set } from "#renderer/store";

export const designActions = {
  /** Board C1: read the canvases of a project folder. */
  loadDesign: (cwd: string) =>
    call<{ canvases: DesignCanvas[]; system?: string }>({ type: "design.list", cwd })
      .then((d) => set((s) => ({ design: { ...s.design, [cwd]: d } })))
      .catch(() => {}), // a folder that is no project (yet) has no Design row
  openDesign: (cwd: string, canvas?: string, tab: "canvases" | "system" = "canvases") => {
    set({ designPage: { cwd, canvas, tab }, tab: "sessions" });
    designActions.loadDesign(cwd);
  },
  /** The address of a canvas for the Design page. Notes go to the session `key`. */
  designUrl: (cwd: string, canvas: string, key?: string, tab?: "ds") => call<string>({ type: "design.open", cwd, canvas, key, tab }),
  /** Canvas ⇧C: show or hide the panel. The first time, the extension starts its server and reports the address. */
  canvas: (key: string) => {
    const { canvas, live } = getState();
    const c = canvas[key];
    if (c) set({ canvas: { ...canvas, [key]: { ...c, open: !c.open } } });
    else call({ type: "session.canvas", key, title: live[key]?.title }).catch(report);
  },
};
