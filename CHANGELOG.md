# @anvilkit/plugin-export-react

## 0.1.2

### Patch Changes

- Updated dependencies
  - @anvilkit/core@0.1.2

## 0.1.1

### Patch Changes

- Routine `0.1.1` patch — coordinated fixed-group bump.

  Aligns the lockstep fixed group at `0.1.1`. Additive only; no breaking
  changes. New surface area in this cut:
  - Section-level AI regeneration (`regenerateSelection`) via
    `@anvilkit/plugin-ai-copilot`, with a reusable `<AiPromptPanel>` in
    `@anvilkit/ui`.
  - `PageIRNode.meta` (locked / owner / notes / version) with diff/apply
    parity across `@anvilkit/ir`, `@anvilkit/schema`, `@anvilkit/validator`,
    and `@anvilkit/plugin-version-history`.
  - Realtime collab integration points (host plugins remain alpha).
  - Marketplace registry feed under the docs site.

- Updated dependencies
  - @anvilkit/core@0.1.1

## 1.0.0-beta.0 — 2026-04-20

### Added

- **Plugin surface** — `createReactExportPlugin`, `reactFormat`, and
  `exportReactHeaderAction` as the public React export integration
  points for `@anvilkit/core`.
- **Emitter** — `emitReact(ir, options)` walks a `PageIR`, emits a
  JSX/TSX string, and returns an `ImportManifest` plus any
  `ExportWarning`s for non-serializable props.
- **Asset pipeline** — `assetStrategy: "static-import" | "url-prop"`
  controls whether asset URLs become `import` bindings (Vite/Next
  friendly) or stay as string props.
- **AST contract** — every fixture's emitted source is parsed through
  `@typescript-eslint/typescript-estree` and compared against a
  committed AST snapshot so whitespace churn stays invisible.
- **Quality gates** — `check:publint`, `check:circular`,
  `check:peer-deps`, `check:bundle-budget` (6 KB gzipped limit).

### Notes

- **Beta release.** The emitted JSX contract may still evolve before
  `1.0.0`; consumers should pin exact versions.
- Unpublished until the Phase 5 M4 exit — the package is marked
  `"private": false` for registry readiness but no `pnpm publish` has
  been performed yet.
