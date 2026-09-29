import { randomUUID } from "node:crypto";
import type { ExtensionUIContext, ExtensionUIDialogOptions } from "@earendil-works/pi-coding-agent";
import type { Send, UIRequest } from "../../protocol";

type Body = UIRequest extends infer R ? (R extends UIRequest ? Omit<R, "id"> : never) : never;

// Open dialogs. Kept so that a reloaded window gets them again.
const pending = new Map<string, { request: UIRequest; done: (value: unknown) => void }>();

export function answer(id: string, value: unknown) {
  pending.get(id)?.done(value);
}

/** A closed session answers nothing: its open dialogs resolve with their defaults. */
export function cancelFor(key: string) {
  for (const { request, done } of [...pending.values()]) if (request.key === key) done(undefined);
}

export function resendPending(send: Send) {
  for (const { request } of pending.values()) send({ type: "ui.request", request });
}

/** Show a dialog in the window and wait. Timeout, abort or no answer → fallback. */
export function ask<T>(send: Send, body: Body, fallback: T, opts?: ExtensionUIDialogOptions): Promise<T> {
  if (opts?.signal?.aborted) return Promise.resolve(fallback);
  const request = { id: randomUUID(), ...body } as UIRequest;
  return new Promise<T>((resolve) => {
    const done = (value: unknown) => {
      clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", cancel);
      pending.delete(request.id);
      send({ type: "ui.done", id: request.id });
      resolve(value === undefined || value === null ? fallback : (value as T));
    };
    const cancel = () => done(undefined);
    const timer = opts?.timeout ? setTimeout(cancel, opts.timeout) : undefined;
    opts?.signal?.addEventListener("abort", cancel, { once: true });
    pending.set(request.id, { request, done });
    send({ type: "ui.request", request });
  });
}

const THEME_KEY = Symbol.for("@earendil-works/pi-coding-agent:theme");

/** ctx.ui for extensions. Dialogs go to the window; terminal-only parts do nothing (as in pi's RPC mode). */
export function uiContextFor(key: string, send: Send): ExtensionUIContext {
  const noop = () => {};
  return {
    select: (title, options, opts) => ask(send, { key, method: "select", title, options }, undefined, opts),
    confirm: (title, message, opts) => ask(send, { key, method: "confirm", title, message }, false, opts),
    input: (title, placeholder, opts) => ask(send, { key, method: "input", title, placeholder }, undefined, opts),
    editor: (title, prefill) => ask(send, { key, method: "editor", title, placeholder: prefill }, undefined),
    notify: (message, level = "info") => send({ type: "notify", key, message, level }),
    onTerminalInput: () => noop,
    // The design canvas extension reports its server address here; the window shows it in a panel.
    setStatus: (id, text) => {
      if (id === "tau-canvas" && text) send({ type: "canvas", key, url: text });
      if (id === "tau-canvas-build" && text) {
        try {
          send({ type: "canvas.build", key, ...JSON.parse(text) }); // { title, text }
        } catch {
          send({ type: "notify", key, level: "error", message: "The design pack could not be read" });
        }
      }
    },
    setWorkingMessage: noop,
    setWorkingVisible: noop,
    setWorkingIndicator: noop,
    setHiddenThinkingLabel: noop,
    setWidget: noop,
    setFooter: noop,
    setHeader: noop,
    setTitle: noop,
    custom: async () => undefined as never,
    pasteToEditor: noop,
    setEditorText: noop,
    getEditorText: () => "",
    addAutocompleteProvider: noop,
    setEditorComponent: noop,
    getEditorComponent: () => undefined,
    get theme() {
      return (globalThis as Record<symbol, never>)[THEME_KEY];
    },
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: "Themes are not supported in Tau yet" }),
    getToolsExpanded: () => false,
    setToolsExpanded: noop,
  };
}
