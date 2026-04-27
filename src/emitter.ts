import type { ExportWarning, PageIR, PageIRNode } from "@anvilkit/core/types";

import {
	type AssetRewrite,
	collectReactAssets,
	isAssetPropKey,
} from "./assets.js";
import { collectImports } from "./collect-imports.js";
import { serializeProp } from "./serialize-prop.js";
import type {
	EmitReactResult,
	ImportManifest,
	ImportRecord,
	ResolvedReactExportOptions,
} from "./types.js";

const ROOT_TYPE = "__root__";
const SUPPORTED_IR_VERSION = "1";
const INDENT = "  ";

const VALID_JSX_TAG = /^[A-Z][A-Za-z0-9]*$/;
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

function renderImport(
	record: ImportRecord,
	moduleSystem: "esm" | "cjs",
): string {
	if (moduleSystem === "cjs") {
		if (record.kind === "default") {
			return `const ${record.binding} = require(${JSON.stringify(record.source)});`;
		}
		return `const { ${record.binding} } = require(${JSON.stringify(record.source)});`;
	}

	if (record.kind === "default") {
		return `import ${record.binding} from ${JSON.stringify(record.source)};`;
	}
	return `import { ${record.binding} } from ${JSON.stringify(record.source)};`;
}

function renderImports(
	manifest: ImportManifest,
	assetImports: readonly ImportRecord[],
	moduleSystem: "esm" | "cjs",
): string {
	const rendered: string[] = [];
	for (const record of manifest.imports) {
		rendered.push(renderImport(record, moduleSystem));
	}
	for (const record of assetImports) {
		rendered.push(renderImport(record, moduleSystem));
	}
	return rendered.join("\n");
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
	if (!hasAssetRewrite(value, key, ctx.assetRewrites, new WeakSet())) {
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

function hasAssetRewrite(
	value: unknown,
	key: string | undefined,
	assetRewrites: ReadonlyMap<string, AssetRewrite>,
	seen: WeakSet<object>,
): boolean {
	if (Array.isArray(value)) {
		if (seen.has(value)) {
			return false;
		}
		seen.add(value);
		return value.some((entry) =>
			hasAssetRewrite(entry, undefined, assetRewrites, seen),
		);
	}

	if (typeof value === "string") {
		return key !== undefined && isAssetPropKey(key) && assetRewrites.has(value);
	}

	if (value === null || typeof value !== "object") {
		return false;
	}
	if (seen.has(value)) {
		return false;
	}
	seen.add(value);

	return Object.entries(value as Record<string, unknown>).some(
		([entryKey, entryValue]) =>
			hasAssetRewrite(entryValue, entryKey, assetRewrites, seen),
	);
}

function serializeJsExpressionWithAssetRewrites(
	value: unknown,
	key: string | undefined,
	assetRewrites: ReadonlyMap<string, AssetRewrite>,
): string {
	if (value === null) {
		return "null";
	}

	switch (typeof value) {
		case "string": {
			const rewrite =
				key !== undefined && isAssetPropKey(key)
					? assetRewrites.get(value)
					: undefined;
			return rewrite ? rewrite.binding : JSON.stringify(value);
		}
		case "number":
			return Number.isFinite(value) ? String(value) : "null";
		case "boolean":
			return value ? "true" : "false";
		case "object":
			if (Array.isArray(value)) {
				return `[${value
					.map((entry) =>
						serializeJsExpressionWithAssetRewrites(
							entry,
							undefined,
							assetRewrites,
						),
					)
					.join(",")}]`;
			}
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
		default:
			return "null";
	}
}

function renderProps(
	node: PageIRNode,
	depth: number,
	ctx: EmitContext,
): { readonly inline: string; readonly block: string; readonly count: number } {
	const entries = Object.entries(node.props);
	if (entries.length === 0) {
		return { inline: "", block: "", count: 0 };
	}

	const parts = entries
		.map(([key, value]) => renderAttribute(key, value, node.id, ctx))
		.filter((part): part is string => part !== null);

	const inline = parts.length > 0 ? ` ${parts.join(" ")}` : "";
	const blockIndent = indent(depth + 1);
	const block =
		parts.length > 0
			? `\n${parts.map((part) => `${blockIndent}${part}`).join("\n")}\n${indent(depth)}`
			: "";
	return { inline, block, count: parts.length };
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
	const { inline, block, count } = renderProps(node, depth, ctx);

	const hasChildren = Array.isArray(node.children) && node.children.length > 0;
	const propSegment =
		inline.length > MAX_INLINE_PROP_WIDTH && count > 1 ? block : inline;

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
