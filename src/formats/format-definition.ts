import type {
	EditorExportCapabilities,
	ExportFormatDefinition,
} from "@anvilkit/core/types";

import { resolveReactAssetUrls } from "../assets/assets.js";
import { emitReact } from "../emitter.js";
import {
	type ReactExportOptions,
	resolveReactExportOptions,
} from "../types/types.js";

/**
 * Editor capabilities this format actually supports (DD-0019 §23.2;
 * DD-DEC-018; PLAN-0020 CORE-P2-012 — exporter certification wave 2;
 * REVIEW-0019 P0).
 *
 * Every id listed here is backed by real emitter work **and a
 * positive certification fixture** in `editor-certification.test.ts`
 * — nothing enters this list ahead of its fixture. The emission path
 * is the shared core consumer (`buildExportAuthoring`) plus an IR
 * transform (`editor/authored-transform.ts`): authored styles ride
 * in as a `<style>` element over `data-ak-node` div wrappers, and
 * component instances render as their materialized §24.4 subtrees.
 * The editor path loads through a dynamic `import()` in `run` and
 * shares nothing with the sync graph, so the engine stays out of the
 * entry chunk; this literal is the entry-side cost, paid for by
 * de-duplicating the run pipeline out of `plugin.ts`.
 *
 * Still unsupported, and therefore still blocking (DD-DEC-018):
 * - `richText` — `TiptapDocumentV1` props would serialize as object
 *   literals the target components cannot render;
 * - `interactions` / `bindings` — runtime behaviour the emitted
 *   static page cannot carry.
 */
export const REACT_EDITOR_CAPABILITIES: EditorExportCapabilities = {
	version: "1",
	supportedFeatures: [
		"responsive",
		"tokens",
		"styleDefinitions",
		"localComponents",
		"variants",
	],
};

export const reactFormat: ExportFormatDefinition<ReactExportOptions> = {
	id: "react",
	editorCapabilities: REACT_EDITOR_CAPABILITIES,
	labelKey: "exportReact.format.react",
	label: "React (.tsx)",
	extension: "tsx",
	mimeType: "text/plain",
	run: async (ir, options, runCtx) => {
		const resolved = resolveReactExportOptions(options);
		const { ir: resolvedIr, warnings: resolutionWarnings } =
			await resolveReactAssetUrls(ir, runCtx?.assetResolvers ?? []);
		// Editor authoring rides on `root.props.__anvilkit`; only then is
		// the editor chunk loaded, and documents without it emit
		// byte-identically to the pre-editor output.
		const authored =
			resolvedIr.root.props.__anvilkit === undefined
				? undefined
				: (await import("../editor/apply.js")).applyAuthoring(resolvedIr);
		const { code, warnings } = emitReact(authored?.ir ?? resolvedIr, resolved);
		const extension = resolved.syntax === "jsx" ? "jsx" : "tsx";
		return {
			content: code,
			filename: `page.${extension}`,
			warnings: [
				...resolutionWarnings,
				...warnings,
				...(authored?.warnings ?? []),
			],
		};
	},
};
