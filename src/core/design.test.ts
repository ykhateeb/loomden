import { describe, expect, it } from "vitest";
import type { BoardMeta, Canvas, Note } from "#canvas/store";
import { canvasSummary } from "./design";

const disk = { slug: "app", revs: 3, images: 2, times: [] as number[] };

function board(rev: number, approved?: number): BoardMeta {
  return { title: `Board ${rev}`, x: 0, y: 0, w: 1, h: 1, rev, by: "pi", approved };
}

function note(state: Note["state"]): Note {
  return { board: "boards/a.html", target: { tid: "t", text: "", box: [] }, text: "", state, by: "me", at: "" };
}

function canvas(boards: Record<string, BoardMeta>, notes: Note[] = []): Canvas {
  return { v: 1, title: "App", designSystem: "", boards, order: Object.keys(boards), notes: Object.fromEntries(notes.map((n, i) => [String(i), n])) };
}

describe("canvasSummary", () => {
  it("is a draft with no approved board", () => {
    expect(canvasSummary(canvas({ a: board(1) }), disk).status).toBe("draft");
    expect(canvasSummary(canvas({}), disk).status).toBe("draft");
  });

  it("is in review when some boards are approved", () => {
    expect(canvasSummary(canvas({ a: board(2, 2), b: board(1) }), disk).status).toBe("review");
    expect(canvasSummary(canvas({ a: board(2, 1) }), disk).status).toBe("review");
  });

  it("is approved when each board is approved at its last rev", () => {
    expect(canvasSummary(canvas({ a: board(2, 2), b: board(1, 1) }), disk).status).toBe("approved");
  });

  it("counts the notes that are not done", () => {
    const c = canvas({ a: board(1) }, [note("open"), note("sent"), note("work"), note("done")]);
    expect(canvasSummary(c, disk).openNotes).toBe(3);
  });

  it("lists the boards of the order that exist", () => {
    const c = { ...canvas({ a: board(1, 1) }), order: ["gone", "a"] };
    expect(canvasSummary(c, disk)).toMatchObject({ slug: "app", title: "App", revs: 3, images: 2, boards: [{ title: "Board 1", rev: 1, approved: 1 }] });
  });

  it("is updated at the newest readable history time, or 0", () => {
    expect(canvasSummary(canvas({}), { ...disk, times: [5, NaN, 9] }).updated).toBe(9);
    expect(canvasSummary(canvas({}), { ...disk, times: [NaN] }).updated).toBe(0);
  });
});
