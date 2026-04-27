import type {
	ExportFormatDefinition,
	StudioHeaderAction,
	StudioPluginContext,
} from "@anvilkit/core/types";

import type { IRBuilder, ReactExportOptions } from "./types.js";

// Convention shared with `@anvilkit/plugin-export-html` (order: 100).
// Bump the next export plugin to 120 to keep the toolbar ordering stable.
const DEFAULT_HEADER_ACTION: Omit<StudioHeaderAction, "onClick"> = {
	id: "export-react",
	label: "Export React",
	icon: "code",
	group: "secondary",
	order: 110,
};

/**
 * Build a header action whose `onClick` actually runs the bound React
 * export format and broadcasts the result.
 *
 * - When `options.buildIR` is provided, the action constructs a
 *   `PageIR` via that builder, runs the export format, and emits
 *   `anvilkit:export:ready` with the resulting payload (host listens
 *   to trigger a download).
 * - Otherwise, the action emits `anvilkit:export:request` so the host
 *   can perform the export end-to-end with its own Puck `Config`.
 */
export function createExportReactHeaderAction(
	format: ExportFormatDefinition<ReactExportOptions>,
	options: ReactExportOptions,
): StudioHeaderAction {
	const buildIR: IRBuilder | undefined = options.buildIR;

	return {
		...DEFAULT_HEADER_ACTION,
		onClick: async (ctx: StudioPluginContext) => {
			if (!buildIR) {
				ctx.log(
					"info",
					"React export requested. Pass a buildIR option to createReactExportPlugin " +
						"to run the export end-to-end, or listen for the anvilkit:export:request " +
						"event to handle it from the host.",
				);
				ctx.emit("anvilkit:export:request", {
					formatId: format.id,
					options,
				});
				return;
			}

			try {
				const ir = await buildIR(ctx);
				const result = await format.run(ir, options);
				ctx.emit("anvilkit:export:ready", {
					formatId: format.id,
					content: result.content,
					filename: result.filename,
					mimeType: format.mimeType,
					warnings: result.warnings,
				});
			} catch (error) {
				ctx.log("error", "React export failed.", {
					message: error instanceof Error ? error.message : String(error),
				});
				throw error;
			}
		},
	};
}

/**
 * Default header action used when the consumer imports
 * `exportReactHeaderAction` directly without going through
 * `createReactExportPlugin`. This shape is preserved for backward
 * compatibility; in production it is superseded by the bound action
 * returned from `createExportReactHeaderAction(format, options)`.
 */
export const exportReactHeaderAction: StudioHeaderAction = {
	...DEFAULT_HEADER_ACTION,
	onClick: async (ctx) => {
		ctx.log(
			"info",
			"React export requested. Use createReactExportPlugin() to obtain a header " +
				"action wired to a concrete format and options.",
		);
		ctx.emit("anvilkit:export:request", { formatId: "react", options: {} });
	},
};
