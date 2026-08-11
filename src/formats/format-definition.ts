import type {
	EditorExportCapabilities,
	ExportFormatDefinition,
} from "@anvilkit/core/types";

import { resolveReactAssetUrls } from "../assets/assets.js";
import { applyCompiledAppearance } from "../editor/compiled-transform.js";
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
 * The emission path is the ONE compiled-appearance pipeline the
 * editor, preview and production rendering already consume: the
 * export runner compiles the exported document and hands this format
 * `runCtx.compiledAppearance`, and `editor/compiled-transform.ts`
 * rewrites the IR so the existing emitter renders it — the compiled
 * stylesheet as a leading `data-anvilkit-appearance` `<style>` node
 * over `data-ak-style-node` / `data-ak-style-target="root"` wrappers.
 * It is a pure IR rewrite with type-only core imports, so no editor
 * engine reaches the entry chunk.
 *
 * **`localComponents` and `variants` are declared but NOT re-certified
 * (`p6-001` → `p8-007`, `ED-FA-014`).** Their only emission path was
 * the sidecar transform this task deleted — the identical dependency
 * that caused the HTML format to withdraw both ids on 2026-08-06
 * (see `plugin-export-html/src/format/format-definition.ts`). The
 * withdraw-or-certify decision needs a **carrier-document proof**,
 * which is a test, and PLAN-0028 §2 defers tests to P8; `p8-007` owns
 * it. Until then, treat these two ids as an unproven claim, not as
 * certified support.
 *
 * Still unsupported, and therefore still blocking (DD-DEC-018):
 * - `richText` — `TiptapDocument` props would serialize as object
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
		// The export runner compiled the exact exported document through
		// the ONE unified appearance compiler and handed the artifact
		// here; emit its CSS and target attributes rather than resolving
		// node styles independently. A document the runner did not compile
		// carries no appearance, and emits byte-identically to the
		// pre-editor output. Pure IR rewrite — no editor engine load, so
		// the entry chunk stays budget-clean.
		const compiled = runCtx?.compiledAppearance;
		const finalIr =
			compiled === undefined
				? resolvedIr
				: applyCompiledAppearance(resolvedIr, compiled);
		const { code, warnings } = emitReact(finalIr, resolved);
		const extension = resolved.syntax === "jsx" ? "jsx" : "tsx";
		return {
			content: code,
			filename: `page.${extension}`,
			warnings: [...resolutionWarnings, ...warnings],
		};
	},
};
