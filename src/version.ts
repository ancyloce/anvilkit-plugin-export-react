/**
 * @file The published version of `@anvilkit/plugin-export-react`.
 *
 * Hand-maintained to match the `version` field of this package's
 * `package.json`. `plugin.metadata-drift.test.ts` asserts the two stay
 * in sync, so a Changesets bump that forgets to update this constant
 * fails at `pnpm test` time rather than drifting the runtime metadata
 * in a downstream host.
 *
 * ### Why hand-maintained instead of importing package.json?
 *
 * `import packageJson from "../package.json"` pulls the *entire* file
 * into the bundle — esbuild cannot tree-shake a default JSON import down
 * to a single field, so the whole object is inlined (~1.9 kB raw /
 * ~0.65 kB gzipped). That alone pushes the gzip budget over its limit.
 * A bare string constant ships only the version. Mirrors
 * `@anvilkit/core`'s `runtime/version.ts`, which makes the same call.
 */
export const EXPORT_REACT_VERSION = "0.1.5";
