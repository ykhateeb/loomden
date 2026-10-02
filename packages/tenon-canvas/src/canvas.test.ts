import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startServer } from "./server.js";
import { RAW_BOARD, RAW_STATE, RAW_TOKENS, canvasMoves, compareBoard, designPack, readCompares, setDifferenceState, freeRoot, gitignoreMissing, moveCanvases, moveDesignSystem, acceptProposal, addNote, approve, flow, restoreRev, dsReport, patchBoard, proposeTokens, readHistory, undoBoard, createBoard, editBoard, ensureGitignore, readBoard, readCanvas, stamp, tokensCss, writeTokensCss, patchHtml, diffFacts, keepDecisions, boardFacts } from "./store.js";

const html = `<html><head><title>x</title></head><body><button>Pay</button><a href="b.html">Next</a></body></html>`;
const setup = async () => {
  const proj = await mkdtemp(join(tmpdir(), "tenon-"));
  return { proj, root: join(proj, ".tenon", "canvases") };
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
    await editBoard(root, { canvas: "c1", board: "cart", baseRev: 1, edits: [{ find: "Pay", replace: "Pay now" }] });
    expect((await readBoard(root, "c1", "cart")).rev).toBe(2);
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
    expect(RAW_BOARD.test("/p/.tenon/canvases/c1/boards/cart.html")).toBe(true);
    expect(RAW_BOARD.test("/p/.tenon/canvases/c1/canvas.json")).toBe(false);
  });

  it("keeps notes, tokens and gitignore", async () => {
    const { proj, root } = await setup();
    await createBoard(root, { canvas: "c1", board: "cart", title: "Cart", w: 390, h: 844, html });
    await addNote(root, "c1", { id: "n1", board: "cart", target: { tid: "2", text: "Pay", box: [1, 2, 3, 4] }, text: "bigger" });
    expect((await readCanvas(root, "c1")).notes.n1.state).toBe("open");
    await expect(addNote(root, "c1", { id: "n1", board: "cart", target: { tid: "2", text: "Pay", box: [1, 2, 3, 4] }, text: "again" })).rejects.toThrow(/exists/);
    await expect(addNote(root, "c1", { id: "../x", board: "cart", target: { tid: "2", text: "Pay", box: [1, 2, 3, 4] }, text: "x" })).rejects.toThrow(/Bad note id/);
    const ds = join(proj, ".tenon", "design-system");
    await mkdir(ds, { recursive: true });
    await writeFile(join(ds, "tokens.json"), JSON.stringify({ color: { tokens: [{ name: "link", value: "#4e6f94" }] } }));
    expect(await tokensCss(ds)).toContain("--link: #4e6f94;");
    await writeTokensCss(ds);
    expect(await readFile(join(ds, "tokens.css"), "utf8")).toContain("--link: #4e6f94;");
    await mkdir(join(proj, ".git"));
    expect(await gitignoreMissing(proj)).toBe(true);
    await ensureGitignore(proj);
    expect(await gitignoreMissing(proj)).toBe(false);
    await ensureGitignore(proj);
    expect((await readFile(join(proj, ".gitignore"), "utf8")).split("\n").filter(Boolean)).toHaveLength(1); // the line is there once
  });
});

