import type { ExportWarning, PageIR, PageIRNode } from "@anvilkit/core/types";

import { type AssetRewrite, collectReactAssets, isAssetPropKey } from "./assets.js";
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

const VALID_JSX_TAG = /^[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)*$/;
const VALID_JSX_ATTR = /^[A-Za-z_][A-Za-z0-9_-]*$/;

interface EmitContext {
	readonly opts: ResolvedReactExportOptions;
	readonly warnings: ExportWarning[];
	readonly assetRewrites: ReadonlyMap<string, AssetRewrite>;
}

function indent(depth: number): string {
	return INDENT.repeat(depth);
}

function renderImport(record: ImportRecord, moduleSystem: "esm" | "cjs"): string {
	if (moduleSystem === "cjs") {
		if (record.kind === "default") {
			return `const ${record.binding} = require(${JSON.stringify(record.source)});`;
		}
		if (record.kind === "named") {
			return `const { ${record.binding} } = require(${JSON.stringify(record.source)});`;
		}
		return `require(${JSON.stringify(record.source)});`;
	}

	switch (record.kind) {
		case "default":
			return `import ${record.binding} from ${JSON.stringify(record.source)};`;
		case "named":
			return `import { ${record.binding} } from ${JSON.stringify(record.source)};`;
		default:
			return `import ${JSON.stringify(record.source)};`;
	}
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

	if (
		ctx.opts.assetStrategy === "static-import" &&
		isAssetPropKey(key) &&
		typeof value === "string"
	) {
		const rewrite = ctx.assetRewrites.get(value);
		if (rewrite) {
			return `${key}={${rewrite.binding}}`;
		}
	}

	const serialized = serializeProp(value, { nodeId, propName: key });
	for (const warning of serialized.warnings) {
		ctx.warnings.push(warning);
	}
	return `${key}=${serialized.value}`;
}

function renderProps(
	node: PageIRNode,
	depth: number,
	ctx: EmitContext,
): { readonly inline: string; readonly block: string } {
	const entries = Object.entries(node.props);
	if (entries.length === 0) {
		return { inline: "", block: "" };
	}

	const parts = entries
		.map(([key, value]) => renderAttribute(key, value, node.id, ctx))
		.filter((part): part is string => part !== null);

	const inline = parts.length > 0 ? ` ${parts.join(" ")}` : "";
	const blockIndent = indent(depth + 1);
	const block = parts.length > 0
		? `\n${parts.map((part) => `${blockIndent}${part}`).join("\n")}\n${indent(depth)}`
		: "";
	return { inline, block };
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
	const { inline, block } = renderProps(node, depth, ctx);

	const hasChildren =
		Array.isArray(node.children) && node.children.length > 0;
	const propSegment = inline.length > 72 && Object.keys(node.props).length > 1
		? block
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

function renderBody(
	ir: PageIR,
	ctx: EmitContext,
	depth: number,
): string {
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
	const returnTypeAnnotation =
		opts.syntax === "tsx" ? ": JSX.Element" : "";
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

	const assetPlan = collectReactAssets(ir, opts.assetStrategy);
	const warnings: ExportWarning[] = [...assetPlan.warnings];
	if (opts.syntax === "tsx" && opts.moduleResolution === "cjs") {
		warnings.push({
			level: "info",
			code: "CJS_REQUIRES_JSX",
			message:
				"Emitting TSX syntax under a CJS module system; consumers must compile the result with a TypeScript toolchain (Node cannot require .tsx directly).",
		});
	}
	const ctx: EmitContext = {
		opts,
		warnings,
		assetRewrites: assetPlan.rewrites,
	};

	const importManifest = opts.includeImports ? collectImports(ir) : { imports: [] };
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
