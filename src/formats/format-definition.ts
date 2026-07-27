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
 * DD-DEC-018; PLAN-0020 §5.1 wave-2 reference exporter).
 *
 * **Deliberately empty, and that is the certified result** — the same
 * assessment `plugin-export-html` records, reached the same way.
 * `emitter.ts` turns PageIR nodes into JSX element calls and prop
 * literals: it emits no `style` prop, no `className`, no stylesheet and
 * no `@media` rule, and it imports neither `@anvilkit/core/editor` nor
 * `@anvilkit/ir/editor`, so it never sees a resolved or materialized
 * authoring model. A document using responsive overrides, tokens,
 * reusable styles, local components or rich text would export as bare
 * components with the author's work silently missing. Blocking is
 * correct until the emitter consumes the resolved page model.
 *
 * Declaring this explicitly rather than omitting the field is the
 * point. Under DD-DEC-018 an absent declaration and an assessed-empty
 * one gate identically — but before this existed, `grep
 * editorCapabilities` over this package returned nothing, so a consumer
 * hitting the block had no way to tell a deliberate assessment from an
 * exporter nobody had looked at. The accompanying
 * `editor-certification.test.ts` is what makes the assessment a
 * standing claim instead of a comment.
 *
 * Unlocking each feature is real emitter work (EP-17), and each ID may
 * only join `supportedFeatures` once a positive certification fixture
 * proves that feature exports correctly and deterministically.
 */
export const REACT_EDITOR_CAPABILITIES: EditorExportCapabilities = {
	version: "1",
	supportedFeatures: [],
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
		const { code, warnings } = emitReact(resolvedIr, resolved);
		const extension = resolved.syntax === "jsx" ? "jsx" : "tsx";
		return {
			content: code,
			filename: `page.${extension}`,
			warnings: [...resolutionWarnings, ...warnings],
		};
	},
};
