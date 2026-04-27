import type {
	ExportWarning,
	PageIR,
	StudioPluginContext,
} from "@anvilkit/core/types";

/**
 * Build a {@link PageIR} from the live Studio context. Supplied by the
 * host so the React export header action can run end-to-end without the
 * plugin needing access to the host's Puck `Config`.
 *
 * Hosts typically implement this with `puckDataToIR(ctx.getData(),
 * puckConfig)` from `@anvilkit/ir`.
 */
export type IRBuilder = (
	ctx: StudioPluginContext,
) => PageIR | Promise<PageIR>;

/**
 * Public options bag for `@anvilkit/plugin-export-react`.
 *
 * Declared as an identity-shaped record so it satisfies the
 * `ExportOptions` constraint from `@anvilkit/core` while remaining
 * strongly typed for plugin consumers.
 */
export interface ReactExportOptions extends Record<string, unknown> {
	/**
	 * Output syntax. `"tsx"` (default) keeps TypeScript return-type
	 * annotations on the emitted page component. `"jsx"` strips them.
	 */
	readonly syntax?: "tsx" | "jsx";
	/**
	 * Module system the emitted file targets. `"esm"` (default) emits
	 * `import`/`export default`; `"cjs"` emits `require`/`module.exports`.
	 */
	readonly moduleResolution?: "esm" | "cjs";
	/**
	 * When `false`, component `import` statements are omitted from the
	 * emitted source — useful for downstream bundlers that inject their
	 * own imports. Defaults to `true`.
	 */
	readonly includeImports?: boolean;
	/**
	 * How asset URL props are rendered.
	 *
	 * - `"url-prop"` (default): assets stay as string URLs exactly as
	 *   they appear in the IR (matches `plugin-export-html` behavior).
	 * - `"static-import"`: every local relative-path asset URL is
	 *   rewritten into a top-of-file `import` binding, and the prop
	 *   value becomes `{binding}` — the Vite/Next-friendly path for
	 *   hashed/fingerprinted bundler inputs. External CDN URLs keep
	 *   `"url-prop"` behavior under this strategy (with a warning).
	 */
	readonly assetStrategy?: "static-import" | "url-prop";
	/**
	 * Optional builder used by the export header action to obtain a
	 * {@link PageIR} from the live Studio context. When provided, the
	 * action runs the format and broadcasts an `anvilkit:export:ready`
	 * event with the resulting payload. When omitted, the action falls
	 * back to broadcasting an `anvilkit:export:request` event so the
	 * host can perform the export itself.
	 */
	readonly buildIR?: IRBuilder;
}

/**
 * Fully-resolved options after defaults are applied. Every field is
 * required so internal call sites can destructure without narrowing.
 */
export interface ResolvedReactExportOptions {
	readonly syntax: "tsx" | "jsx";
	readonly moduleResolution: "esm" | "cjs";
	readonly includeImports: boolean;
	readonly assetStrategy: "static-import" | "url-prop";
}

/**
 * Default option values applied by `resolveReactExportOptions`.
 */
export const REACT_EXPORT_DEFAULTS: ResolvedReactExportOptions = {
	syntax: "tsx",
	moduleResolution: "esm",
	includeImports: true,
	assetStrategy: "url-prop",
};

/**
 * Apply `REACT_EXPORT_DEFAULTS` to a partial options bag.
 */
export function resolveReactExportOptions(
	opts?: ReactExportOptions,
): ResolvedReactExportOptions {
	return {
		syntax: opts?.syntax ?? REACT_EXPORT_DEFAULTS.syntax,
		moduleResolution:
			opts?.moduleResolution ?? REACT_EXPORT_DEFAULTS.moduleResolution,
		includeImports: opts?.includeImports ?? REACT_EXPORT_DEFAULTS.includeImports,
		assetStrategy: opts?.assetStrategy ?? REACT_EXPORT_DEFAULTS.assetStrategy,
	};
}

/**
 * A single import emitted at the top of the React source file.
 *
 * `binding` is the local identifier (e.g. `Hero`); `source` is the
 * module specifier (e.g. `@anvilkit/hero`); `kind` drives how the
 * statement is serialized:
 *
 * - `"named"` → `import { Hero } from "@anvilkit/hero";`
 * - `"default"` → `import Hero from "@anvilkit/hero";`
 */
export interface ImportRecord {
	readonly binding: string;
	readonly source: string;
	readonly kind: "named" | "default";
}

/**
 * Deduplicated, deterministic list of imports emitted by the
 * emitter. Sorted by (kind, source, binding) so the output is
 * byte-stable across runs.
 */
export interface ImportManifest {
	readonly imports: readonly ImportRecord[];
}

/**
 * Return shape of `emitReact(ir, options)`.
 */
export interface EmitReactResult {
	readonly code: string;
	readonly imports: ImportManifest;
	readonly warnings: readonly ExportWarning[];
}
