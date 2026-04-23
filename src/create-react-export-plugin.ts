import type {
	ExportFormatDefinition,
	StudioPlugin,
	StudioPluginMeta,
} from "@anvilkit/core/types";

import { resolveReactAssetUrls } from "./assets.js";
import { emitReact } from "./emitter.js";
import { reactFormat } from "./format-definition.js";
import { exportReactHeaderAction } from "./header-action.js";
import {
	type ReactExportOptions,
	resolveReactExportOptions,
} from "./types.js";

const reactExportPluginMeta: StudioPluginMeta = {
	id: "anvilkit-plugin-export-react",
	name: "React Export",
	version: "1.0.0-beta.0",
	coreVersion: "^0.1.0-alpha",
	description: "Export Puck pages as React (.tsx / .jsx) source files.",
};

/**
 * Build the `StudioPlugin` object for the React export format.
 *
 * The returned plugin contributes exactly one export format
 * (`id: "react"`) and one header action (`id: "export-react"`).
 *
 * Options passed here become the plugin-level defaults. Caller-supplied
 * options at `exportAs("react", opts)` time shallow-merge on top, so
 * call-site overrides win over plugin defaults. When no options are
 * supplied here, the shared `reactFormat` singleton is returned
 * unchanged — preserving referential equality for tests that compare
 * `runtime.exportFormats.get("react") === reactFormat`.
 */
export function createReactExportPlugin(
	opts?: ReactExportOptions,
): StudioPlugin {
	const format: ExportFormatDefinition<ReactExportOptions> =
		opts === undefined || Object.keys(opts).length === 0
			? reactFormat
			: {
					...reactFormat,
					run: async (ir, callOptions, runCtx) => {
						const resolved = resolveReactExportOptions({
							...opts,
							...callOptions,
						});
						const {
							ir: resolvedIr,
							warnings: resolutionWarnings,
						} = await resolveReactAssetUrls(
							ir,
							runCtx?.assetResolvers ?? [],
						);
						const { code, warnings } = emitReact(resolvedIr, resolved);
						const extension = resolved.syntax === "jsx" ? "jsx" : "tsx";
						return {
							content: code,
							filename: `page.${extension}`,
							warnings: [...resolutionWarnings, ...warnings],
						};
					},
				};

	return {
		meta: reactExportPluginMeta,
		register(_ctx) {
			return {
				meta: reactExportPluginMeta,
				exportFormats: [format],
				headerActions: [exportReactHeaderAction],
			};
		},
	};
}
