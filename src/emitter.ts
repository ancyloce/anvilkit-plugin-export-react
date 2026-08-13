import type { ExportWarning, PageIR, PageIRNode } from "@anvilkit/core/types";

import {
	type AssetRewrite,
	collectReactAssets,
	isAssetPropKey,
	walkAssetValue,
} from "./assets/assets.js";
import { collectImports } from "./imports/collect-imports.js";
import { serializeProp } from "./props/serialize-prop.js";
import type {
	EmitReactResult,
	ImportManifest,
	ImportRecord,
	ResolvedReactExportOptions,
} from "./types/types.js";

const ROOT_TYPE = "__root__";
const SUPPORTED_IR_VERSION = "1";
const INDENT = "  ";

/**
 * PascalCase component names, plus the two lowercase intrinsic tags
 * the editor-authoring transform injects (PLAN-0020 CORE-P2-012 wave
 * 2): `div` carries `data-ak-node` style wrappers, `style` carries
 * the authored stylesheet. Deliberately an allowlist, not a general
 * lowercase rule — arbitrary lowercase IR types keep warning as
 * invalid component names, and neither tag produces an import
 * (`collectImports` only maps PascalCase types).
 */
const VALID_JSX_TAG = /^(?:[A-Z][A-Za-z0-9]*|div|style)$/;
const VALID_JSX_ATTR = /^[A-Za-z_][A-Za-z0-9_-]*$/;

// Threshold (in characters of the inline prop segment) above which props
// flip from a single-line JSX attribute layout to a multi-line block
// layout. The multi-line layout is only applied when more than one
// attribute actually renders, so a single long prop stays inline.
const MAX_INLINE_PROP_WIDTH = 72;

interface EmitContext {
	readonly opts: ResolvedReactExportOptions;
	readonly warnings: ExportWarning[];
	readonly assetRewrites: ReadonlyMap<string, AssetRewrite>;
}

function indent(depth: number): string {
	return INDENT.repeat(depth);
}

// Binding form and module system are independent, so the four import
// shapes are a 2x2 product rather than four separate templates:
//   default/named -> `X` or `{ X }`,  esm/cjs -> `import ... from S;`
//   or `const ... = require(S);`.
function renderImport(
	record: ImportRecord,
	moduleSystem: "esm" | "cjs",
): string {
	const source = JSON.stringify(record.source);
	const clause =
		record.kind === "default" ? record.binding : `{ ${record.binding} }`;
	return moduleSystem === "cjs"
		? `const ${clause} = require(${source});`
		: `import ${clause} from ${source};`;
}

function renderImports(
	manifest: ImportManifest,
	assetImports: readonly ImportRecord[],
	moduleSystem: "esm" | "cjs",
): string {
	return [...manifest.imports, ...assetImports]
		.map((record) => renderImport(record, moduleSystem))
		.join("\n");
}

function renderAttribute(
	key: string,
	value: unknown,
	nodeId: string,
	ctx: EmitContext,
): string | null {
	if (!VALID_JSX_ATTR.test(key)) {
		ctx.warnings.push({
			level: "warn",
			code: "INVALID_PROP_NAME",
			message: `Prop key \`${key}\` is not a valid JSX attribute name; omitted.`,
			nodeId,
		});
		return null;
	}

	if (ctx.opts.assetStrategy === "static-import") {
		const rewritten = serializePropWithAssetRewrites(key, value, nodeId, ctx);
		if (rewritten !== null) {
			return `${key}=${rewritten}`;
		}
	}

	const serialized = serializeProp(value, { nodeId, propName: key });
	for (const warning of serialized.warnings) {
		ctx.warnings.push(warning);
	}
	return `${key}=${serialized.value}`;
}

function serializePropWithAssetRewrites(
	key: string,
	value: unknown,
	nodeId: string,
	ctx: EmitContext,
): string | null {
	if (!hasAssetRewrite(value, key, ctx.assetRewrites)) {
		return null;
	}

	const serialized = serializeProp(value, { nodeId, propName: key });
	for (const warning of serialized.warnings) {
		ctx.warnings.push(warning);
	}
	if (serialized.warnings.length > 0) {
		return serialized.value;
	}

	return `{${serializeJsExpressionWithAssetRewrites(
		value,
		key,
		ctx.assetRewrites,
	)}}`;
}

