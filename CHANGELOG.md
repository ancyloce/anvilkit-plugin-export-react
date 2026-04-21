# @anvilkit/plugin-export-react

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
