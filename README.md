# @anvilkit/plugin-export-react

React (`.tsx` / `.jsx`) export plugin for Anvilkit Studio.
`@anvilkit/plugin-export-react` registers a `react` export format
that turns a normalized `PageIR` into ready-to-drop React source:
component imports from the `@anvilkit/<slug>` packages, JSX with
serialized props, and — optionally — `import` statements for any
referenced local assets so Vite/Next can hash and fingerprint them.

> **Beta status (`1.0.0-beta.0`).** The surface is implemented and
> tested; the emitted JSX contract may still evolve before `1.0.0`.

## Install

```bash
pnpm add @anvilkit/plugin-export-react @anvilkit/core react @puckeditor/core
```

## Quickstart

Mount the plugin alongside `@anvilkit/plugin-export-html`:

```ts
import { Studio } from "@anvilkit/core";
import { createHtmlExportPlugin } from "@anvilkit/plugin-export-html";
import { createReactExportPlugin } from "@anvilkit/plugin-export-react";
import { puckConfig } from "./puck-config";

const htmlExport = createHtmlExportPlugin({ inlineStyles: true });
const reactExport = createReactExportPlugin({
  syntax: "tsx",
  assetStrategy: "static-import",
});

<Studio puckConfig={puckConfig} plugins={[htmlExport, reactExport]} />;
```

Both the "Download HTML" and "Export React" header actions appear in
the Studio toolbar; clicking "Export React" downloads a `page.tsx`
file populated with the component imports and JSX for the current
page.

## Options

```ts
interface ReactExportOptions {
  /** "tsx" keeps TypeScript return-type annotation. Default "tsx". */
  syntax?: "tsx" | "jsx";
  /** Module system the emitted file targets. Default "esm". */
  moduleResolution?: "esm" | "cjs";
  /** Whether to emit component `import` statements. Default true. */
  includeImports?: boolean;
  /** "url-prop" keeps asset URLs as strings (default); "static-import"
   *  emits `import asset_<hash> from "./..."` + `src={asset_<hash>}`. */
  assetStrategy?: "static-import" | "url-prop";
}
```

### When to use `static-import` vs `url-prop`

- **`url-prop`** (default) — assets stay as string URLs exactly as
  they appear in the IR. Best for quick one-off snapshots and for
  remote CDN URLs where no bundler rewrite is needed.
- **`static-import`** — every asset whose URL is a relative path
  becomes an ES module `import` binding, and the JSX prop is
  rewritten to reference the binding. Vite and Next (with
  `next.config.js` + `next/image`) treat these imports as bundle
  inputs, so assets get hashed, preloaded, and fingerprinted for
  cache busting. External `https://…` URLs under `static-import`
  emit an `EXTERNAL_URL_STATIC_IMPORT` warning and fall back to
  `url-prop` behavior for that single prop.

## AST snapshots

The emitter's output is parsed through
`@typescript-eslint/typescript-estree` and compared against an AST
snapshot committed under
`src/__tests__/__snapshots__/ast-contract/`. Whitespace churn becomes
invisible to the suite, but shape churn (e.g. a missing
`ImportDeclaration`) fails loud.

**Updating snapshots.** After a deliberate emitter change:

```bash
pnpm --filter @anvilkit/plugin-export-react test -- -u
```

Review the snapshot diff in the PR — it should look JSX-like
(`ImportDeclaration`, `ExportDefaultDeclaration`, `JSXElement` children).

## Public API

| Export | Purpose |
| ------ | ------- |
| `createReactExportPlugin` | Register the React export format and header action with `@anvilkit/core`. |
| `reactFormat` | Direct `ExportFormatDefinition<ReactExportOptions>` for headless pipelines. |
| `exportReactHeaderAction` | Studio header action that exposes "Export React" in the Studio shell. |
| `emitReact` | Low-level emitter: `(ir, options) => { code, imports, warnings }`. |
| `serializeProp` | Serialize a single JSX attribute value; returns the string form + optional warning. |
| `collectImports` | Map IR component types → the `@anvilkit/<slug>` package and the default export name. |
| `collectReactAssets` | Resolve an `AssetPlan` (imports + binding rewrites) for the given strategy. |
| `ReactExportOptions` | Configure syntax, module resolution, asset strategy, and import emission. |

## Peer dependencies

| Package | Version |
| ------- | ------- |
| `react` | `^18.2.0` |
| `@puckeditor/core` | `^0.19.0` |