/**
 * Does any asset-keyed string under `value` have a rewrite binding?
 *
 * Reuses `walkAssetValue` — the same traversal `collectReactAssets`
 * used to build `assetRewrites` — rather than restating which keys
 * count and how arrays/nested objects recurse. Its empty-string skip is
 * a no-op here: the rewrite table is keyed by URLs that walker itself
 * yielded, so `""` can never be a key.
 */
function hasAssetRewrite(
	value: unknown,
	key: string,
	assetRewrites: ReadonlyMap<string, AssetRewrite>,
): boolean {
	for (const { url } of walkAssetValue(value, "", key)) {
		if (assetRewrites.has(url)) {
			return true;
		}
	}
	return false;
}

/**
 * Render `value` as a JS expression, substituting an asset binding
 * identifier for any asset-keyed string that has one.
 *
 * Only composites and rewritten strings need bespoke handling —
 * every other case is exactly `JSON.stringify`, including the two the
 * previous per-type switch spelled out by hand: a non-finite number
 * stringifies to `"null"`, and a symbol/function/`undefined` yields
 * `undefined`, which the `?? "null"` restores to the same placeholder
 * the old `default` branch produced. `bigint` is the one input
 * `JSON.stringify` throws on rather than skipping, so it keeps an
 * explicit arm.
 */
function serializeJsExpressionWithAssetRewrites(
	value: unknown,
	key: string | undefined,
	assetRewrites: ReadonlyMap<string, AssetRewrite>,
): string {
	if (typeof value === "string" && key !== undefined && isAssetPropKey(key)) {
		const rewrite = assetRewrites.get(value);
		if (rewrite) {
			return rewrite.binding;
		}
	}

	if (Array.isArray(value)) {
		return `[${value
			.map((entry) =>
				serializeJsExpressionWithAssetRewrites(entry, undefined, assetRewrites),
			)
			.join(",")}]`;
	}

	if (value !== null && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.map(
				([entryKey, entryValue]) =>
					`${JSON.stringify(entryKey)}:${serializeJsExpressionWithAssetRewrites(
						entryValue,
						entryKey,
						assetRewrites,
					)}`,
			)
			.join(",")}}`;
	}

	return (
		(typeof value === "bigint" ? undefined : JSON.stringify(value)) ?? "null"
	);
}

/**
 * Render each prop to its `key=value` segment, dropping the ones
 * `renderAttribute` rejected. Layout (inline vs one-per-line) is the
 * caller's choice, so only the chosen form is ever built.
 */
function renderProps(
	node: PageIRNode,
	depth: number,
	ctx: EmitContext,
): readonly string[] {
	return Object.entries(node.props)
		.map(([key, value]) => renderAttribute(key, value, node.id, ctx))
		.filter((part): part is string => part !== null);
}

function renderNode(node: PageIRNode, depth: number, ctx: EmitContext): string {
	const pad = indent(depth);
	if (!VALID_JSX_TAG.test(node.type)) {
		ctx.warnings.push({
			level: "error",
			code: "INVALID_NODE_TYPE",
			message: `Node type \`${node.type}\` is not a valid JSX component name; emitted as comment.`,
			nodeId: node.id,
		});
		return `${pad}{/* omitted: invalid component type */}`;
	}
	const parts = renderProps(node, depth, ctx);

	const hasChildren = Array.isArray(node.children) && node.children.length > 0;
	const inline = parts.length > 0 ? ` ${parts.join(" ")}` : "";
	const propSegment =
		inline.length > MAX_INLINE_PROP_WIDTH && parts.length > 1
			? `\n${parts.map((part) => `${indent(depth + 1)}${part}`).join("\n")}\n${pad}`
			: inline;

	if (!hasChildren) {
		const closing = propSegment.endsWith("\n" + pad) ? "/>" : " />";
		return `${pad}<${node.type}${propSegment}${closing}`;
	}

	const children = node.children as readonly PageIRNode[];
	const childCode = children
		.map((child) => renderNode(child, depth + 1, ctx))
		.join("\n");

	return `${pad}<${node.type}${propSegment}>\n${childCode}\n${pad}</${node.type}>`;
}

function renderBody(ir: PageIR, ctx: EmitContext, depth: number): string {
	const rootChildren = ir.root.children ?? [];
	if (rootChildren.length === 0) {
		return `${indent(depth)}<></>`;
	}
	if (rootChildren.length === 1) {
		return renderNode(rootChildren[0] as PageIRNode, depth, ctx);
	}
	const children = rootChildren
		.map((child) => renderNode(child, depth + 1, ctx))
		.join("\n");
	return `${indent(depth)}<>\n${children}\n${indent(depth)}</>`;
}

