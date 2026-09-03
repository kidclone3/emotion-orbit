# Agent Guidelines

## Package manager

Use **pnpm** for all Node.js dependency and script operations in this repository.

- Use `pnpm install`, not `npm install` or `yarn install`.
- Use `pnpm <script>` or `pnpm run <script>` for project scripts.
- Add and remove dependencies with `pnpm add` and `pnpm remove`.
- Keep `pnpm-lock.yaml` as the only generated dependency lockfile once the repository migration to pnpm is performed.
- Do not create or update `package-lock.json` or `yarn.lock`.

pnpm uses a shared content-addressed package store, so separate Git worktrees can install dependencies without physically duplicating every package. Each worktree still has its own `node_modules` links and local caches.

## Worktrees and dependency cleanup

- Make code changes in a focused Git worktree, never directly on `main`.
- Put Emotion Orbit worktrees under `.worktrees/<name>`.
- Run `pnpm install` only in worktrees that need dependencies.
- Remove obsolete worktrees with `git worktree remove <path>`, then run `git worktree prune`.
- Use `pnpm store prune` only as occasional maintenance. Do not run it after every worktree removal because later installs may need to download those packages again.

## Verification

Before reporting a Node.js change as complete, run the relevant pnpm commands. The default project checks are:

```bash
pnpm test
pnpm build
```
