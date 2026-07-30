/**
 * Async entry for the React exporter's editor-authoring path
 * (PLAN-0020 CORE-P2-012 wave 2; REVIEW-0019 P0).
 *
 * `formats/format-definition.ts` reaches this module only through a
 * dynamic `import()`, and this module's only imports are
 * `@anvilkit/core` (external) and the transform beside it — nothing
 * from the sync emitter graph. That keeps it a fully self-contained
 * async chunk: the core editor engine (and zod) stay out of the
 * entry chunk, and no shared sync chunk appears that would let entry
 * bytes escape `check:bundle-budget`'s measurement.
 */

import { buildExportAuthoring } from "@anvilkit/core/editor";
import type { ExportWarning, PageIR } from "@anvilkit/core/types";
import { applyExportAuthoring } from "./authored-transform.js";

/** The transformed IR plus authoring warnings, ready to emit. */
export interface AppliedAuthoring {
	readonly ir: PageIR;
	readonly warnings: readonly ExportWarning[];
}

/**
 * Read the sidecar and rewrite the IR for emission. Documents whose
 * sidecar turns out to carry no authoring content return the input
 * IR unchanged — the emitter output stays byte-identical.
 */
export function applyAuthoring(ir: PageIR): AppliedAuthoring {
	const authored = buildExportAuthoring(ir);
	if (authored === undefined) {
		return { ir, warnings: [] };
	}
	return {
		ir: applyExportAuthoring(ir, authored),
		warnings: authored.warnings,
	};
}
