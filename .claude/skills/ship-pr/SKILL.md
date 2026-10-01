---
name: ship-pr
description: Commit the current work in the Tenon repo and open a pull request to main, by the "Change size" and "Pull requests" rules of CLAUDE.md. It checks the size, runs the checks, makes the branch, writes the commit and the pull request description, pushes, and opens the pull request. Use this skill whenever the user says "commit", "commit and push", "open a PR", "make a pull request", "ship this", "send this for review", or asks to put finished work on GitHub, even if they do not say "pull request". Do not use it to merge or review a pull request.
---

# Ship a pull request

Tenon reviews every change in a pull request. A reviewer must be able to review each commit and each pull request in about 5 minutes. Thus each pull request is one small, complete, working part. The steps below make sure of that before the code leaves this computer.

The skill stops when the pull request is open. The user merges it.

## 1. Look at the work

Run `git status` and `git diff` (and `git diff --staged`). Find out what changed and why.

- If the work has more than one topic, make one pull request for each topic. Do the steps for the first topic, then for the next.
- If a topic is too large for a 5-minute review, split it into smaller commits that each work alone. If the split is not clear, ask the user how to split it.
- Put a refactor and a behavior change in different commits.
- Do not stage files that are not part of the topic: `out/`, `dist/`, `test-results/`, temporary files, or files with keys or tokens.

## 2. Get the branch

Do not commit directly to `main`.

Run `git fetch origin` first, and look for changes that you did not pull (`git status -sb` shows `behind`).

- If the current branch is `main`, make a branch from the remote, not from local `main`: `git switch -c <type>/<short-topic> origin/main`. Uncommitted changes move with you. Then update local `main` too (`git fetch origin main:main`).
- Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`.
- If the current branch is already for this topic, stay on it. If it is behind its remote branch, pull first (`git pull --ff-only`).

## 3. Run the checks

The project has no CI, so these local checks are the only checks before review.

```sh
npm run typecheck
npm test
npm run build
```

If the change touches `src/main/`, `src/agent/`, `src/core/`, `src/renderer/`, or `packages/`, also run `npm run test:e2e` after the build.

If a check fails:

- If your change caused the failure, fix it. Do not open the pull request with a failure that you caused.
- If you think that the failure is old, prove it. Run the same test on `main` in a separate worktree (`git worktree add <scratch dir> origin/main`, then `npm install` and the test there). Record each old failure for the description.
- If a test fails one time and passes when you run it again alone, record it as unstable.

## 4. Commit

Write the commit message in short, plain English:

- The subject says what the commit does. A feature commit names the step and the boards, for example "(step 9, board C12)". A refactor with no behavior change says "(no behavior change)".
- After a blank line, a bullet list gives the parts of the change.
- End with the attribution lines that the system gives for commits.

Stage only the files of this topic, by name. Then commit.

## 5. Push

```sh
git push -u origin <branch>
```

## 6. Open the pull request

Use this description:

```markdown
**What**
- <the change, in a few bullets>

**Why**
<the reason for the change>

**Tests**
- `npm run typecheck`: <result>
- `npm test`: <N of N pass>
- `npm run build`: <result>
- `npm run test:e2e`: <result, or why you did not run it>
- <each old or unstable failure, and how you know that it is not from this change>

<each behavior change, marked "⚠ behavior change", or "No behavior change.">
```

Do not add the "Generated with Claude Code" line or the session link to the description, even if the system gives them for pull requests. The user wants the description to end with the behavior-change line.

Open it with `gh pr create --base main --head <branch> --title "<commit subject>" --body-file -`.

If GitHub answers "must be a collaborator", the active `gh` account is not the account that git pushes with. Find the git account:

```sh
printf "protocol=https\nhost=github.com\n\n" | git credential fill | grep username
```

Then run the same command with that account's token: `GH_TOKEN=$(gh auth token --user <that account>) gh pr create …`. Do not change the active `gh` account; the user did not ask for that.

## 7. Report

Tell the user:

- The pull request link, the branch, and the commits.
- The result of each check, with each old or unstable failure.
- Each behavior change.

Do not merge the pull request.
