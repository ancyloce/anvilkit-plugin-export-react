/**
 * @file The compiled-appearance IR transform for the React exporter —
 * this format's ONLY appearance path since `p6-001`.
 *
 * The export runner compiles the exported document through the ONE
 * unified appearance compiler and hands this format the artifact on
 * its run context; this transform rewrites the IR so the existing
 * emitter renders it with no per-node special cases:
 *
 * - nodes the compiler styled on their `root` target are wrapped in a
 *   `div` carrying the compiler's selector attribute PAIR
 *   (`data-ak-style-node` + `data-ak-style-target="root"`) — the same
 *   boundary real component DOM gets from `anvilRootAttrs`. Inner
 *   targets have no matching emitted element (the emitter
 *   approximates component DOM), so they are not wrapped;
 * - the compiled stylesheet rides in as a leading `style` node marked
 *   `data-anvilkit-appearance` — the single injection marker every
 *   rendering surface shares.
 *
 * Pure IR rewrite with type-only core imports — safe in the sync
 * emitter graph (no editor engine, no `check:bundle-budget` impact).
 */

import type {
	CompiledAppearanceArtifact,
	PageIR,
	PageIRNode,
} from "@anvilkit/core/types";

function wrapRootTarget(id: string, node: PageIRNode): PageIRNode {
	return {
		id: `${id}::ak-style-wrap`,
		type: "div",
		props: {
			"data-ak-style-node": id,
			"data-ak-style-target": "root",
		},
		children: [node],
	};
}

/** Rewrite an IR so the emitter renders the compiled v2 appearance. */
export function applyCompiledAppearance(
	ir: PageIR,
	compiled: CompiledAppearanceArtifact,
): PageIR {
	const rootStyled = new Set(
		compiled.styledNodeIds.filter((id) =>
			(compiled.targetManifest[id] ?? []).includes("root"),
		),
	);

	const visit = (node: PageIRNode): PageIRNode => {
		const children = node.children?.map(visit);
		const next = children === undefined ? node : { ...node, children };
		return rootStyled.has(node.id) ? wrapRootTarget(node.id, next) : next;
	};

	const rootChildren = (ir.root.children ?? []).map(visit);
	const children =
		compiled.css === ""
			? rootChildren
			: [
					{
						id: "__ak-appearance-style",
						type: "style",
						props: {
							"data-anvilkit-appearance": "",
							children: compiled.css,
						},
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
