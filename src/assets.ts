import type {
	ExportWarning,
	IRAssetResolver,
	PageIR,
	PageIRAsset,
	PageIRNode,
} from "@anvilkit/core/types";
import type { ImportRecord } from "./types.js";

/**
 * The set of prop keys the IR treats as asset references. Mirrors
 * `@anvilkit/ir`'s `ASSET_KEY_PATTERN` regex; kept as a local copy so
 * the React plugin has no runtime dependency on `@anvilkit/ir`.
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

const ASSET_REFERENCE_PREFIX = "asset://";

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

interface AssetReferenceInfo {
	readonly kind?: PageIRAsset["kind"];
	readonly nodeId?: string;
	readonly allowSafeDataImage?: boolean;
}

const SAFE_DATA_IMAGE_KEYS = new Set([
	"src",
	"imageUrl",
	"imageSrc",
	"backgroundSrc",
	"backgroundImage",
	"poster",
	"thumbnailSrc",
]);

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
	return /^(?:https?:|\/\/|data:|blob:|file:|filesystem:|javascript:)/i.test(
		url,
	);
}

function hasTraversalSegment(url: string): boolean {
	const pathPart = url.split(/[?#]/, 1)[0] ?? "";
	return pathPart.split(/[\\/]/).some((segment) => segment === "..");
}

function hasUnsafeScheme(url: string): boolean {
	// Any `scheme:` prefix that isn't one of the known local-asset cases
	// (`./`, `../`, `/`, bare relative) is considered unsafe for static
	// import — defense in depth beyond the isExternalUrl heuristic.
	const schemeMatch = url.match(/^([A-Za-z][A-Za-z0-9+.-]*):/);
	if (!schemeMatch) return false;
	const scheme = schemeMatch[1]?.toLowerCase();
	return scheme !== undefined;
}

function isAssetProp(key: string): boolean {
	return ASSET_PROP_KEYS.has(key);
}

export async function resolveReactAssetUrls(
	ir: PageIR,
	assetResolvers: readonly IRAssetResolver[] = [],
): Promise<{ ir: PageIR; warnings: readonly ExportWarning[] }> {
	const blockedUrls = new Set<string>();
	const rewrittenUrls = new Map<string, string>();
	const references = collectAssetReferences(ir);

	// Resolve concurrently; an asset-manager resolver may be async, and
	// awaiting one at a time gives N×M latency for N assets and M ms per
	// resolver call. Per-entry warnings are collected in declaration
	// order after all promises settle.
	type EntryResult = {
		readonly url: string;
		readonly blocked: boolean;
		readonly rewrittenTo?: string;
		readonly warning?: ExportWarning;
	};

	const entries = [...references.entries()];
	const settled = await Promise.all(
		entries.map(async ([url, info]): Promise<EntryResult | null> => {
			const assetId = parseAssetId(url);
			if (assetId === null) {
				return null;
			}

			try {
				const resolution = await resolveWithResolvers(url, assetResolvers);
				if (resolution === null) {
					return {
						url,
						blocked: true,
						warning: makeUnresolvedWarning(assetId, info.nodeId),
					};
				}

				const normalizedUrl = normalizeResolvedAssetUrl(resolution.url, {
					allowSafeDataImage:
						info.kind === "image" || info.allowSafeDataImage === true,
				});
				if (!normalizedUrl) {
					return {
						url,
						blocked: true,
						warning: {
							level: "warn",
							code: "ASSET_UNRESOLVED",
							message: `Asset "${assetId}" resolved to a disallowed URL during React export and was omitted.`,
							...(info.nodeId ? { nodeId: info.nodeId } : {}),
						},
					};
				}

				return { url, blocked: false, rewrittenTo: normalizedUrl };
			} catch (error) {
				if (!isAssetResolutionError(error)) {
					throw error;
				}

				return {
					url,
					blocked: true,
					warning: {
						level: "warn",
						code: "ASSET_UNRESOLVED",
						message: error.message,
						...(info.nodeId ? { nodeId: info.nodeId } : {}),
					},
				};
			}
		}),
	);

	const warnings: ExportWarning[] = [];
	for (const result of settled) {
		if (result === null) continue;
		if (result.blocked) {
			blockedUrls.add(result.url);
		} else if (result.rewrittenTo !== undefined) {
			rewrittenUrls.set(result.url, result.rewrittenTo);
		}
		if (result.warning) {
			warnings.push(result.warning);
		}
	}

	if (blockedUrls.size === 0 && rewrittenUrls.size === 0) {
		return { ir, warnings };
	}

	const nextIr: PageIR = {
		version: ir.version,
		root: cloneNode(ir.root, rewrittenUrls, blockedUrls),
		assets: ir.assets
			.map((asset) => cloneAsset(asset, rewrittenUrls, blockedUrls))
			.filter((asset): asset is PageIRAsset => asset !== null),
		metadata: cloneDetachedObject(ir.metadata),
	};

	return {
		ir: deepFreeze(nextIr),
		warnings,
	};
}

/**
 * Walk a node's props and yield every `(nodeId, propName, url)` triple
 * where an asset-shaped key contains a non-empty string, including
 * nested objects/arrays.
 */
