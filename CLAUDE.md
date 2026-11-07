# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

A browser-based PIC16 microcontroller simulator, written in TypeScript + React 19. The repo is currently the unmodified Vite+ React-TS starter (`src/main.tsx` mounts `src/App.tsx`, a demo page with assets in `src/assets/`). No simulator code or tests exist yet, so treat `App.tsx`, `App.css`, and the demo assets as placeholders to replace. `README.md` is template boilerplate and says nothing project-specific.

## Toolchain

The project uses **Vite+** (`vp` global CLI), not plain Vite/npm. `AGENTS.md` holds the full toolchain rules. The points that matter most:

- `vp install`: install deps (pnpm 12, pinned via `devEngines`). `vite` and `vite-plus` versions come from the `catalog:` in `pnpm-workspace.yaml`, with `vite` aliased to `@voidzero-dev/vite-plus-core`.
- `vp dev`: dev server. `vp run build`: runs the `build` script (`tsc -b && vp build`). Plain `vp build` skips the type check.
- `vp check`: format (Oxfmt) + lint (Oxlint, type-aware with type checking) in one pass. `vp check --fix` autofixes. A pre-commit hook (`staged` in `vite.config.ts`, installed into `.vite-hooks/` by the `prepare` script) runs `vp check --fix` on staged files.
- `vp test`: Vitest (built-in, no `test` script needed). Single file: `vp test path/to/file.test.ts`; single test by name: `vp test -t "name"`.
- `vp <name>` runs a built-in command; `vp run <name>` runs a `package.json` script. They can differ (e.g. `vp build` vs `vp run build`).
- Run TS scripts with `vpx <file>`; don't add `tsx`/`ts-node`.

## Conventions enforced by config

- Lint rule `vite-plus/prefer-vite-plus-imports` is an error: import `defineConfig` etc. from `vite-plus`, not `vite`/`vitest`.
- React lint: `react/rules-of-hooks` is an error; `react/only-export-components` warns (keeps Fast Refresh working, so keep non-component exports out of component files except constants).
- The React Compiler is enabled (Babel preset via `@rolldown/plugin-babel` in `vite.config.ts`), so manual `useMemo`/`useCallback`/`memo` is usually unnecessary. Components must follow the Rules of React for it to optimize them.
- TypeScript uses project references: `tsconfig.app.json` covers `src/`, `tsconfig.node.json` covers `vite.config.ts`.
- `verbatimModuleSyntax` and `erasableSyntaxOnly`: use `import type` for type-only imports, and no `enum`, `namespace`, or constructor parameter properties (use `as const` objects / union types instead).
- Relative imports include the extension (`./App.tsx`, `./foo.ts`), per `allowImportingTsExtensions` with bundler resolution.
- `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` are on. The last one matters for opcode-decode `switch` statements: every non-empty case needs a `break`/`return`.