describe("server", () => {
  it("needs the token, injects tokens and the point script, sends notes", async () => {
    const { root } = await setup();
    await createBoard(root, { canvas: "c1", board: "cart", title: "Cart", w: 390, h: 844, html });
    const sent: string[] = [];
    const s = await startServer({ root, onSend: (t) => { sent.push(t); } });
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
        body: JSON.stringify({ canvas: "c1", send: true, note: { id: "n1", board: "cart", target: { tid: "2", text: "Pay", box: [0, 0, 1, 1] }, text: "bigger" } }),
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
    const ds = join(proj, ".tenon", "design-system");
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

describe("edit mode", () => {
  const page = `<body><h1 style="color: red">Total</h1><p>Pay <b>now</b></p><img src="x.png"/></body>`;

  it("patches text and token styles as revs by you, undoes, rejects raw values", async () => {
    const { root } = await setup();
    await createBoard(root, { canvas: "c1", board: "cart", title: "Cart", w: 1, h: 1, html: page });
    const tid = (await readBoard(root, "c1", "cart")).html.match(/<h1[^>]*data-tid="(\d+)"/)![1];

    await patchBoard(root, { canvas: "c1", board: "cart", id: "e1", tid, text: "Total <to> pay" });
    let b = await readBoard(root, "c1", "cart");
    expect(b.rev).toBe(2);
    expect(b.by).toBe("you");
    expect(b.html).toContain("Total &lt;to&gt; pay</h1>");

    await patchBoard(root, { canvas: "c1", board: "cart", id: "e2", tid, style: { color: "var(--ink)", "margin-top": "var(--space-2)" } });
    b = await readBoard(root, "c1", "cart");
    expect(b.html).toContain('style="color: var(--ink); margin-top: var(--space-2)"');

    await expect(patchBoard(root, { canvas: "c1", board: "cart", id: "x", tid, style: { color: "#ff0000" } })).rejects.toThrow(/Only design-system values/);
    await expect(patchBoard(root, { canvas: "c1", board: "cart", id: "x", tid, style: { "background-image": "var(--x)" } })).rejects.toThrow(/Only design-system values/);
    await expect(patchBoard(root, { canvas: "c1", board: "cart", id: "x", tid: "999", text: "x" })).rejects.toThrow(/not found/);
    const img = b.html.match(/<img[^>]*data-tid="(\d+)"/)![1];
    await expect(patchBoard(root, { canvas: "c1", board: "cart", id: "x", tid: img, text: "x" })).rejects.toThrow(/no text/);

    // undo brings back the content before your last edit, as a new rev
    await undoBoard(root, "c1", "cart", "e2"); // the edit that made rev 3
    expect((await readBoard(root, "c1", "cart")).rev).toBe(4);
    expect((await readBoard(root, "c1", "cart")).html).toContain("color: red");
    // not when someone else changed the board since
    await expect(undoBoard(root, "c1", "cart", "e2")).rejects.toThrow(/nothing to undo/);
    await expect(undoBoard(root, "c1", "cart", "e1")).rejects.toThrow(/nothing to undo/); // an older edit

    const h = await readHistory(root, "c1", "cart");
    expect(h.map((e) => `${e.rev}:${e.by}`)).toEqual(["4:you", "3:you", "2:you", "1:pi"]);
    expect(h[0].quiet).toBeUndefined(); // the edit was reported to pi, so its undo is too
    // a quiet edit is undone quietly
    await patchBoard(root, { canvas: "c1", board: "cart", id: "e3", tid, text: "Quiet", tell: false });
    await undoBoard(root, "c1", "cart", "e3");
    expect((await readHistory(root, "c1", "cart"))[0].quiet).toBe(true);
  });
});

describe("play, restore, approve", () => {
  it("reads links, restores as a new rev, approves into approved/", async () => {
    const { root } = await setup();
    await createBoard(root, { canvas: "c1", board: "cart", title: "Cart", w: 1, h: 1, html: `<a href="pay.html"><b>Pay</b> now</a><a href="done.html">Done</a><a href="https://x.com">out</a><a href='PAY.html#top'>again</a>` });
    await createBoard(root, { canvas: "c1", board: "pay", title: "Pay", w: 1, h: 1, html: "<p>pay</p>" });
    expect((await flow(root, "c1")).links).toEqual([
      { from: "boards/cart.html", fromTitle: "Cart", text: "Pay now", name: "pay", to: "boards/pay.html" },
      { from: "boards/cart.html", fromTitle: "Cart", text: "Done", name: "done", to: null },
      { from: "boards/cart.html", fromTitle: "Cart", text: "again", name: "PAY", to: "boards/pay.html" }, // any case, quotes, a fragment
    ]);

    await editBoard(root, { canvas: "c1", board: "cart", baseRev: 1, html: "<p>v2</p>" });
    await restoreRev(root, "c1", "cart", 1);
    expect((await readBoard(root, "c1", "cart")).rev).toBe(3); // restore adds a rev, it deletes nothing
    expect((await readBoard(root, "c1", "cart")).html).toContain('href="pay.html"');
    await expect(restoreRev(root, "c1", "cart", 9)).rejects.toThrow(/not found/);

    expect((await readCanvas(root, "c1")).boards["boards/cart.html"].approved).toBeUndefined();
    await approve(root, "c1", "cart");
    expect((await readCanvas(root, "c1")).boards["boards/cart.html"].approved).toBe(3);
    expect(await readFile(join(root, "c1", "approved", "cart.html"), "utf8")).toContain('href="pay.html"');
    // a later edit does not move the approval: the board shows as changed since
    await editBoard(root, { canvas: "c1", board: "cart", baseRev: 3, html: "<p>v4</p>" });
    const m = (await readCanvas(root, "c1")).boards["boards/cart.html"];
    expect([m.rev, m.approved]).toEqual([4, 3]);
    expect(await readFile(join(root, "c1", "approved", "cart.html"), "utf8")).toContain('href="pay.html"');
  });

  it("guards canvas.json, approved/ and history/ from raw writes", () => {
    for (const f of ["canvas.json", "approved/cart.html", "history/log.jsonl"]) expect(RAW_STATE.test(`/p/.tenon/canvases/c1/${f}`)).toBe(true);
    expect(RAW_STATE.test("/p/.tenon/canvases/c1/assets/a.png")).toBe(false);
  });
});

describe("free session canvases", () => {
  it("moves into the project, keeps both when a name is taken, and is guarded like a project canvas", async () => {
    const { proj, root } = await setup();
    const free = freeRoot(join(proj, "free"), "abc123");
    await createBoard(free, { canvas: "landing", board: "hero", title: "Hero", w: 1, h: 1, html });
    await createBoard(root, { canvas: "landing", board: "old", title: "Old", w: 1, h: 1, html });
    const moves = await canvasMoves(free, root);
    expect(moves).toEqual([{ from: "landing", to: "landing-2" }]);
    await moveCanvases({ fromRoot: free, toRoot: root, moves });
    expect(Object.keys((await readCanvas(root, "landing-2")).boards)).toEqual(["boards/hero.html"]);
    expect(Object.keys((await readCanvas(root, "landing")).boards)).toEqual(["boards/old.html"]); // the project's own canvas is untouched
    expect(await readdir(free)).toEqual([]); // nothing is left behind
    expect(await canvasMoves(free, root)).toEqual([]);

    // the session's design system comes too, but never over the project's own
    const fromDs = join(free, "..", "design-system"), toDs = join(proj, ".tenon", "design-system");
    await mkdir(fromDs, { recursive: true });
    await writeFile(join(fromDs, "tokens.json"), "{}");
    await mkdir(toDs, { recursive: true });
    await moveDesignSystem(fromDs, toDs);
    expect(await readdir(toDs)).toEqual([]); // the project's own one stays
    await rm(toDs, { recursive: true });
    await moveDesignSystem(fromDs, toDs);
    expect(await readFile(join(toDs, "tokens.json"), "utf8")).toBe("{}");

    const guarded = "/h/.tenon/sessions/abc123/canvases/landing/boards/hero.html";
    expect(RAW_BOARD.test("/data/tenon-home/sessions/abc123/canvases/landing/boards/hero.html")).toBe(true); // TENON_DIR need not be called .tenon
    expect(RAW_BOARD.test(guarded)).toBe(true);
    expect(RAW_STATE.test("/h/.tenon/sessions/abc123/canvases/landing/canvas.json")).toBe(true);
    expect(RAW_TOKENS.test("/h/.tenon/sessions/abc123/design-system/tokens.json")).toBe(true);
  });
});

describe("sending notes", () => {
  it("keeps a note unsent when pi cannot take it", async () => {
    const { root } = await setup();
    await createBoard(root, { canvas: "c1", board: "cart", title: "Cart", w: 1, h: 1, html });
    const s = await startServer({ root, onSend: async () => { throw new Error("Open a session in this project"); } });
    try {
      const base = s.url("c1").replace("/c/c1", "");
      const res = await fetch(`${base}/api/note`, {
        method: "POST",
        body: JSON.stringify({ canvas: "c1", send: true, note: { id: "n1", board: "cart", target: { tid: "2", text: "Pay", box: [0, 0, 1, 1] }, text: "bigger" } }),
      });
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("Open a session");
      expect((await readCanvas(root, "c1")).notes.n1.state).toBe("open"); // not lost, not marked sent
    } finally {
      s.close();
    }
  });
});

describe("build pack and compare with the app", () => {
  const cart = `<body><h1 style="font-weight: var(--label-strong-font-weight); margin-top: var(--space-4)">Total</h1><p style="color: var(--ink)">Pay $48.20</p></body>`;
  const tokens = { name: "app", color: { tokens: [{ name: "ink", value: "#1b1f24" }, { name: "danger", value: "#c2553d" }] }, spacing: { tokens: [{ name: "space-4", value: "16px" }] },
    type: { styles: [{ name: "label-strong", fontSize: "12px", lineHeight: "16px", fontWeight: 650 }] } };

  it("makes the pack only when every board is approved", async () => {
    const { proj, root } = await setup();
    const ds = join(proj, ".tenon", "design-system");
    await proposeTokens(ds, tokens);
    await acceptProposal(ds);
    await createBoard(root, { canvas: "c1", board: "cart", title: "Cart", w: 1, h: 1, html: cart });
    await createBoard(root, { canvas: "c1", board: "pay", title: "Payment", w: 1, h: 1, html: "<p>pay</p>" });
    await approve(root, "c1", "cart");
    await expect(designPack(root, "c1", ds)).rejects.toThrow("Approve Payment first");

    await addNote(root, "c1", { id: "n1", board: "cart", target: { tid: "2", text: "Total", box: [0, 0, 1, 1] }, text: "Make it bold" });
    await (await import("./store.js")).setNoteState(root, "c1", ["n1"], "done");
    await approve(root, "c1", "pay");
    const pack = await designPack(root, "c1", ds);
    expect(pack.title).toBe("c1");
    expect(pack.text).toContain(`Cart (rev 1): ${join(root, "c1", "approved", "cart.html")}`);
    expect(pack.text).toContain("Done notes (1):");
    expect(pack.text).toContain("Cart › “Total”: Make it bold");
    expect(pack.text).toContain("label-strong 12px/16px 650 (var(--label-strong-font-size)");
    expect(pack.text).toContain("space-4 16px");
    expect(pack.text).toContain("- ink #1b1f24");
    expect(pack.text).not.toContain("danger"); // no board uses it
  });

  it("finds differences between the approved board and the app", async () => {
    const { proj, root } = await setup();
    const ds = join(proj, ".tenon", "design-system");
    await proposeTokens(ds, tokens);
    await acceptProposal(ds);
    await createBoard(root, { canvas: "c1", board: "cart", title: "Cart", w: 1, h: 1, html: cart });
    await approve(root, "c1", "cart");
    // the board changes after approval: the comparison still uses the approved rev
    await editBoard(root, { canvas: "c1", board: "cart", baseRev: 1, edits: [{ find: ">Total<", replace: ">Total v2<" }] });
    const shot = join(proj, "app.png");
    await writeFile(shot, "png");

    await compareBoard(root, "c1", ds, {
      board: "cart",
      screenshot: shot,
      app: [
        { text: "Total", styles: { fontWeight: 400, marginTop: 16 } }, // weight differs, gap matches (16 = 16px)
        { text: "Pay $48.20", styles: { color: "#1B1F24" } },          // same color, any case
        { text: "Extra text" },
      ],
    });
    const r = (await readCompares(root, "c1"))["boards/cart.html"];
    expect(r.rev).toBe(1);
    expect(r.differences.map((d) => d.title)).toEqual(["Total: font-weight differs", "“Extra text” is not on the board"]);
    expect(r.differences[0].detail).toBe("The board uses label-strong-font-weight (650). The app uses 400.");
    expect(r.screenshot).toBe("cart.png");
    expect(await readFile(join(root, "c1", "compare", "cart.png"), "utf8")).toBe("png");

    await expect(compareBoard(root, "c1", ds, { board: "cart", app: [], screenshot: join(proj, "x.txt") })).rejects.toThrow(/png, jpg or webp/);
    await setDifferenceState(root, "c1", "cart", "d1", "fix");
    expect((await readCompares(root, "c1"))["boards/cart.html"].differences[0].state).toBe("fix");
    await expect(setDifferenceState(root, "c1", "cart", "d9", "fix")).rejects.toThrow(/not found/);
  });

  it("pairs repeated text in order, ignores line breaks, and keeps decisions when it runs again", async () => {
    const { proj, root } = await setup();
    const ds = join(proj, ".tenon", "design-system");
    await proposeTokens(ds, tokens);
    await acceptProposal(ds);
    const html2 = `<body><h2 style="font-weight: var(--label-strong-font-weight)">Pay</h2><button style="font-weight: 400">Pay</button><p>Pay
      now</p></body>`;
    await createBoard(root, { canvas: "c1", board: "cart", title: "Cart", w: 1, h: 1, html: html2 });
    const app = [
      { text: "Pay", styles: { fontWeight: 650 } },   // the heading: matches
      { text: "Pay", styles: { fontWeight: 700 } },   // the button: differs from 400
      { text: "Pay now" },
    ];
    const compared = async (a: typeof app) => {
      await compareBoard(root, "c1", ds, { board: "cart", app: a });
      return (await readCompares(root, "c1"))["boards/cart.html"];
    };
    let r = await compared(app);
    expect(r.differences.map((d) => d.title)).toEqual(["Pay: font-weight differs"]);
    expect(r.differences[0].detail).toBe("The board uses 400. The app uses 700.");

    await setDifferenceState(root, "c1", "cart", "d1", "wrong");
    r = await compared(app);
    expect(r.differences[0].state).toBe("wrong"); // a decision survives a new run
    r = await compared([{ text: "Pay", styles: { fontWeight: 650 } }, { text: "Pay", styles: { fontWeight: 500 } }, { text: "Pay now" }]);
    expect(r.differences[0].state).toBe("open"); // a new difference starts open
  });
});


describe("server: ask and compare decisions", () => {
  it("refuses an empty ask, and a decision is sent to pi once", async () => {
    const { proj, root } = await setup();
    const ds = join(proj, ".tenon", "design-system");
    await proposeTokens(ds, tokens0);
    await acceptProposal(ds);
    await createBoard(root, { canvas: "c1", board: "cart", title: "Cart", w: 1, h: 1, html: `<p style="font-weight: 400">Pay</p>` });
    await compareBoard(root, "c1", ds, { board: "cart", app: [{ text: "Pay", styles: { fontWeight: 700 } }] });
    const sent: string[] = [];
    const s = await startServer({ root, onSend: (t) => void sent.push(t) });
    try {
      const base = s.url("c1").replace("/c/c1", "");
      const post = (path: string, body: object) => fetch(`${base}/api/${path}`, { method: "POST", body: JSON.stringify({ canvas: "c1", ...body }) });
      expect((await post("ask", {})).status).toBe(400);
      expect((await post("ask", { text: "  " })).status).toBe(400);
      expect(sent).toEqual([]);
      await post("compare", { board: "cart", id: "d1", action: "fix" });
      await post("compare", { board: "cart", id: "d1", action: "fix" }); // a double click
      expect(sent).toHaveLength(1);
      expect((await post("compare", { board: "cart", id: "d1", action: "nope" })).status).toBe(400);
    } finally {
      s.close();
    }
  });
});
const tokens0 = { name: "app", color: { tokens: [{ name: "ink", value: "#111" }] } };

describe("pure helpers (no disk)", () => {
  it("patchHtml changes the own text or merges the style of one element", () => {
    const html = `<h1 data-tid="1" style="color: red">Total</h1><p data-tid="2">Pay <b data-tid="3">now</b></p>`;
    expect(patchHtml(html, { tid: "1", text: "Sum" })).toEqual({ html: `<h1 data-tid="1" style="color: red">Sum</h1><p data-tid="2">Pay <b data-tid="3">now</b></p>`, why: "text “Total” → “Sum”" });
    expect(patchHtml(html, { tid: "1", style: { color: "var(--ink)" } }).html).toContain(`style="color: var(--ink)"`);
    expect(patchHtml(html, { tid: "2", style: { padding: "var(--s)" } }).why).toBe("padding of element 2");
    expect(() => patchHtml(html, { tid: "9", text: "x" })).toThrow(/not found/);
  });

  it("diffFacts pairs repeated text in order, and keepDecisions keeps a person's decision", () => {
    const facts = boardFacts(`<h2 style="font-weight: 650">Pay</h2><button style="font-weight: 400">Pay</button>`, new Map());
    const found = diffFacts(facts, [{ text: "Pay", styles: { fontWeight: 650 } }, { text: "Pay", styles: { fontWeight: 700 } }, { text: "Extra" }]);
    expect(found.map((d) => d.title)).toEqual(["Pay: font-weight differs", "“Extra” is not on the board"]);
    const first = keepDecisions(found);
    expect(first.map((d) => [d.id, d.state])).toEqual([["d1", "open"], ["d2", "open"]]);
    const before = { board: "boards/x.html", rev: 1, at: "", differences: [{ ...first[0], state: "wrong" as const }] };
    expect(keepDecisions(found, before)[0].state).toBe("wrong");
  });
});