function* walkAssetProps(node: PageIRNode): IterableIterator<{
	readonly nodeId: string;
	readonly propName: string;
	readonly url: string;
}> {
	const nodeId = node.id;
	yield* walkAssetValue(node.props, nodeId, undefined, new WeakSet());
	if (node.children) {
		for (const child of node.children) {
			yield* walkAssetProps(child);
		}
	}
}

function* walkAssetValue(
	value: unknown,
	nodeId: string,
	key?: string,
	seen: WeakSet<object> = new WeakSet(),
): IterableIterator<{
	readonly nodeId: string;
	readonly propName: string;
	readonly url: string;
}> {
	if (Array.isArray(value)) {
		if (seen.has(value)) {
			return;
		}
		seen.add(value);
		for (const entry of value) {
			yield* walkAssetValue(entry, nodeId, undefined, seen);
		}
		return;
	}

	if (typeof value === "string") {
		if (key !== undefined && isAssetProp(key) && value !== "") {
			yield { nodeId, propName: key, url: value };
		}
		return;
	}

	if (value === null || typeof value !== "object") {
		return;
	}
	if (seen.has(value)) {
		return;
	}
	seen.add(value);

	for (const [entryKey, entryValue] of Object.entries(
		value as Record<string, unknown>,
	)) {
		yield* walkAssetValue(entryValue, nodeId, entryKey, seen);
	}
}

/**
 * Build a deterministic binding name for an asset URL.
 *
 * Uses the URL's basename + an 8-char FNV hash to keep the name
 * stable across runs without colliding on common filenames.
 */
