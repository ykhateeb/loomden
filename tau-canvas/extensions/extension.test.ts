import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// typebox and pi come from the host at runtime; stub them here.
vi.mock("typebox", () => ({ Type: new Proxy({}, { get: () => () => ({}) }) }));
vi.mock("@earendil-works/pi-coding-agent", () => ({ defineTool: (t: unknown) => t }));

const { default: ext } = await import("./tau-canvas.js");

describe("extension", () => {
  it("registers tools, blocks raw board writes, tells pi about notes, stops cleanly", async () => {
    const tools: Record<string, any> = {}, on: Record<string, any> = {};
    ext({
      registerTool: (t: any) => (tools[t.name] = t),
      registerCommand: () => {},
      on: (n: string, f: any) => (on[n] = f),
      sendUserMessage: () => {},
    } as any);
    expect(Object.keys(tools)).toEqual(["canvas_create", "canvas_read", "canvas_edit", "canvas_note_done", "design_system_propose"]);

    const cwd = await mkdtemp(join(tmpdir(), "tau-ext-"));
    const ctx = { cwd };
    const html = "<body><button>Pay</button></body>";
    await tools.canvas_create.execute("1", { canvas: "c1", board: "cart", title: "Cart", w: 390, h: 844, html }, null, null, ctx);
    const read = await tools.canvas_read.execute("2", { canvas: "c1", board: "cart" }, null, null, ctx);
    expect(read.content[0].text).toContain("rev 1");
    await expect(tools.canvas_edit.execute("3", { canvas: "c1", board: "cart", baseRev: 0, html }, null, null, ctx)).rejects.toThrow(/Read it again/);

    const blocked = on.tool_call({ toolName: "write", input: { path: ".tau/canvases/c1/boards/cart.html" } }, ctx);
    expect(blocked.block).toBe(true);
    expect(on.tool_call({ toolName: "write", input: { path: "src/a.ts" } }, ctx)).toBeUndefined();

    expect(on.tool_call({ toolName: "write", input: { path: ".tau/design-system/tokens.json" } }, ctx).block).toBe(true);
    await tools.design_system_propose.execute("4", { tokens: { name: "app", color: { tokens: [{ name: "link", value: "#4e6f94" }] } } }, null, null, ctx);
    const before = await on.before_agent_start({}, ctx);
    expect(before.message.content).toContain("Canvas c1: boards/cart.html rev 1");
    on.session_shutdown();
    on.session_shutdown();
  });
});
