/**
 * Editor-authoring IR transform for the React exporter (PLAN-0020
 * CORE-P2-012 wave 2; DD-0019 §23.1-§23.2; REVIEW-0019 P0).
 *
 * Consumes the shared exporter-side model from core
 * (`buildExportAuthoring`) and rewrites the IR so the existing
 * emitter renders editor features with no per-node special cases:
 *
 * - instance placeholders are replaced by their materialized §24.4
 *   subtrees (runtime ids intact, imports collected naturally from
 *   the materialized component types);
 * - styled nodes are wrapped in `div` nodes carrying `data-ak-node`
 *   — the same wrapper `styleTarget` boundary the editor preview and
 *   the HTML exporter use;
 * - the authored stylesheet rides in as a leading `style` node whose
 *   `children` prop is the CSS text.
 *
 * This module is reachable only through the format's dynamic
 * `import()` (see `run-impl.ts`), so the core editor engine stays
 * out of the entry chunk (`check:bundle-budget`).
 */

import type { ExportAuthoring } from "@anvilkit/core/editor";
import type { PageIR, PageIRNode } from "@anvilkit/core/types";

function wrapDiv(id: string, node: PageIRNode): PageIRNode {
	return {
		id: `${id}::wrap`,
		type: "div",
		props: { "data-ak-node": id },
		children: [node],
	};
}

/** Rewrite an IR so the emitter renders the authored document. */
export function applyExportAuthoring(
	ir: PageIR,
	authored: ExportAuthoring,
): PageIR {
	const visitMaterialized = (node: PageIRNode): PageIRNode => {
		const children = node.children?.map(visitMaterialized);
		const next = children === undefined ? node : { ...node, children };
		return authored.styledNodeIds.has(node.id) ? wrapDiv(node.id, next) : next;
	};
	const visit = (node: PageIRNode): PageIRNode => {
		const replacement = authored.instances.get(node.id);
		if (replacement !== undefined) {
			// The wrapper keys off the *page* node id; runtime-id nodes
			// inside the materialized subtree wrap through the recursion.
			const materialized = visitMaterialized(replacement);
			return authored.styledNodeIds.has(node.id)
				? wrapDiv(node.id, materialized)
				: materialized;
		}
		const children = node.children?.map(visit);
		const next = children === undefined ? node : { ...node, children };
		return authored.styledNodeIds.has(node.id) ? wrapDiv(node.id, next) : next;
	};

	const rootChildren = (ir.root.children ?? []).map(visit);
	const children =
		authored.css === ""
			? rootChildren
			: [
					{
						id: "__ak-editor-style",
						type: "style",
						props: { children: authored.css },
					},
					...rootChildren,
				];
	return {
		...ir,
		root: {
			...ir.root,
			...(children.length > 0 ? { children } : {}),
		},
	};
}
