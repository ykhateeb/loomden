import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startServer } from "./server.js";
import { RAW_BOARD, acceptProposal, addNote, dsReport, proposeTokens, createBoard, editBoard, ensureGitignore, readBoard, readCanvas, stamp, tokensCss } from "./store.js";

const html = `<html><head><title>x</title></head><body><button>Pay</button><a href="b.html">Next</a></body></html>`;
const setup = async () => {
  const proj = await mkdtemp(join(tmpdir(), "tau-"));
  return { proj, root: join(proj, ".tau", "canvases") };
};

describe("store", () => {
  it("stamps stable tids, keeps existing ones", () => {
    const a = stamp(html);
    expect(a).toContain('<button data-tid="2">');
    expect(a).not.toContain("<head data-tid");
    expect(stamp(a)).toBe(a);
    expect(stamp(a.replace("</body>", "<p>new</p></body>"))).toContain('<p data-tid="4">');
  });

  it("creates revs, writes history, guards stale edits", async () => {
    const { root } = await setup();
    await createBoard(root, { canvas: "c1", board: "cart", title: "Cart", w: 390, h: 844, html });
    const b = await readBoard(root, "c1", "cart");
    expect(b.rev).toBe(1);
    const r = await editBoard(root, { canvas: "c1", board: "cart", baseRev: 1, edits: [{ find: "Pay", replace: "Pay now" }] });
    expect(r.rev).toBe(2);
    await expect(editBoard(root, { canvas: "c1", board: "cart", baseRev: 1, html })).rejects.toThrow(/changed by pi at rev 2/);
    await editBoard(root, { canvas: "c1", board: "cart", baseRev: 2, html: "<p>you</p>", by: "you" });
    await expect(editBoard(root, { canvas: "c1", board: "cart", baseRev: 2, html })).rejects.toThrow(/changed by you at rev 3/);
    const files = await readdir(join(root, "c1", "history"));
    expect(files).toEqual(expect.arrayContaining(["cart.r1.html", "cart.r2.html", "cart.r3.html", "log.jsonl"]));
    expect((await readFile(join(root, "c1", "history", "log.jsonl"), "utf8")).trim().split("\n")).toHaveLength(3);
    await expect(editBoard(root, { canvas: "c1", board: "cart", baseRev: 3, edits: [{ find: "nope", replace: "x" }] })).rejects.toThrow(/exactly once/);
  });

  it("rejects path tricks and blocks raw board writes", async () => {
    const { root } = await setup();
    await expect(createBoard(root, { canvas: "../x", board: "a", title: "", w: 1, h: 1, html })).rejects.toThrow(/Bad name/);
    expect(RAW_BOARD.test("/p/.tau/canvases/c1/boards/cart.html")).toBe(true);
    expect(RAW_BOARD.test("/p/.tau/canvases/c1/canvas.json")).toBe(false);
  });

  it("keeps notes, tokens and gitignore", async () => {
    const { proj, root } = await setup();
    await createBoard(root, { canvas: "c1", board: "cart", title: "Cart", w: 390, h: 844, html });
    const id = await addNote(root, "c1", { board: "cart", target: { tid: "2", text: "Pay", box: [1, 2, 3, 4] }, text: "bigger" });
    expect((await readCanvas(root, "c1")).notes[id].state).toBe("open");
    const ds = join(proj, ".tau", "design-system");
    await mkdir(ds, { recursive: true });
    await writeFile(join(ds, "tokens.json"), JSON.stringify({ color: { tokens: [{ name: "link", value: "#4e6f94" }] } }));
    expect(await tokensCss(ds)).toContain("--link: #4e6f94;");
    await mkdir(join(proj, ".git"));
    expect(await ensureGitignore(proj)).toBe(true);
    expect(await ensureGitignore(proj)).toBe(false);
  });
});

describe("server", () => {
  it("needs the token, injects tokens and the point script, sends notes", async () => {
    const { root } = await setup();
    await createBoard(root, { canvas: "c1", board: "cart", title: "Cart", w: 390, h: 844, html });
    const sent: string[] = [];
    const s = await startServer({ root, onSend: (t) => sent.push(t) });
    try {
      const url = s.url("c1");
      const origin = new URL(url).origin;
      expect((await fetch(`${origin}/wrong/c/c1`)).status).toBe(404);
      expect((await fetch(url)).status).toBe(200);
      const board = await fetch(`${url}/boards/cart.html`);
      expect(board.headers.get("content-security-policy")).toContain("default-src 'none'");
      const t = await board.text();
      expect(t).toContain("tokens.css");
      expect(t).toContain('data-tid="2"');
      const base = url.replace("/c/c1", "");
      const res = await fetch(`${base}/api/note`, {
        method: "POST",
        body: JSON.stringify({ canvas: "c1", send: true, note: { board: "cart", target: { tid: "2", text: "Pay", box: [0, 0, 1, 1] }, text: "bigger" } }),
      });
      expect(res.status).toBe(200);
      expect(sent).toEqual(["On board Cart, element “Pay” (tid 2): bigger"]);
      expect((await readCanvas(root, "c1")).notes.n1.state).toBe("sent");
    } finally {
      s.close();
    }
  });
});

describe("browser code", () => {
  it("has valid JavaScript", async () => {
    const { POINT_SCRIPT, VIEWER } = await import("./web.js");
    new Function(POINT_SCRIPT);
    new Function(VIEWER.split("<script>")[1].split("</script>")[0]);
  });
});

describe("design system", () => {
  const tokens = (link: string) => ({
    name: "app", color: { tokens: [{ name: "link", value: link, usage: "Links" }] },
    type: { styles: [{ name: "label", fontSize: "12px", lineHeight: "16px", fontWeight: 600 }] },
  });

  it("proposes, reports changes and usage, accepts", async () => {
    const { proj, root } = await setup();
    const ds = join(proj, ".tau", "design-system");
    await createBoard(root, { canvas: "c1", board: "cart", title: "Cart", w: 1, h: 1, html: `<a style="color:var(--link)">x</a><b style="color:var(--link, red)">y</b>` });
    await expect(proposeTokens(ds, { name: "app", color: { tokens: [{ name: "bad", value: "red; }" }] } })).rejects.toThrow(/Bad value/);
    await proposeTokens(ds, tokens("#111111"));
    let r = await dsReport(root, "c1", ds);
    expect(r.name).toBeUndefined();
    expect(r.proposal?.changes.map((c) => c.name)).toEqual(["link", "label"]);
    await acceptProposal(ds);
    r = await dsReport(root, "c1", ds);
    expect(r.version).toBe(1);
    expect(r.proposal).toBeUndefined();
    expect(r.items.find((i) => i.name === "link")?.used).toEqual([{ board: "Cart", count: 2 }]);
    expect(await readFile(join(ds, "tokens.css"), "utf8")).toContain("--label-font-size: 12px;");
    await proposeTokens(ds, tokens("#222222"));
    expect((await dsReport(root, "c1", ds)).proposal?.changes).toEqual([{ name: "link", before: "#111111", after: "#222222" }]);
    await acceptProposal(ds);
    expect((await dsReport(root, "c1", ds)).version).toBe(2);
  });
});
