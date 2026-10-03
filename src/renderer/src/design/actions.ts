import { call } from "#renderer/port";
import { getState, report, set } from "#renderer/store";

export const designActions = {
  /** Board C1: read the canvases of a project folder. */
  loadDesign: (cwd: string) =>
    call({ type: "design.list", cwd })
      .then((d) => set((s) => ({ design: { ...s.design, [cwd]: d } })))
      .catch(() => {}), // a folder that is no project (yet) has no Design row
  openDesign: (cwd: string, canvas?: string, tab: "canvases" | "system" = "canvases") => {
    set({ designPage: { cwd, canvas, tab }, tab: "sessions" });
    designActions.loadDesign(cwd);
  },
  /** Start the design server of a project for the Design page. Notes go to the session `key`. */
  startDesign: (cwd: string, key?: string) => call({ type: "design.open", cwd, key }),
  /** The address of a canvas for the Design page. startDesign() first. */
  designUrl: (cwd: string, canvas: string, tab?: "ds") => call({ type: "design.url", cwd, canvas, tab }),
  /** Canvas ⇧C: show or hide the panel. The first time, the extension starts its server and reports the address. */
  canvas: (key: string) => {
    const { canvas, live } = getState();
    const c = canvas[key];
    if (c) set({ canvas: { ...canvas, [key]: { ...c, open: !c.open } } });
    else call({ type: "session.canvas", key, title: live[key]?.title }).catch(report);
  },
};