function renderFunctionWrapper(
	body: string,
	opts: ResolvedReactExportOptions,
): string {
	const returnTypeAnnotation = opts.syntax === "tsx" ? ": JSX.Element" : "";
	if (opts.moduleResolution === "cjs") {
		return [
			`function Page()${returnTypeAnnotation} {`,
			`${INDENT}return (`,
			body,
			`${INDENT});`,
			`}`,
			`module.exports = Page;`,
			`module.exports.default = Page;`,
		].join("\n");
	}
	return [
		`export default function Page()${returnTypeAnnotation} {`,
		`${INDENT}return (`,
		body,
		`${INDENT});`,
		`}`,
	].join("\n");
}

/**
 * Emit React source for the given `PageIR`. Mirrors the
 * `plugin-export-html` emitter contract: returns a code string, the
 * dependency manifest, and any warnings collected while walking the
 * tree.
 *
 * The emitter is intentionally dependency-light — the only collabora-
 * tors are:
 *
 * - `collectImports` for component import statements,
 * - `serializeProp` for JSX attribute-value rendering,
 * - `collectReactAssets` for the optional static-import asset pipeline.
 *
 * The caller supplies fully-resolved options (`ResolvedReactExportOptions`).
 * Use `resolveReactExportOptions(raw)` from `./types.ts` to derive
 * them before invoking `emitReact`.
 */
export function emitReact(
	ir: PageIR,
	opts: ResolvedReactExportOptions,
): EmitReactResult {
	if (ir.root.type !== ROOT_TYPE) {
		throw new Error(
			`emitReact: expected root node type "__root__", received "${ir.root.type}"`,
		);
	}
	if (ir.version !== SUPPORTED_IR_VERSION) {
		throw new Error(
			`emitReact: unsupported ir.version "${String(ir.version)}"; expected "${SUPPORTED_IR_VERSION}"`,
		);
	}

	// `static-import` requires the import section to also be emitted —
	// the JSX attributes are rewritten to `prop={asset_<hash>}` bindings
	// that only exist if their `import` statement is also rendered. Fall
	// back to `url-prop` semantics when the consumer disabled imports,
	// and surface a warning so they can disambiguate.
	const effectiveStrategy: ResolvedReactExportOptions["assetStrategy"] =
		!opts.includeImports && opts.assetStrategy === "static-import"
			? "url-prop"
			: opts.assetStrategy;
	const assetPlan = collectReactAssets(ir, effectiveStrategy);
	const warnings: ExportWarning[] = [...assetPlan.warnings];
	if (effectiveStrategy !== opts.assetStrategy) {
		warnings.push({
			level: "warn",
			code: "INVALID_OPTION_COMBINATION",
			message:
				'`assetStrategy: "static-import"` requires `includeImports: true`; falling back to "url-prop" semantics for assets.',
		});
	}
	if (opts.syntax === "tsx" && opts.moduleResolution === "cjs") {
		warnings.push({
			level: "info",
			code: "CJS_REQUIRES_JSX",
			message:
				"Emitting TSX syntax under a CJS module system; consumers must compile the result with a TypeScript toolchain (Node cannot require .tsx directly).",
		});
	}
	const effectiveOpts: ResolvedReactExportOptions = {
		...opts,
		assetStrategy: effectiveStrategy,
	};
	const ctx: EmitContext = {
		opts: effectiveOpts,
		warnings,
		assetRewrites: assetPlan.rewrites,
	};

	const importManifest = opts.includeImports
		? collectImports(ir)
		: { imports: [] };
	const importSection = opts.includeImports
		? renderImports(importManifest, assetPlan.imports, opts.moduleResolution)
		: "";

	const body = renderBody(ir, ctx, 2);
	const fn = renderFunctionWrapper(body, opts);

	const segments: string[] = [];
	if (importSection.length > 0) {
		segments.push(importSection);
	}
	segments.push(fn);
	const code = `${segments.join("\n\n")}\n`;

	const combinedManifest: ImportManifest = {
		imports: [...importManifest.imports, ...assetPlan.imports],
	};

	return {
		code,
		imports: combinedManifest,
		warnings,
	};
}
