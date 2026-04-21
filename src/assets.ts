import type { ExportWarning, PageIR, PageIRNode } from "@anvilkit/core/types";
import type { ImportRecord } from "./types.js";

/**
 * The set of prop keys the IR treats as asset references. Mirrors
 * `@anvilkit/ir`'s `collectAssets` pattern (deliberately kept in
 * sync with that regex to avoid a runtime dependency on internal IR
 * exports).
 */
const ASSET_PROP_KEYS = new Set([
	"src",
	"imageUrl",
	"imageSrc",
	"url",
	"videoUrl",
	"videoSrc",
	"fontUrl",
	"scriptUrl",
	"styleUrl",
	"backgroundSrc",
	"backgroundImage",
	"poster",
	"thumbnailSrc",
]);

/**
 * A rewrite entry: for an asset URL, which binding identifier the
 * emitter should substitute when it sees that URL in a prop.
 */
export interface AssetRewrite {
	/** The original URL as it appeared in the IR (exact string match). */
	readonly url: string;
	/** The local binding name (e.g. `asset_hero_bg_<hash>`). */
	readonly binding: string;
	/**
	 * The relative path the `import` statement references
	 * (e.g. `./assets/hero-bg.jpg`). Omitted for URLs that were
	 * rejected (external CDNs under `static-import`).
	 */
	readonly importPath?: string;
}

/**
 * The asset plan returned by `collectReactAssets`.
 */
export interface AssetPlan {
	/**
	 * Import records to be prepended to the emitted source (alongside
	 * the component imports). Empty for `"url-prop"`.
	 */
	readonly imports: readonly ImportRecord[];
	/**
	 * URL → binding lookup. The emitter consults this table when
	 * serializing each asset-shaped prop.
	 */
	readonly rewrites: ReadonlyMap<string, AssetRewrite>;
	/**
	 * Warnings emitted during asset resolution (e.g. when an external
	 * CDN URL is encountered under `"static-import"`).
	 */
	readonly warnings: readonly ExportWarning[];
}

/** Non-cryptographic 32-bit FNV-1a hash. Matches `@anvilkit/ir`. */
function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function sanitizeForIdent(input: string): string {
	return input.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+|_+$/g, "");
}

function isExternalUrl(url: string): boolean {
	return /^(?:https?:|\/\/|data:|blob:)/i.test(url);
}

function isAssetProp(key: string): boolean {
	return ASSET_PROP_KEYS.has(key);
}

/**
 * Walk a node's props and yield every `(nodeId, propName, url)` triple
 * where the prop key matches an asset-shaped key and the value is a
 * non-empty string.
 */
function* walkAssetProps(
	node: PageIRNode,
): IterableIterator<{
	readonly nodeId: string;
	readonly propName: string;
	readonly url: string;
}> {
	const nodeId = node.id;
	for (const [key, value] of Object.entries(node.props)) {
		if (isAssetProp(key) && typeof value === "string" && value !== "") {
			yield { nodeId, propName: key, url: value };
		}
	}
	if (node.children) {
		for (const child of node.children) {
			yield* walkAssetProps(child);
		}
	}
}

/**
 * Build a deterministic binding name for an asset URL.
 *
 * Uses the URL's basename + an 8-char FNV hash to keep the name
 * stable across runs without colliding on common filenames.
 */
function deriveBindingName(url: string): string {
	const basename = url
		.split(/[?#]/, 1)[0]
		?.split("/")
		.filter(Boolean)
		.pop();
	const stem = sanitizeForIdent((basename ?? "asset").replace(/\.[^.]+$/, ""));
	const hash = fnv1a(url);
	const prefix = /^[0-9]/.test(stem) || stem === "" ? `asset_${stem}` : stem;
	return `${prefix || "asset"}_${hash}`;
}

/**
 * Normalize a relative asset path into a form usable inside an ES
 * module `import` statement. Strips leading slashes so `/assets/x.jpg`
 * becomes `./assets/x.jpg`.
 */
function toRelativeImportPath(url: string): string {
	if (url.startsWith("./") || url.startsWith("../")) return url;
	if (url.startsWith("/")) return `.${url}`;
	return `./${url}`;
}

/**
 * Resolve the asset import + rewrite plan for the given IR and
 * strategy.
 *
 * - `"url-prop"`: empty imports, no rewrites — the emitter keeps the
 *   URL as a string literal.
 * - `"static-import"`: every local relative-path URL becomes one
 *   `import` binding (deduplicated by URL). External URLs fall back
 *   to `"url-prop"` behavior with an `EXTERNAL_URL_STATIC_IMPORT`
 *   warning, so the emitter never generates broken import paths.
 */
export function collectReactAssets(
	ir: PageIR,
	strategy: "static-import" | "url-prop",
): AssetPlan {
	if (strategy === "url-prop") {
		return {
			imports: [],
			rewrites: new Map(),
			warnings: [],
		};
	}

	const rewrites = new Map<string, AssetRewrite>();
	const imports: ImportRecord[] = [];
	const warnings: ExportWarning[] = [];
	const seenUrls = new Set<string>();
	const externalUrlsReported = new Set<string>();

	for (const { nodeId, propName, url } of walkAssetProps(ir.root)) {
		if (seenUrls.has(url)) continue;
		seenUrls.add(url);

		if (isExternalUrl(url)) {
			if (!externalUrlsReported.has(url)) {
				externalUrlsReported.add(url);
				warnings.push({
					level: "warn",
					code: "EXTERNAL_URL_STATIC_IMPORT",
					message: `External URL \`${url}\` cannot be statically imported on prop \`${propName}\`; emitted as a string instead.`,
					nodeId,
				});
			}
			continue;
		}

		const binding = deriveBindingName(url);
		const importPath = toRelativeImportPath(url);
		rewrites.set(url, { url, binding, importPath });
		imports.push({
			binding,
			source: importPath,
			kind: "default",
		});
	}

	imports.sort((a, b) =>
		a.binding < b.binding ? -1 : a.binding > b.binding ? 1 : 0,
	);

	return {
		imports,
		rewrites,
		warnings,
	};
}

/** Exposed for the emitter — detect whether a given prop name should
 *  participate in the asset substitution pass. */
export function isAssetPropKey(name: string): boolean {
	return isAssetProp(name);
}
