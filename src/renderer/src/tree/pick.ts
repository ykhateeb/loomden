import type { BranchCard, PreviewRow, SessionTree } from "#protocol";

/** What the user picked in the tree: a row of the current branch, or a branch card. */
export type Picked = { kind: "row"; row: PreviewRow } | { kind: "card"; card: BranchCard };

/** The entry of a row: a tool row has its own id, with ":tool" at the end. */
export const entryId = (row: PreviewRow) => row.id.replace(/:tool$/, "");

/** What each action of the tree does with the pick. */
export type PickTargets = {
  /** Where "Switch to branch" and Clone go. */
  target?: string;
  /** Where Fork starts: a message you wrote (the row itself, or the first one on the card's branch). */
  forkId?: string;
  /** What a label marks. */
  labelId?: string;
  /** The pick is pi's current point: there is nothing to switch to. */
  isHere: boolean;
  /** A switch leaves the current branch, so a summary of it can be kept. */
  leavesBranch: boolean;
};

export function pickTargets(pick: Picked | undefined, tree: Pick<SessionTree, "leafId" | "here">): PickTargets {
  if (!pick) return { isHere: false, leavesBranch: false };
  if (pick.kind === "card") {
    const { card } = pick;
    return { target: card.leafId, forkId: card.forkId, labelId: card.id, isHere: card.current && card.leafId === tree.leafId, leavesBranch: !card.current };
  }
  // pi's point can be on an entry with no row (a label, a model change): compare with its row.
  const id = entryId(pick.row);
  return { target: id, forkId: pick.row.kind === "you" ? id : undefined, labelId: id, isHere: id === tree.here, leavesBranch: false };
}
