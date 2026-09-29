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
    expect(Object.keys(tools)).toEqual(["canvas_create", "canvas_read", "canvas_edit", "canvas_note_done", "design_compare", "design_system_propose"]);

    const cwd = await mkdtemp(join(tmpdir(), "tau-ext-"));
    const ctx = { cwd };
    const html = "<body><button>Pay</button></body>";
    await tools.canvas_create.execute("1", { canvas: "c1", board: "cart", title: "Cart", w: 390, h: 844, html }, null, null, ctx);
    const read = await tools.canvas_read.execute("2", { canvas: "c1", board: "cart" }, null, null, ctx);
    expect(read.content[0].text).toContain("rev 1");
    await expect(tools.canvas_edit.execute("3", { canvas: "c1", board: "cart", baseRev: 0, html }, null, null, ctx)).rejects.toThrow(/Read it again/);

    const blocked = on.tool_call({ toolName: "write", input: { path: ".tau/canvases/c1/boards/cart.html" } }, ctx);
    expect(blocked.block).toBe(true);
    expect(on.tool_call({ toolName: "write", input: { path: ".tau/canvases/c1/canvas.json" } }, ctx).block).toBe(true); // approvals live there
    expect(on.tool_call({ toolName: "write", input: { path: "src/a.ts" } }, ctx)).toBeUndefined();

    expect(on.tool_call({ toolName: "write", input: { path: ".tau/design-system/tokens.json" } }, ctx).block).toBe(true);
    await tools.design_system_propose.execute("4", { tokens: { name: "app", color: { tokens: [{ name: "link", value: "#4e6f94" }] } } }, null, null, ctx);
    const cmp = await tools.design_compare.execute("5", { canvas: "c1", board: "cart", app: [{ text: "Pay", styles: {} }, { text: "Other" }] }, null, null, ctx);
    expect(cmp.content[0].text).toContain("“Other” is not on the board");
    const before = await on.before_agent_start({}, ctx);
    expect(before.message.content).toContain("Canvas c1: boards/cart.html rev 1");
    // what you changed in edit mode reaches pi with its next turn, unless you turned "tell pi" off
    const { patchBoard, readBoard } = await import("./store.js");
    const tid = (await readBoard(join(cwd, ".tau", "canvases"), "c1", "cart")).html.match(/<button[^>]*data-tid="(\d+)"/)![1];
    await patchBoard(join(cwd, ".tau", "canvases"), { canvas: "c1", board: "cart", tid, text: "Pay now" });
    expect((await on.before_agent_start({}, ctx)).message.content).toContain("You changed boards/cart.html (rev 2)");
    await patchBoard(join(cwd, ".tau", "canvases"), { canvas: "c1", board: "cart", tid, text: "Pay", tell: false });
    expect((await on.before_agent_start({}, ctx)).message.content).not.toContain("You changed boards/cart.html (rev 3)");
    on.session_shutdown();
    on.session_shutdown();
  });
});

describe("free session", () => {
  it("keeps canvases in the session's own folder, not in no-project", async () => {
    const tools: Record<string, any> = {};
    ext({ registerTool: (t: any) => (tools[t.name] = t), registerCommand: () => {}, on: () => {}, sendUserMessage: () => {} } as any);
    const dir = await mkdtemp(join(tmpdir(), "tau-free-"));
    process.env.TAU_NO_PROJECT = join(dir, "no-project");
    process.env.TAU_FREE_DIR = join(dir, "sessions");
    try {
      const ctx = { cwd: join(dir, "no-project"), sessionManager: { getSessionId: () => "s1" } };
      await tools.canvas_create.execute("1", { canvas: "c1", board: "a", title: "A", w: 1, h: 1, html: "<p>x</p>" }, null, null, ctx);
      const { listCanvases } = await import("./store.js");
      expect(await listCanvases(join(dir, "sessions", "s1", "canvases"))).toEqual(["c1"]);
      expect(await listCanvases(join(dir, "no-project", ".tau", "canvases"))).toEqual([]);
      // another free session does not see it
      const other = { ...ctx, sessionManager: { getSessionId: () => "s2" } };
      await expect(tools.canvas_read.execute("2", { canvas: "c1" }, null, null, other)).rejects.toThrow(/not found/);
    } finally {
      delete process.env.TAU_NO_PROJECT;
      delete process.env.TAU_FREE_DIR;
    }
  });
});