function deriveBindingName(url: string): string {
	const basename = url.split(/[?#]/, 1)[0]?.split("/").filter(Boolean).pop();
	const stem = sanitizeForIdent((basename ?? "asset").replace(/\.[^.]+$/, ""));
	const hash = fnv1a(url);
	if (stem === "") {
		return `asset_${hash}`;
	}
	const prefix = /^[0-9]/.test(stem) ? `asset_${stem}` : stem;
	return `${prefix}_${hash}`;
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

		if (hasTraversalSegment(url) || hasUnsafeScheme(url)) {
			warnings.push({
				level: "warn",
				code: "UNSAFE_ASSET_PATH",
				message: `Asset URL \`${url}\` on prop \`${propName}\` contains a traversal segment or non-local scheme; emitted as a string instead.`,
				nodeId,
			});
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

async function resolveWithResolvers(
	url: string,
	assetResolvers: readonly IRAssetResolver[],
) {
	for (const resolver of assetResolvers) {
		const resolution = await resolver(url);
		if (resolution !== null) {
			return resolution;
		}
	}

	return null;
}

function collectAssetReferences(ir: PageIR): Map<string, AssetReferenceInfo> {
	const references = new Map<string, AssetReferenceInfo>();

	for (const asset of ir.assets) {
		references.set(asset.url, {
			kind: asset.kind,
			allowSafeDataImage: asset.kind === "image",
		});
	}

	walkNodeForAssetReferences(ir.root, references);
	return references;
}

function walkNodeForAssetReferences(
	node: PageIRNode,
	references: Map<string, AssetReferenceInfo>,
): void {
	collectPropReferences(node.props, references, node.id);

	if (node.assets) {
		for (const asset of node.assets) {
			const current = references.get(asset.url);
			references.set(asset.url, {
				kind: current?.kind ?? asset.kind,
				nodeId: current?.nodeId ?? node.id,
				allowSafeDataImage:
					current?.allowSafeDataImage ?? asset.kind === "image",
			});
		}
	}

	if (node.children) {
		for (const child of node.children) {
			walkNodeForAssetReferences(child, references);
		}
	}
}

function collectPropReferences(
	value: unknown,
	references: Map<string, AssetReferenceInfo>,
	nodeId: string,
	key?: string,
): void {
	if (Array.isArray(value)) {
		for (const entry of value) {
			collectPropReferences(entry, references, nodeId);
		}
		return;
	}

	if (typeof value === "string") {
		if (key !== undefined && isAssetProp(key)) {
			const current = references.get(value);
			references.set(value, {
				kind: current?.kind,
				nodeId: current?.nodeId ?? nodeId,
				allowSafeDataImage:
					current?.allowSafeDataImage ?? SAFE_DATA_IMAGE_KEYS.has(key),
			});
		}
		return;
	}

	if (value === null || typeof value !== "object") {
		return;
	}

	for (const [entryKey, entryValue] of Object.entries(
		value as Record<string, unknown>,
	)) {
		collectPropReferences(entryValue, references, nodeId, entryKey);
	}
}

function cloneNode(
	node: PageIRNode,
	rewrittenUrls: ReadonlyMap<string, string>,
	blockedUrls: ReadonlySet<string>,
): PageIRNode {
	return {
		id: node.id,
		type: node.type,
		props: cloneValue(node.props, rewrittenUrls, blockedUrls) as Readonly<
			Record<string, unknown>
		>,
		...(node.children
			? {
					children: node.children.map((child) =>
						cloneNode(child, rewrittenUrls, blockedUrls),
					),
				}
			: {}),
		...(node.assets
			? {
					assets: node.assets
						.map((asset) => cloneAsset(asset, rewrittenUrls, blockedUrls))
						.filter((asset): asset is PageIRAsset => asset !== null),
				}
			: {}),
	};
}

function cloneAsset(
	asset: PageIRAsset,
	rewrittenUrls: ReadonlyMap<string, string>,
	blockedUrls: ReadonlySet<string>,
): PageIRAsset | null {
	if (blockedUrls.has(asset.url)) {
		return null;
	}

	return {
		id: asset.id,
		kind: asset.kind,
		url: rewrittenUrls.get(asset.url) ?? asset.url,
		...(asset.meta ? { meta: cloneDetachedObject(asset.meta) } : {}),
	};
}

function cloneValue(
	value: unknown,
	rewrittenUrls: ReadonlyMap<string, string>,
	blockedUrls: ReadonlySet<string>,
	key?: string,
): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => cloneValue(entry, rewrittenUrls, blockedUrls));
	}

	if (typeof value === "string") {
		if (key === undefined || !isAssetProp(key)) {
			return value;
		}

		if (blockedUrls.has(value)) {
			return "";
		}

		return rewrittenUrls.get(value) ?? value;
	}

	if (value === null || typeof value !== "object") {
		return value;
	}

	const nextValue: Record<string, unknown> = {};
	for (const [entryKey, entryValue] of Object.entries(
		value as Record<string, unknown>,
	)) {
		nextValue[entryKey] = cloneValue(
			entryValue,
			rewrittenUrls,
			blockedUrls,
			entryKey,
		);
	}

	return nextValue;
}

function normalizeResolvedAssetUrl(
	input: string,
	options: { allowSafeDataImage?: boolean } = {},
): string | undefined {
	const candidate = input.trim();
	if (!candidate) {
		return undefined;
	}

	const collapsed = stripUnsafeAscii(candidate).toLowerCase();
	if (collapsed.startsWith("//")) {
		return undefined;
	}

	const schemeMatch = collapsed.match(/^([a-z][a-z0-9+.-]*):/i);
	const scheme = schemeMatch?.[1];
	if (scheme && scheme !== "http" && scheme !== "https" && scheme !== "data") {
		return undefined;
	}
	if (
		collapsed.startsWith("data:") &&
		(!options.allowSafeDataImage || !isSafeDataImageUrl(candidate))
	) {
		return undefined;
	}

	return candidate;
}

function isSafeDataImageUrl(input: string): boolean {
	return /^data:image\/(?:png|jpe?g|gif|webp|avif)(?:;[^,]*)?,/i.test(input);
}

function stripUnsafeAscii(input: string): string {
	let output = "";
	for (const character of input) {
		const codePoint = character.charCodeAt(0);
		if (codePoint <= 0x20 || codePoint === 0x7f) {
			continue;
		}
		output += character;
	}
	return output;
}

function parseAssetId(url: string): string | null {
	if (!url.startsWith(ASSET_REFERENCE_PREFIX)) {
		return null;
	}

	const assetId = url.slice(ASSET_REFERENCE_PREFIX.length).trim();
	return assetId === "" ? null : assetId;
}

function makeUnresolvedWarning(
	assetId: string,
	nodeId?: string,
): ExportWarning {
	return {
		level: "warn",
		code: "ASSET_UNRESOLVED",
		message: `Asset "${assetId}" could not be resolved during React export and was omitted.`,
		...(nodeId ? { nodeId } : {}),
	};
}

function isAssetResolutionError(
	error: unknown,
): error is Error & { assetId: string } {
	return (
		error instanceof Error &&
		error.name === "AssetResolutionError" &&
		typeof (error as { assetId?: unknown }).assetId === "string"
	);
}

function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
		return value;
	}

	Object.freeze(value);
	for (const entry of Object.values(value as Record<string, unknown>)) {
		deepFreeze(entry);
	}

	return value;
}

function cloneDetachedObject<T extends object>(value: T): T {
	return cloneDetachedValue(value, new WeakMap()) as T;
}

function cloneDetachedValue(
	value: unknown,
	seen: WeakMap<object, unknown>,
): unknown {
	if (value === null || typeof value !== "object") {
		return value;
	}

	const existing = seen.get(value);
	if (existing !== undefined) {
		return existing;
	}

	if (Array.isArray(value)) {
		const next: unknown[] = [];
		seen.set(value, next);
		for (const entry of value) {
			next.push(cloneDetachedValue(entry, seen));
		}
		return next;
	}

	const next: Record<string, unknown> = {};
	seen.set(value, next);
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		next[key] = cloneDetachedValue(entry, seen);
	}
	return next;
}
